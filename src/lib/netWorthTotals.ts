import type { createAdminClient } from '@/lib/supabase/admin'
import { countableEnvelopeIds, sumLiquid } from '@/lib/envelopeBalances'
import { computeBucketTotals, type ConceptMap } from '@/lib/bucketBalance'

export type NetWorthTotals = {
  liquid_crc: number
  invested_crc: number
  iliquid_crc: number
  liabilities_crc: number
}

/**
 * Mirrors the live computation in patrimonio/page.tsx (bucket balances,
 * liquidez, activos ilíquidos, pasivos) so a snapshot can be captured
 * without a manual "photo" of the page.
 */
export async function computeNetWorthTotals(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  asOfDate?: string, // 'YYYY-MM-DD' — restrict transactions/movements to this date or earlier; omit for "as of now"
): Promise<NetWorthTotals> {
  const [
    { data: bucketRows },
    { data: txs },
    { data: movements },
    { data: envelopes },
    { data: assetRows },
    { data: liabilityRows },
    { data: loansRaw },
  ] = await Promise.all([
    admin.from('user_investment_buckets')
      .select('id, bucket_type, vendors, concept_map, account_id, display_category, baseline_date, baseline_value_crc')
      .eq('user_id', userId)
      .eq('is_active', true),
    (() => {
      let q = admin.from('transactions')
        .select('date, vendor, concept, movement_type, expense_group, is_settlement, is_passive_income, amount, investment_bucket_id')
        .eq('user_id', userId)
        .not('amount', 'is', null)
        // PostgREST caps unpaginated selects at 1000 rows silently — this user
        // has ~8,800 transactions, so this was quietly truncating.
        .range(0, 49999)
      if (asOfDate) q = q.lte('date', asOfDate)
      return q
    })(),
    (() => {
      let q = admin.from('envelope_movements')
        .select('amount, movement_type, envelope_id')
        .eq('user_id', userId)
      if (asOfDate) q = q.lte('date', asOfDate)
      return q
    })(),
    admin.from('savings_envelopes')
      .select('id, parent_envelope_id')
      .eq('user_id', userId)
      .eq('is_active', true),
    admin.from('assets')
      .select('value_crc')
      .eq('user_id', userId)
      .eq('is_active', true),
    admin.from('liabilities')
      .select('current_balance')
      .eq('user_id', userId)
      .eq('is_active', true),
    admin.from('loans')
      .select('current_balance, currency_code')
      .eq('user_id', userId)
      .eq('is_active', true),
  ])

  const snapshotBuckets = (bucketRows ?? []).filter(b => b.bucket_type === 'snapshot_based' && b.account_id)
  const snapshotResults = await Promise.all(
    snapshotBuckets.map(async b => {
      let q = admin
        .from('account_balance_snapshots')
        .select('real_balance')
        .eq('account_id', b.account_id!)
      if (asOfDate) q = q.lte('snapshot_date', asOfDate)
      const { data } = await q.order('snapshot_date', { ascending: false }).limit(1).maybeSingle()
      return { id: b.id, balance: data?.real_balance ? Number(data.real_balance) : 0 }
    })
  )
  const snapshotBalances: Record<string, number> = Object.fromEntries(snapshotResults.map(r => [r.id, r.balance]))

  const liquidBalance = sumLiquid(movements ?? [], countableEnvelopeIds(envelopes ?? []))

  let totalInvested = 0
  for (const def of bucketRows ?? []) {
    if (def.bucket_type === 'snapshot_based') {
      totalInvested += snapshotBalances[def.id] ?? 0
      continue
    }
    totalInvested += computeBucketTotals(
      { ...def, concept_map: def.concept_map as unknown as ConceptMap | null },
      txs ?? []
    ).balance
  }

  const iliquidTotal = (assetRows ?? []).reduce((s, a) => s + Number(a.value_crc), 0)

  const exchangeRate = await import('@/lib/exchange-rate').then(m => m.fetchExchangeRate())
  const loansCRCTotal = (loansRaw ?? []).reduce((s, l) =>
    s + (l.currency_code === 'USD' ? Number(l.current_balance) * exchangeRate.sell : Number(l.current_balance)), 0)
  const manualLiabTotal = (liabilityRows ?? []).reduce((s, l) => s + Number(l.current_balance), 0)

  return {
    liquid_crc: liquidBalance,
    invested_crc: totalInvested,
    iliquid_crc: iliquidTotal,
    liabilities_crc: loansCRCTotal + manualLiabTotal,
  }
}
