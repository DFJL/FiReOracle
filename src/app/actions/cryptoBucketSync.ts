'use server'

// Live balance sync for a snapshot_based bucket backed by DeFiReTracker
// portfolios (crypto_portfolio_links), e.g. Crypto / DeFi. Same role as the
// manual "Actualizar" flow for IBKR, just computed instead of typed in —
// weights each linked portfolio by its stored ownership %, values it with
// the ported aggregatePortfolio formula and live DeFiLlama prices, and
// writes the result into account_balance_snapshots + account_positions.

import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { computeAssetPnl, aggregatePortfolio, fetchLivePrices, type CryptoTx, type AssetPnl } from '@/lib/cryptoPortfolio'
import { revalidatePath } from 'next/cache'

function createCryptoAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'crypto' } }
  )
}

type Link = { bucket_id: string; portfolio_id: string; ownership_pct: number; user_id: string }
type CryptoTxRow = { portfolio_id: string; asset_id: string | null; type: string; qty: number; price_usd: number; fee_usd: number | null; date: string }
type CryptoAsset = { id: string; coingecko_id: string | null; symbol: string; category: string | null }

export async function syncCryptoBucketBalance(): Promise<
  { synced: number; error?: undefined } | { error: string; synced?: undefined }
> {
  const admin = createAdminClient()
  const crypto = createCryptoAdminClient()

  const { data: links, error: linksError } = await admin
    .from('crypto_portfolio_links')
    .select('bucket_id, portfolio_id, ownership_pct, user_id')
    .eq('is_active', true)
  if (linksError) return { error: linksError.message }
  if (!links || links.length === 0) return { synced: 0 }

  const byBucket = new Map<string, Link[]>()
  for (const l of links as Link[]) {
    const arr = byBucket.get(l.bucket_id) ?? []
    arr.push(l)
    byBucket.set(l.bucket_id, arr)
  }

  const { data: buckets } = await admin
    .from('user_investment_buckets')
    .select('id, account_id, user_id')
    .in('id', [...byBucket.keys()])
  const bucketById = new Map((buckets ?? []).map(b => [b.id, b]))

  const portfolioIds = [...new Set((links as Link[]).map(l => l.portfolio_id))]

  // crypto.transactions already has 1,461+ rows — PostgREST caps unpaginated
  // selects at 1000 silently, so this must be paginated like the FireOracle
  // transactions fetches elsewhere.
  const { data: txs, error: txError } = await crypto
    .from('transactions')
    .select('portfolio_id, asset_id, type, qty, price_usd, fee_usd, date')
    .in('portfolio_id', portfolioIds)
    .range(0, 49999)
  if (txError) return { error: txError.message }

  const assetIds = [...new Set((txs as CryptoTxRow[] ?? []).map(t => t.asset_id).filter((id): id is string => !!id))]
  const { data: assets, error: assetsError } = await crypto
    .from('assets')
    .select('id, coingecko_id, symbol, category')
    .in('id', assetIds)
  if (assetsError) return { error: assetsError.message }

  const assetById = new Map((assets as CryptoAsset[] ?? []).map(a => [a.id, a]))
  const coingeckoIds = [...new Set((assets as CryptoAsset[] ?? []).map(a => a.coingecko_id).filter((id): id is string => !!id))]
  const prices = await fetchLivePrices(coingeckoIds)

  // A total DeFiLlama outage would otherwise zero out every held asset's
  // value and silently wipe a real balance — bail instead of writing junk.
  if (coingeckoIds.length > 0 && Object.keys(prices).length === 0) {
    return { error: 'DeFiLlama no devolvió precios — no se escribió nada para no pisar el balance real con $0' }
  }

  function portfolioAssetRows(portfolioId: string): { symbol: string; pnl: AssetPnl }[] {
    const byAsset = new Map<string, CryptoTxRow[]>()
    for (const t of (txs as CryptoTxRow[] ?? [])) {
      if (t.portfolio_id !== portfolioId || !t.asset_id) continue
      const arr = byAsset.get(t.asset_id) ?? []
      arr.push(t)
      byAsset.set(t.asset_id, arr)
    }
    const rows: { symbol: string; pnl: AssetPnl }[] = []
    for (const [assetId, assetTxs] of byAsset) {
      const asset = assetById.get(assetId)
      if (!asset) continue
      const price = asset.coingecko_id ? prices[asset.coingecko_id] ?? null : null
      rows.push({ symbol: asset.symbol, pnl: computeAssetPnl(assetTxs as CryptoTx[], price) })
    }
    return rows
  }

  const rate = await fetchExchangeRate()
  const today = new Date().toISOString().slice(0, 10)
  const errors: string[] = []
  let synced = 0

  for (const [bucketId, bucketLinks] of byBucket) {
    const bucket = bucketById.get(bucketId)
    if (!bucket?.account_id) { errors.push(`Bucket ${bucketId} no tiene account_id (¿no es snapshot_based?)`); continue }
    const accountId: string = bucket.account_id
    const bucketUserId: string = bucket.user_id

    let totalValueUsd = 0
    const positions = new Map<string, { symbol: string; qty: number; value: number; cost: number }>()

    for (const link of bucketLinks) {
      const pct = Number(link.ownership_pct) / 100
      const rows = portfolioAssetRows(link.portfolio_id)
      totalValueUsd += aggregatePortfolio(rows.map(r => r.pnl)).totalValue * pct

      for (const r of rows) {
        if (r.pnl.qty <= 0) continue
        const existing = positions.get(r.symbol) ?? { symbol: r.symbol, qty: 0, value: 0, cost: 0 }
        existing.qty += r.pnl.qty * pct
        existing.value += (r.pnl.currentValue ?? 0) * pct
        existing.cost += r.pnl.costBasis * pct
        positions.set(r.symbol, existing)
      }
    }

    const { error: snapError } = await admin.from('account_balance_snapshots').upsert(
      {
        user_id: bucketUserId,
        account_id: accountId,
        snapshot_date: today,
        real_balance: +(totalValueUsd * rate.sell).toFixed(2),
        real_balance_native: +totalValueUsd.toFixed(2),
        period_label: 'crypto-sync',
        notes: `Sync automático desde DeFiReTracker · $${totalValueUsd.toFixed(2)} USD @ ₡${rate.sell}/USD (${rate.source})`,
      },
      { onConflict: 'account_id,snapshot_date' }
    )
    if (snapError) { errors.push(snapError.message); continue }

    // Carry forward any manual portfolio-model categorization, same pattern
    // as the IBKR sync (positions have no stable id to upsert against).
    const { data: existingPositions } = await admin
      .from('account_positions')
      .select('symbol, portfolio_model_category')
      .eq('account_id', accountId)
    const categoryBySymbol = new Map((existingPositions ?? []).map(p => [p.symbol, p.portfolio_model_category]))

    await admin.from('account_positions').delete().eq('account_id', accountId)

    const posRows = [...positions.values()].filter(p => p.qty > 0).map(p => ({
      user_id: bucketUserId,
      account_id: accountId,
      symbol: p.symbol,
      quantity: p.qty,
      market_value_usd: +p.value.toFixed(2),
      avg_cost_usd: p.qty > 0 ? +(p.cost / p.qty).toFixed(6) : null,
      portfolio_model_category: categoryBySymbol.get(p.symbol) ?? null,
    }))
    if (posRows.length > 0) {
      const { error: posError } = await admin.from('account_positions').insert(posRows)
      if (posError) errors.push(posError.message)
    }

    synced++
  }

  revalidatePath('/inversiones')
  revalidatePath('/patrimonio')
  if (errors.length > 0) return { error: errors.join('; ') }
  return { synced }
}
