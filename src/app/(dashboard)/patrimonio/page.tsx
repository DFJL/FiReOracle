import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PatrimonioView } from './PatrimonioView'
import type { SnapshotRow } from '@/app/actions/netWorthSnapshot'
import type { NetWorthItem } from '@/app/actions/netWorthItems'
import { fetchExchangeRate } from '@/lib/exchange-rate'

type ConceptMap = {
  depositConcepts: string[]
  rendimientosConcepts: string[]
  valorizacionConcepts: string[]
  liquidacionConcepts: string[]
}

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
      .select('id, name, bucket_type, vendors, concept_map, account_id')
      .eq('user_id', user.id)
      .eq('is_active', true),
    admin.from('transactions')
      .select('vendor, concept, movement_type, expense_group, is_settlement, is_passive_income, amount, date, investment_bucket_id')
      .eq('user_id', user.id)
      .not('amount', 'is', null),
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

  // Liquid balance (leaf envelopes only, no interes)
  const parentEnvelopeIds = new Set(
    (envelopes ?? []).filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string)
  )
  const liquidBalance = (movements ?? [])
    .filter(m => m.movement_type !== 'interes' && !parentEnvelopeIds.has(m.envelope_id))
    .reduce((s, m) => s + Number(m.amount), 0)

  // Investment total across all bucket types
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
        } else if (cm.depositConcepts.includes(c))           deposits += amt
        else if (cm.rendimientosConcepts.includes(c))  rendimientos += amt
        else if (cm.valorizacionConcepts.includes(c))  passiveValuation += amt
        else if (cm.liquidacionConcepts.includes(c))   liquidaciones += amt
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

  // Asset/liability aggregates
  const activeAssets       = assetRows ?? []
  const activeLiabilities  = liabilityRows ?? []
  const iliquidTotal       = activeAssets.reduce((s, a) => s + Number(a.value_crc), 0)
  const iliquidInvestable  = activeAssets.filter(a => a.is_investable).reduce((s, a) => s + Number(a.value_crc), 0)
  const activosInvertibles = liquidBalance + totalInvested + iliquidInvestable

  // Per-envelope balance breakdown (for Liquidez drilldown)
  const envelopeBalanceMap: Record<string, number> = {}
  for (const m of movements ?? []) {
    if (m.movement_type === 'interes' || parentEnvelopeIds.has(m.envelope_id)) continue
    envelopeBalanceMap[m.envelope_id] = (envelopeBalanceMap[m.envelope_id] ?? 0) + Number(m.amount)
  }
  const envelopeBreakdown = (envelopes ?? [])
    .filter(e => !parentEnvelopeIds.has(e.id))
    .map(e => ({ name: (e as { id: string; name: string; parent_envelope_id: string | null }).name ?? e.id, balance: envelopeBalanceMap[e.id] ?? 0 }))
    .filter(e => Math.abs(e.balance) > 0.01)
    .sort((a, b) => b.balance - a.balance)

  // Per-bucket balance breakdown (for Inversiones drilldown)
  const bucketBreakdown: { name: string; balance: number }[] = []
  for (const def of bucketRows ?? []) {
    let balance = 0
    if (def.bucket_type === 'snapshot_based') {
      balance = snapshotBalances[def.id] ?? 0
    } else {
      let deposits = 0, liquidaciones = 0, rendimientos = 0, passiveValuation = 0
      for (const tx of txs ?? []) {
        const amt = Number(tx.amount ?? 0)
        if (def.bucket_type === 'concept_based' && def.concept_map) {
          const cm = def.concept_map as unknown as ConceptMap
          const c = tx.concept ?? ''
          if ((tx as { investment_bucket_id?: string | null }).investment_bucket_id === def.id) {
            if (tx.movement_type === 'income' && tx.is_settlement) liquidaciones += amt
            else if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) deposits += amt
          } else if (cm.depositConcepts.includes(c))           deposits += amt
          else if (cm.rendimientosConcepts.includes(c))  rendimientos += amt
          else if (cm.valorizacionConcepts.includes(c))  passiveValuation += amt
          else if (cm.liquidacionConcepts.includes(c))   liquidaciones += amt
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
      balance = deposits + passiveValuation + rendimientos - liquidaciones
    }
    const defWithName = def as typeof def & { name?: string }
    if (defWithName.name) bucketBreakdown.push({ name: defWithName.name, balance })
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
        const c = tx.concept ?? ''
        if (cm.depositConcepts.includes(c))           delta = amt
        else if (cm.rendimientosConcepts.includes(c))  delta = amt
        else if (cm.valorizacionConcepts.includes(c))  delta = amt
        else if (cm.liquidacionConcepts.includes(c))   delta = -amt
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
    if (!m.date || m.movement_type === 'interes' || parentEnvelopeIds.has(m.envelope_id)) continue
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
  const totalActivos      = liquidBalance + totalInvested + iliquidTotal
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
      />
    </div>
  )
}
