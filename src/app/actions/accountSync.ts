'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { fetchExchangeRate } from '@/lib/exchange-rate'

export type PositionInput = {
  symbol: string
  quantity: number
  market_value_usd: number
  avg_cost_usd?: number | null
}

export async function getAccountSyncData(accountId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const }

  const admin = createAdminClient()
  const [{ data: account }, { data: snapshot }, { data: positions }] = await Promise.all([
    admin.from('financial_accounts').select('id, name, currency_code')
      .eq('id', accountId).eq('user_id', user.id).maybeSingle(),
    admin.from('account_balance_snapshots').select('real_balance_native, snapshot_date')
      .eq('account_id', accountId).order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
    admin.from('account_positions').select('symbol, quantity, market_value_usd, avg_cost_usd')
      .eq('account_id', accountId).order('market_value_usd', { ascending: false }),
  ])
  if (!account) return { error: 'Cuenta no encontrada' as const }

  // Exact value from the last time someone actually looked at the real account —
  // never re-derived from a CRC↔native reconversion, which drifts with the FX rate.
  const lastBalanceNative = snapshot?.real_balance_native != null ? Number(snapshot.real_balance_native) : null

  return {
    account,
    lastSnapshotDate: snapshot?.snapshot_date ?? null,
    lastBalanceNative,
    positions: (positions ?? []) as PositionInput[],
  }
}

export async function syncAccountBalance(accountId: string, input: {
  real_balance_native: number
  positions: PositionInput[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: account } = await admin.from('financial_accounts')
    .select('id, currency_code').eq('id', accountId).eq('user_id', user.id).maybeSingle()
  if (!account) return { error: 'Cuenta no encontrada' }

  const rate = await fetchExchangeRate()
  const realBalance = account.currency_code === 'USD'
    ? input.real_balance_native * rate.sell
    : input.real_balance_native

  const today = new Date().toISOString().slice(0, 10)

  const { error: snapError } = await admin.from('account_balance_snapshots').upsert(
    {
      user_id: user.id,
      account_id: accountId,
      snapshot_date: today,
      real_balance: realBalance,
      real_balance_native: input.real_balance_native,
      period_label: 'sync-app',
      notes: account.currency_code === 'USD'
        ? `Sync manual desde app · $${input.real_balance_native.toFixed(2)} USD @ ₡${rate.sell}/USD (${rate.source})`
        : 'Sync manual desde app',
    },
    { onConflict: 'account_id,snapshot_date' }
  )
  if (snapError) return { error: snapError.message }

  const { error: delError } = await admin.from('account_positions').delete().eq('account_id', accountId)
  if (delError) return { error: delError.message }

  const cleanPositions = input.positions.filter(p => p.symbol.trim())
  if (cleanPositions.length > 0) {
    const { error: insError } = await admin.from('account_positions').insert(
      cleanPositions.map(p => ({
        user_id: user.id,
        account_id: accountId,
        symbol: p.symbol.trim().toUpperCase(),
        quantity: p.quantity,
        market_value_usd: p.market_value_usd,
        avg_cost_usd: p.avg_cost_usd ?? null,
      }))
    )
    if (insError) return { error: insError.message }
  }

  revalidatePath('/inversiones')
  revalidatePath('/patrimonio')
  revalidatePath('/configuracion')
}
