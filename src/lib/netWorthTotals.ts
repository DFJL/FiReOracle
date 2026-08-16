import type { createAdminClient } from '@/lib/supabase/admin'

type ConceptMap = {
  depositConcepts: string[]
  rendimientosConcepts: string[]
  valorizacionConcepts: string[]
  liquidacionConcepts: string[]
}

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
      .select('id, bucket_type, vendors, concept_map, account_id, display_category')
      .eq('user_id', userId)
      .eq('is_active', true),
    (() => {
      let q = admin.from('transactions')
        .select('vendor, concept, movement_type, expense_group, is_settlement, is_passive_income, amount, investment_bucket_id')
        .eq('user_id', userId)
        .not('amount', 'is', null)
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

  const parentEnvelopeIds = new Set(
    (envelopes ?? []).filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string)
  )
  const liquidBalance = (movements ?? [])
    .filter(m => m.movement_type !== 'interes' && !parentEnvelopeIds.has(m.envelope_id))
    .reduce((s, m) => s + Number(m.amount), 0)

  let totalInvested = 0
  for (const def of bucketRows ?? []) {
    if (def.bucket_type === 'snapshot_based') {
      totalInvested += snapshotBalances[def.id] ?? 0
      continue
    }
    let deposits = 0, liquidaciones = 0, rendimientos = 0, passiveValuation = 0
    for (const tx of txs ?? []) {
      const amt = Number(tx.amount ?? 0)
      if (def.bucket_type === 'concept_based' && def.concept_map) {
        const cm = def.concept_map as unknown as ConceptMap
        const c = tx.concept ?? ''
        if ((tx as { investment_bucket_id?: string | null }).investment_bucket_id === def.id) {
          if (tx.movement_type === 'income' && tx.is_settlement) liquidaciones += amt
          else if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) deposits += amt
          else if (tx.is_passive_income && tx.movement_type === 'income') rendimientos += amt
          else if (tx.is_passive_income && !tx.movement_type)             passiveValuation += amt
        } else if (cm.depositConcepts.includes(c))          deposits += amt
        else if (cm.rendimientosConcepts.includes(c)) rendimientos += amt
        else if (cm.valorizacionConcepts.includes(c)) passiveValuation += amt
        else if (cm.liquidacionConcepts.includes(c))  liquidaciones += amt
      } else if (def.bucket_type === 'vendor_based') {
        const txVendor = (tx.vendor ?? '').toLowerCase().trim()
        const vendors = (def.vendors ?? []).map((v: string) => v.toLowerCase())
        if (!vendors.includes(txVendor)) continue
        if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) deposits += amt
        else if (tx.is_settlement)                                               liquidaciones += amt
        else if (tx.is_passive_income && tx.movement_type === 'income')          rendimientos += amt
        else if (tx.is_passive_income && !tx.movement_type)                      passiveValuation += amt
      }
    }
    totalInvested += deposits + passiveValuation + rendimientos - liquidaciones
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
