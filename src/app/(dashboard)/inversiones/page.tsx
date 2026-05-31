import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { BucketData } from './buckets'
import { PortfolioView } from './PortfolioView'
import { PortfolioHistory } from './PortfolioHistory'
import type { HistoryPoint, HistorySeries } from './PortfolioHistory'
import { fetchExchangeRate } from '@/lib/exchange-rate'

const LIQUID_KEY = '__liquidez__'

type ConceptMap = {
  depositConcepts: string[]
  rendimientosConcepts: string[]
  valorizacionConcepts: string[]
  liquidacionConcepts: string[]
}

export default async function InversionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: bucketRows }, { data: txs }, { data: accountRows }, { data: movements }] = await Promise.all([
    admin
      .from('user_investment_buckets')
      .select('id, bucket_type, name, industry, color, vendors, concept_map, account_id, sort_order')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('transactions')
      .select('vendor, concept, movement_type, expense_group, is_settlement, is_passive_income, amount, date')
      .eq('user_id', user.id)
      .not('amount', 'is', null),
    admin
      .from('financial_accounts')
      .select('id, account_type')
      .eq('user_id', user.id)
      .eq('is_active', true),
    admin
      .from('envelope_movements')
      .select('amount, date')
      .eq('user_id', user.id),
  ])

  // Account IDs owned by snapshot_based buckets — excluded from liquidBalance
  const snapshotAccountIds = new Set(
    (bucketRows ?? [])
      .filter(b => b.bucket_type === 'snapshot_based' && b.account_id)
      .map(b => b.account_id as string)
  )

  // Fetch snapshot balances for snapshot_based buckets
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

  // liquidBalance = liquid accounts NOT claimed by a snapshot_based bucket
  const liquidAccounts = (accountRows ?? []).filter(
    a => ['checking', 'cash', 'savings'].includes(a.account_type) && !snapshotAccountIds.has(a.id)
  )
  const liquidSnaps = await Promise.all(
    liquidAccounts.map(acc =>
      admin
        .from('account_balance_snapshots')
        .select('real_balance')
        .eq('account_id', acc.id)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle()
    )
  )
  const liquidBalance = liquidSnaps.reduce((s, { data }) => s + (data?.real_balance ? Number(data.real_balance) : 0), 0)

  // Compute bucket balances (current)
  const buckets: BucketData[] = (bucketRows ?? []).map(def => {
    if (def.bucket_type === 'snapshot_based') {
      const balance = snapshotBalances[def.id] ?? 0
      return {
        key: def.id,
        name: def.name,
        industry: def.industry ?? '',
        color: def.color ?? '#888',
        vendors: [],
        deposits: 0, liquidaciones: 0, rendimientos: 0,
        passiveValuation: 0, markToMarketLoss: 0,
        balance, valorizationNet: 0,
      }
    }

    let deposits = 0, liquidaciones = 0, rendimientos = 0, passiveValuation = 0, markToMarketLoss = 0

    for (const tx of txs ?? []) {
      const amt = Number(tx.amount ?? 0)

      if (def.bucket_type === 'concept_based' && def.concept_map) {
        const cm = def.concept_map as unknown as ConceptMap
        const c = tx.concept ?? ''
        if (cm.depositConcepts.includes(c))          deposits += amt
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
        else if (tx.movement_type === 'expense' && tx.expense_group === 'na' && !tx.is_passive_income) markToMarketLoss += amt
      }
    }

    const balance = deposits + passiveValuation + rendimientos - liquidaciones
    return {
      key: def.id,
      name: def.name,
      industry: def.industry ?? '',
      color: def.color ?? '#888',
      vendors: (def.vendors ?? []) as string[],
      deposits, liquidaciones, rendimientos, passiveValuation, markToMarketLoss,
      balance, valorizationNet: passiveValuation - markToMarketLoss,
    }
  })

  const totalInvested = buckets.reduce((s, b) => s + b.balance, 0)
  const totalPatrimony = totalInvested + liquidBalance

  // ── Historical monthly computation ──────────────────────────────────────────

  // Step 1: per-bucket monthly deltas (vendor/concept only; snapshot has no history)
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
        if (cm.depositConcepts.includes(c))          delta = amt
        else if (cm.rendimientosConcepts.includes(c)) delta = amt
        else if (cm.valorizacionConcepts.includes(c)) delta = amt
        else if (cm.liquidacionConcepts.includes(c))  delta = -amt
      } else if (def.bucket_type === 'vendor_based') {
        const txVendor = (tx.vendor ?? '').toLowerCase().trim()
        const vendors = (def.vendors ?? []).map((v: string) => v.toLowerCase())
        if (!vendors.includes(txVendor)) continue

        if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) delta = amt
        else if (tx.is_settlement)                                               delta = -amt
        else if (tx.is_passive_income && tx.movement_type === 'income')          delta = amt
        else if (tx.is_passive_income && !tx.movement_type)                      delta = amt
      }

      if (delta !== 0) deltas[month] = (deltas[month] ?? 0) + delta
    }
  }

  // Step 2: liquidez monthly deltas from envelope_movements
  const liquidezDeltas: Record<string, number> = {}
  for (const m of movements ?? []) {
    if (!m.date) continue
    const month = m.date.slice(0, 7)
    liquidezDeltas[month] = (liquidezDeltas[month] ?? 0) + Number(m.amount)
  }

  // Step 3: collect all months in range
  const allMonthsSet = new Set<string>()
  for (const deltas of Object.values(bucketDeltas)) Object.keys(deltas).forEach(m => allMonthsSet.add(m))
  Object.keys(liquidezDeltas).forEach(m => allMonthsSet.add(m))

  const historyPoints: HistoryPoint[] = []

  if (allMonthsSet.size > 0) {
    const earliest = [...allMonthsSet].sort()[0]
    const months: string[] = []
    let cursor = new Date(earliest + '-01')
    const nowStr = new Date().toISOString().slice(0, 7)
    while (cursor.toISOString().slice(0, 7) <= nowStr) {
      months.push(cursor.toISOString().slice(0, 7))
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }

    const running: Record<string, number> = {}
    let runningLiquidez = 0

    for (const month of months) {
      for (const def of bucketDefs) {
        running[def.id] = (running[def.id] ?? 0) + (bucketDeltas[def.id]?.[month] ?? 0)
      }
      runningLiquidez += (liquidezDeltas[month] ?? 0)

      historyPoints.push({
        month,
        balances: {
          ...Object.fromEntries(bucketDefs.map(d => [d.id, running[d.id] ?? 0])),
          [LIQUID_KEY]: runningLiquidez,
        },
      })
    }
  }

  const historySeries: HistorySeries[] = [
    ...buckets
      .filter(b => b.key !== LIQUID_KEY)
      .map(b => ({ key: b.key, name: b.name, color: b.color })),
    { key: LIQUID_KEY, name: 'Liquidez', color: '#f59e0b' },
  ]

  const exchangeRate = await fetchExchangeRate()

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <PortfolioView
        buckets={buckets}
        liquidBalance={liquidBalance}
        totalInvested={totalInvested}
        totalPatrimony={totalPatrimony}
        exchangeRate={exchangeRate}
      />
      <PortfolioHistory
        points={historyPoints}
        series={historySeries}
        exchangeRate={exchangeRate}
      />
    </div>
  )
}
