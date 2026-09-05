import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PatrimonioView } from './PatrimonioView'
import type { SnapshotRow } from '@/app/actions/netWorthSnapshot'
import type { NetWorthItem } from '@/app/actions/netWorthItems'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { countableEnvelopeIds, sumLiquid } from '@/lib/envelopeBalances'
import { computeBucketTotals, type ConceptMap } from '@/lib/bucketBalance'

export default async function PatrimonioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [
    { data: bucketRows },
    { data: txs },
    { data: movements },
    { data: envelopes },
    { data: assetRows },
    { data: liabilityRows },
    { data: loansRaw },
    { data: snapshotRows },
    { data: itemRows },
  ] = await Promise.all([
    admin.from('user_investment_buckets')
      .select('id, name, bucket_type, vendors, concept_map, account_id, display_category, baseline_date, baseline_value_crc')
      .eq('user_id', user.id)
      .eq('is_active', true),
    admin.from('transactions')
      .select('vendor, concept, movement_type, expense_group, is_settlement, is_passive_income, amount, date, investment_bucket_id')
      .eq('user_id', user.id)
      .not('amount', 'is', null)
      // PostgREST caps unpaginated selects at 1000 rows silently — this user
      // has ~8,800 transactions, so this was quietly truncating.
      .range(0, 49999),
    admin.from('envelope_movements')
      .select('amount, date, movement_type, envelope_id')
      .eq('user_id', user.id),
    admin.from('savings_envelopes')
      .select('id, name, parent_envelope_id')
      .eq('user_id', user.id)
      .eq('is_active', true),
    admin.from('assets')
      .select('id, name, asset_type, value_crc, as_of_date, is_investable, is_active, notes')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin.from('liabilities')
      .select('id, name, liability_type, current_balance, original_balance, interest_rate, is_active, as_of_date')
      .eq('user_id', user.id)
      .eq('is_active', true),
    admin.from('loans')
      .select('id, name, lender, loan_type, currency_code, current_balance, interest_rate')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin.from('net_worth_snapshots')
      .select('id, snapshot_date, liquid_crc, invested_crc, iliquid_crc, liabilities_crc, net_worth_crc, notes, source')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true }),
    admin.from('net_worth_items')
      .select('id, snapshot_date, category, item_name, value_crc, sort_order')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: false })
      .limit(500),
  ])

  // Snapshot bucket balances (fetch in parallel for all snapshot buckets)
  const snapshotBuckets = (bucketRows ?? []).filter(b => b.bucket_type === 'snapshot_based' && b.account_id)
  const snapshotResults = await Promise.all(
    snapshotBuckets.map(async b => {
      const { data } = await admin
        .from('account_balance_snapshots')
        .select('real_balance')
        .eq('account_id', b.account_id!)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      return { id: b.id, balance: data?.real_balance ? Number(data.real_balance) : 0 }
    })
  )
  const snapshotBalances: Record<string, number> = Object.fromEntries(snapshotResults.map(r => [r.id, r.balance]))

  // Liquid balance — canonical rule shared with /auditoria and /liquidez
  const countableIds = countableEnvelopeIds(envelopes ?? [])
  const liquidBalance = sumLiquid(movements ?? [], countableIds)

  // Investment total across all bucket types — split by display_category so
  // pension/severance funds (ROP & FCL, Pensión Voluntaria) land under
  // "Fondos & Pensiones" instead of "Inversiones"
  // Single pass per bucket — feeds both the aggregate totals and the
  // per-bucket breakdown below, instead of two independently-drifting copies
  // of the same formula (patrimonio used to compare concepts case-sensitively
  // while inversiones didn't — same bug class as everything else fixed today).
  const bucketBalances: Record<string, number> = {}
  for (const def of bucketRows ?? []) {
    bucketBalances[def.id] = def.bucket_type === 'snapshot_based'
      ? (snapshotBalances[def.id] ?? 0)
      : computeBucketTotals({ ...def, concept_map: def.concept_map as unknown as ConceptMap | null }, txs ?? []).balance
  }

  let totalInvested = 0
  let totalPensiones = 0
  for (const def of bucketRows ?? []) {
    const isPension = def.display_category === 'invertido'
    const bal = bucketBalances[def.id] ?? 0
    if (isPension) totalPensiones += bal; else totalInvested += bal
  }

  // Asset/liability aggregates
  const activeAssets       = assetRows ?? []
  const activeLiabilities  = liabilityRows ?? []
  const iliquidTotal       = activeAssets.reduce((s, a) => s + Number(a.value_crc), 0)
  const iliquidInvestable  = activeAssets.filter(a => a.is_investable).reduce((s, a) => s + Number(a.value_crc), 0)
  const activosInvertibles = liquidBalance + totalInvested + totalPensiones + iliquidInvestable

  // Per-envelope balance breakdown (for Liquidez drilldown)
  const envelopeBalanceMap: Record<string, number> = {}
  for (const m of movements ?? []) {
    if (m.movement_type === 'interes' || !countableIds.has(m.envelope_id)) continue
    envelopeBalanceMap[m.envelope_id] = (envelopeBalanceMap[m.envelope_id] ?? 0) + Number(m.amount)
  }
  const envelopeBreakdown = (envelopes ?? [])
    .filter(e => countableIds.has(e.id))
    .map(e => ({ name: (e as { id: string; name: string; parent_envelope_id: string | null }).name ?? e.id, balance: envelopeBalanceMap[e.id] ?? 0 }))
    .filter(e => Math.abs(e.balance) > 0.01)
    .sort((a, b) => b.balance - a.balance)

  // Per-bucket balance breakdown (for Inversiones / Fondos & Pensiones drilldown)
  const bucketBreakdown: { name: string; balance: number }[] = []
  const pensionesBreakdown: { name: string; balance: number }[] = []
  for (const def of bucketRows ?? []) {
    const balance = bucketBalances[def.id] ?? 0
    const defWithName = def as typeof def & { name?: string }
    if (defWithName.name) {
      if (def.display_category === 'invertido') pensionesBreakdown.push({ name: defWithName.name, balance })
      else bucketBreakdown.push({ name: defWithName.name, balance })
    }
  }

  // Monthly trend: liquid + non-snapshot invested running totals
  const bucketDefs = (bucketRows ?? []).filter(b => b.bucket_type !== 'snapshot_based')
  const bucketDeltas: Record<string, Record<string, number>> = {}

  for (const def of bucketDefs) {
    const deltas: Record<string, number> = {}
    bucketDeltas[def.id] = deltas
    for (const tx of txs ?? []) {
      if (!tx.date) continue
      const month = tx.date.slice(0, 7)
      const amt = Number(tx.amount ?? 0)
      let delta = 0
      if (def.bucket_type === 'concept_based' && def.concept_map) {
        const cm = def.concept_map as unknown as ConceptMap
        const c = (tx.concept ?? '').toLowerCase()
        const ci = (arr: string[]) => arr.some(s => s.toLowerCase() === c)
        if ((tx as { investment_bucket_id?: string | null }).investment_bucket_id === def.id) {
          if (tx.movement_type === 'income' && tx.is_settlement) delta = -amt
          else if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) delta = amt
          else if (tx.is_passive_income) delta = amt
        } else if (ci(cm.depositConcepts))           delta = amt
        else if (ci(cm.rendimientosConcepts))  delta = amt
        else if (ci(cm.valorizacionConcepts))  delta = amt
        else if (ci(cm.liquidacionConcepts))   delta = -amt
      } else if (def.bucket_type === 'vendor_based') {
        const txVendor = (tx.vendor ?? '').toLowerCase().trim()
        const vendors = (def.vendors ?? []).map((v: string) => v.toLowerCase())
        if (!vendors.includes(txVendor)) continue
        if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) delta = amt
        else if (tx.is_settlement)                                               delta = -amt
        else if (tx.is_passive_income)                                           delta = amt
      }
      if (delta !== 0) deltas[month] = (deltas[month] ?? 0) + delta
    }
  }

  const liquidezDeltas: Record<string, number> = {}
  for (const m of movements ?? []) {
    if (!m.date || m.movement_type === 'interes' || !countableIds.has(m.envelope_id)) continue
    const month = m.date.slice(0, 7)
    liquidezDeltas[month] = (liquidezDeltas[month] ?? 0) + Number(m.amount)
  }

  const allMonthsSet = new Set<string>()
  for (const deltas of Object.values(bucketDeltas)) Object.keys(deltas).forEach(m => allMonthsSet.add(m))
  Object.keys(liquidezDeltas).forEach(m => allMonthsSet.add(m))

  const monthlyTrend: { month: string; total: number }[] = []

  if (allMonthsSet.size > 0) {
    const earliest = [...allMonthsSet].sort()[0]
    let cursor = new Date(earliest + '-01')
    const nowStr = new Date().toISOString().slice(0, 7)
    const running: Record<string, number> = {}
    let runningLiquidez = 0

    while (cursor.toISOString().slice(0, 7) <= nowStr) {
      const month = cursor.toISOString().slice(0, 7)
      for (const def of bucketDefs) {
        running[def.id] = (running[def.id] ?? 0) + (bucketDeltas[def.id]?.[month] ?? 0)
      }
      runningLiquidez += liquidezDeltas[month] ?? 0
      const bucketTotal = bucketDefs.reduce((s, d) => s + (running[d.id] ?? 0), 0)
      monthlyTrend.push({ month, total: runningLiquidez + bucketTotal })
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
  }

  const exchangeRate = await fetchExchangeRate()

  // Loans from prestamos table (auto-sync into pasivos)
  const loansForPatrimonio = (loansRaw ?? []).map(l => ({
    id:            l.id as string,
    name:          l.name as string,
    lender:        l.lender as string,
    loanType:      (l.loan_type ?? 'other') as string,
    currencyCode:  (l.currency_code ?? 'CRC') as string,
    currentBalance: Number(l.current_balance),
    interestRate:  Number(l.interest_rate),
  }))

  const loansCRCTotal     = loansForPatrimonio.reduce((s, l) =>
    s + (l.currencyCode === 'USD' ? l.currentBalance * exchangeRate.sell : l.currentBalance), 0)
  const manualLiabTotal   = activeLiabilities.reduce((s, l) => s + Number(l.current_balance), 0)
  const totalLiabilities  = loansCRCTotal + manualLiabTotal
  const totalActivos      = liquidBalance + totalInvested + totalPensiones + iliquidTotal
  const patrimonioNeto    = totalActivos - totalLiabilities

  // Deduplicate by item_name: take the most recent entry per item (rows are already DESC by date)
  const allItems = (itemRows ?? []) as NetWorthItem[]
  const seenItemNames = new Set<string>()
  const netWorthItems: NetWorthItem[] = []
  for (const item of allItems) {
    if (!seenItemNames.has(item.item_name)) {
      seenItemNames.add(item.item_name)
      netWorthItems.push(item)
    }
  }
  netWorthItems.sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <PatrimonioView
        liquidBalance={liquidBalance}
        totalInvested={totalInvested}
        iliquidTotal={iliquidTotal}
        iliquidInvestable={iliquidInvestable}
        totalLiabilities={totalLiabilities}
        totalActivos={totalActivos}
        patrimonioNeto={patrimonioNeto}
        activosInvertibles={activosInvertibles}
        assets={activeAssets}
        liabilities={activeLiabilities}
        loans={loansForPatrimonio}
        monthlyTrend={monthlyTrend}
        snapshots={(snapshotRows ?? []) as SnapshotRow[]}
        exchangeRate={exchangeRate}
        netWorthItems={netWorthItems}
        envelopeBreakdown={envelopeBreakdown}
        bucketBreakdown={bucketBreakdown}
        pensionesBreakdown={pensionesBreakdown}
        totalPensiones={totalPensiones}
      />
    </div>
  )
}
