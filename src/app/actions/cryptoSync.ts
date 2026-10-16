'use server'

// Mirrors crypto sells that funded a FireOracle-tracked investment bucket
// directly (e.g. liquidating crypto straight into IBKR) as a display-only
// deposit entry in that bucket's history. The money never touched a
// sobre/account, so there's nothing for the regular transaction flow to
// pick up — this is the only bridge for that one scenario.
//
// Unlike the sheets-sync import (ON CONFLICT DO NOTHING, never revisits a
// reconciled row), this upserts on every run: the source sell can still be
// edited in DeFiReTracker, and a price/qty correction there should flow
// through here too.

import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { revalidatePath } from 'next/cache'

// crypto.* isn't in the generated Database type (it's DeFiReTracker's
// schema, not FireOracle's) — a separate, untyped client pointed at it
// avoids fighting the public-only Database generic for this one read.
function createCryptoAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'crypto' } }
  )
}

type CryptoSell = {
  id: string
  portfolio_id: string
  qty: number
  price_usd: number
  fee_usd: number | null
  date: string
  notes: string | null
  funds_bucket_id: string
  asset: { symbol: string } | { symbol: string }[] | null
}

export async function syncCryptoFundedInvestments(): Promise<
  { synced: number; error?: undefined } | { error: string; synced?: undefined }
> {
  const crypto = createCryptoAdminClient()
  const admin = createAdminClient()

  const { data: sells, error } = await crypto
    .from('transactions')
    .select('id, portfolio_id, qty, price_usd, fee_usd, date, notes, funds_bucket_id, asset:assets(symbol)')
    .eq('type', 'sell')
    .not('funds_bucket_id', 'is', null)

  if (error) return { error: error.message }
  if (!sells || sells.length === 0) return { synced: 0 }

  // Which crypto-linked bucket (e.g. Crypto / DeFi) the sold portfolio
  // itself feeds — lets the sell show up as an outflow on that side too,
  // not just as a deposit in the bucket it funded.
  const { data: links } = await admin
    .from('crypto_portfolio_links')
    .select('bucket_id, portfolio_id')
    .eq('is_active', true)
  const cryptoBucketIdByPortfolio = new Map((links ?? []).map(l => [l.portfolio_id, l.bucket_id]))

  const bucketIds = [...new Set([
    ...(sells as CryptoSell[]).map(s => s.funds_bucket_id),
    ...cryptoBucketIdByPortfolio.values(),
  ])]
  const { data: buckets } = await admin
    .from('user_investment_buckets')
    .select('id, name, user_id')
    .in('id', bucketIds)
  const bucketById = new Map((buckets ?? []).map(b => [b.id, b]))

  const rate = await fetchExchangeRate()

  const rows = (sells as CryptoSell[]).flatMap(s => {
    const bucket = bucketById.get(s.funds_bucket_id)
    if (!bucket) return []

    const proceedsUsd = Number(s.qty) * Number(s.price_usd) - Number(s.fee_usd ?? 0)
    const symbol = (Array.isArray(s.asset) ? s.asset[0]?.symbol : s.asset?.symbol) ?? 'cripto'
    const amountCrc = +(proceedsUsd * rate.sell).toFixed(2)
    const amountUsd = +proceedsUsd.toFixed(2)

    const depositRow = {
      user_id: bucket.user_id,
      external_id: `crypto_sell::${s.id}`,
      date: String(s.date).slice(0, 10),
      vendor: bucket.name,
      concept: `Venta cripto → ${bucket.name}`,
      movement_type: 'expense',
      amount: amountCrc,
      currency_code: 'USD',
      exchange_rate_used: rate.sell,
      amount_usd: amountUsd,
      expense_group: 'objetivos_financieros',
      is_settlement: false,
      is_passive_income: false,
      notes: `Liquidación de ${s.qty} ${symbol} vía DeFiReTracker${s.notes ? ' · ' + s.notes : ''}`,
      // transactions.source has a check constraint allowing only
      // sheets/manual/import/email — this is the closest fit, same as the
      // pre-sync "Inversión IBKR" style entries it replaces.
      source: 'manual',
      investment_bucket_id: bucket.id,
    }

    // Mirror entry on the crypto side, so the outflow is visible there too —
    // display-only like the deposit row above: snapshot_based buckets never
    // read these for their balance (that comes from account_balance_snapshots,
    // fed separately by the live portfolio sync), only for the Historial list.
    const cryptoBucketId = cryptoBucketIdByPortfolio.get(s.portfolio_id)
    const cryptoBucket = cryptoBucketId ? bucketById.get(cryptoBucketId) : null
    if (!cryptoBucket) return [depositRow]

    const mirrorRow = {
      user_id: cryptoBucket.user_id,
      external_id: `crypto_sell_mirror::${s.id}`,
      date: String(s.date).slice(0, 10),
      vendor: cryptoBucket.name,
      concept: `Venta cripto → ${bucket.name}`,
      movement_type: 'income',
      amount: amountCrc,
      currency_code: 'USD',
      exchange_rate_used: rate.sell,
      amount_usd: amountUsd,
      expense_group: 'na',
      is_settlement: true,
      is_passive_income: false,
      notes: `Liquidación de ${s.qty} ${symbol} para financiar ${bucket.name} vía DeFiReTracker${s.notes ? ' · ' + s.notes : ''}`,
      source: 'manual',
      investment_bucket_id: cryptoBucket.id,
    }

    return [depositRow, mirrorRow]
  })

  if (rows.length === 0) return { synced: 0 }

  const { error: upsertError } = await admin
    .from('transactions')
    .upsert(rows, { onConflict: 'external_id' })

  if (upsertError) return { error: upsertError.message }

  revalidatePath('/inversiones')
  revalidatePath('/patrimonio')
  return { synced: rows.length }
}
