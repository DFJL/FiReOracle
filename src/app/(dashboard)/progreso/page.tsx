import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { ProgresoView } from './ProgresoView'

type ConceptMap = {
  depositConcepts: string[]
  rendimientosConcepts: string[]
  valorizacionConcepts: string[]
  liquidacionConcepts: string[]
}

function isValuation(concept: string | null) {
  return /p[eé]rdida\s*valor|aumento\s*valor/i.test(concept ?? '')
}

export default async function ProgresoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Strictly last 12 complete months (excludes current partial month)
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const rolling12Start    = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const rolling12StartStr = rolling12Start.toISOString().slice(0, 10)
  const rolling12EndStr   = currentMonthStart.toISOString().slice(0, 10)

  const [
    { data: fireConfig },
    { data: bucketRows },
    { data: txs },
    { data: movements },
    { data: envelopes },
    { data: assetRows },
    { data: snapshotRows },
    { data: categories },
  ] = await Promise.all([
    admin.from('user_financial_config').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('user_investment_buckets')
      .select('id, name, bucket_type, vendors, concept_map, account_id')
      .eq('user_id', user.id).eq('is_active', true),
    admin.from('transactions')
      .select('vendor, concept, movement_type, expense_group, is_settlement, is_passive_income, is_survival_expense, amount, date, category_code, investment_bucket_id')
      .eq('user_id', user.id)
      .not('amount', 'is', null),
    admin.from('envelope_movements')
      .select('amount, movement_type, envelope_id, date')
      .eq('user_id', user.id),
    admin.from('savings_envelopes')
      .select('id, parent_envelope_id')
      .eq('user_id', user.id).eq('is_active', true),
    admin.from('assets')
      .select('value_crc, is_investable')
      .eq('user_id', user.id).eq('is_active', true),
    admin.from('net_worth_snapshots')
      .select('snapshot_date, net_worth_crc, invested_crc, liquid_crc')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true }),
    admin.from('transaction_categories')
      .select('code, name, group_gasto, parent_code')
      .eq('is_active', true)
      .order('sort_order'),
  ])

  // Snapshot-based bucket balances
  const snapshotBuckets = (bucketRows ?? []).filter(b => b.bucket_type === 'snapshot_based' && b.account_id)
  const snapshotResults = await Promise.all(
    snapshotBuckets.map(async b => {
      const { data } = await admin
        .from('account_balance_snapshots')
        .select('real_balance')
        .eq('account_id', b.account_id!)
        .order('snapshot_date', { ascending: false })
        .limit(1).maybeSingle()
      return { id: b.id, balance: data?.real_balance ? Number(data.real_balance) : 0 }
    })
  )
  const snapshotBalances: Record<string, number> = Object.fromEntries(snapshotResults.map(r => [r.id, r.balance]))

  // Liquid balance (leaf envelopes only)
  const parentEnvelopeIds = new Set(
    (envelopes ?? []).filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string)
  )
  const liquidBalance = (movements ?? [])
    .filter(m => m.movement_type !== 'interes' && !parentEnvelopeIds.has(m.envelope_id))
    .reduce((s, m) => s + Number(m.amount), 0)

  // Total invested (same logic as patrimonio page)
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

  const iliquidInvestable = (assetRows ?? [])
    .filter(a => a.is_investable)
    .reduce((s, a) => s + Number(a.value_crc), 0)

  const activosInvertibles = liquidBalance + totalInvested + iliquidInvestable

  // Strictly last 12 complete months
  const recent = (txs ?? []).filter(tx =>
    tx.date && tx.date >= rolling12StartStr && tx.date < rolling12EndStr
  )

  const avgMonthlyExpenses = recent
    .filter(tx =>
      (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal') &&
      tx.expense_group !== 'objetivos_financieros' &&
      !isValuation(tx.concept)
    )
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0) / 12

  const avgMonthlySurvivalExpenses = recent
    .filter(tx =>
      tx.is_survival_expense &&
      (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')
    )
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0) / 12

  // Include settlement income — salary may be tagged as settlement in some setups
  const avgMonthlyIncome = recent
    .filter(tx => tx.movement_type === 'income' && !tx.is_passive_income)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0) / 12

  // Actual investment deposits — used as monthly savings for forecast & savings rate
  const avgMonthlyDeposits = recent
    .filter(tx => tx.expense_group === 'objetivos_financieros' && !tx.is_settlement &&
      (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal'))
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0) / 12

  const passiveIncome12m = recent
    .filter(tx => tx.is_passive_income && tx.movement_type === 'income' && !tx.is_settlement)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

  // Yield: passive income / avg invested (last 12 snapshots) — avoids point-in-time outliers
  const last12Snapshots = (snapshotRows ?? []).slice(-12)
  const avgInvestedCrc = last12Snapshots.length > 0
    ? last12Snapshots.reduce((s, r) => s + Number(r.invested_crc ?? 0), 0) / last12Snapshots.length
    : 0
  const realizedReturnRate = avgInvestedCrc > 0 && passiveIncome12m > 0
    ? passiveIncome12m / avgInvestedCrc
    : null

  // FIRE metrics
  const swr        = fireConfig?.fire_withdrawal_rate   ?? 0.04
  // Fall back to actual 12m average if user hasn't configured a target
  const targetExp  = fireConfig?.fire_target_monthly_exp ?? avgMonthlyExpenses
  const expReturn  = fireConfig?.fire_expected_return   ?? 0.07
  const inflation  = fireConfig?.fire_inflation_rate    ?? 0.04
  const fireNumber = targetExp > 0 ? (targetExp * 12) / swr : 0
  const fireProgress = fireNumber > 0 ? activosInvertibles / fireNumber : 0
  const runway     = avgMonthlyExpenses > 0 ? liquidBalance / avgMonthlyExpenses : 0

  const leanFireNumber = avgMonthlySurvivalExpenses > 0
    ? (avgMonthlySurvivalExpenses * 12) / swr
    : 0

  // Year-by-year forecast
  const monthlyReturn     = Math.pow(1 + expReturn, 1 / 12) - 1
  const avgMonthlySavings = avgMonthlyDeposits
  const forecastYears: { year: number; balance: number }[] = []

  if (fireNumber > 0) {
    let balance = activosInvertibles
    for (let y = 0; y <= 40; y++) {
      forecastYears.push({ year: y, balance })
      if (balance >= fireNumber && y > 0) break
      for (let m = 0; m < 12; m++) {
        balance = balance * (1 + monthlyReturn) + avgMonthlySavings
      }
    }
  }

  const exchangeRate = await fetchExchangeRate()

  // ── Lifestyle Inflation ────────────────────────────────────────────────────
  const MONTH_LABELS_LIFESTYLE = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  // Build category hierarchy and name map
  const catChildMap = new Map<string, string>()  // childCode → parentCode
  const catNameMap  = new Map<string, string>()  // code → display name
  for (const cat of categories ?? []) {
    catNameMap.set(cat.code, cat.name)
    const c = cat as { code: string; name: string; parent_code?: string | null }
    if (c.parent_code) catChildMap.set(c.code, c.parent_code)
  }
  const getRootCode = (code: string) => catChildMap.get(code) ?? code

  // Hard-exclude debt payments: LOANS root and all its children
  const DEBT_ROOTS = new Set(['LOANS'])

  const liCurEnd   = new Date(now.getFullYear(), now.getMonth(), 1)
  const liCurStart = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const liPrvStart = new Date(now.getFullYear(), now.getMonth() - 24, 1)
  const liCurEndStr   = liCurEnd.toISOString().slice(0, 10)
  const liCurStartStr = liCurStart.toISOString().slice(0, 10)
  const liPrvStartStr = liPrvStart.toISOString().slice(0, 10)

  const isLifestyleTx = (tx: typeof txs extends (infer T)[] | null ? T : never) => {
    if (!tx) return false
    if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
    if (tx.expense_group === 'objetivos_financieros') return false
    if (isValuation(tx.concept)) return false
    if (tx.category_code && DEBT_ROOTS.has(getRootCode(tx.category_code))) return false
    return true
  }

  const lifestyleTxs = (txs ?? []).filter(isLifestyleTx)

  // Top categories — two-pass outlier removal for fair YoY comparison:
  // Pass 1 (tx-level): remove single large one-off purchases per category (el sofá)
  // Pass 2 (monthly): remove atypical months from cleaned totals (el viaje)

  const toYM = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const allYMs = Array.from({ length: 24 }, (_, i) =>
    toYM(new Date(liPrvStart.getFullYear(), liPrvStart.getMonth() + i, 1))
  )
  const curYMs = allYMs.slice(12)
  const prvYMs = allYMs.slice(0, 12)

  // Global P95 across all lifestyle transactions — fallback for sparse categories
  const allLsAmounts = lifestyleTxs
    .map(tx => Number(tx.amount ?? 0))
    .filter(a => a > 0)
    .sort((a, b) => a - b)
  const globalP95 = allLsAmounts.length > 0
    ? allLsAmounts[Math.floor(allLsAmounts.length * 0.95)]
    : Infinity

  function outlierFence(values: number[]): number {
    const nonZero = values.filter(v => v > 0)
    // Sparse category (e.g. one-off purchase) → use global P95 as reference
    if (nonZero.length < 4) return globalP95
    const s  = [...nonZero].sort((a, b) => a - b)
    const q1 = s[Math.floor(s.length * 0.25)]
    const q3 = s[Math.floor(s.length * 0.75)]
    // 4×Q3 floor avoids over-flagging dense categories (food, fuel) where Q3 is low
    return Math.max(q3 + 1.5 * (q3 - q1), q3 * 4)
  }

  // Pass 1: compute per-root transaction fence across all 24m
  const rootTxAmounts: Record<string, number[]> = {}
  for (const tx of lifestyleTxs) {
    const root = getRootCode(tx.category_code ?? '__na__')
    if (!rootTxAmounts[root]) rootTxAmounts[root] = []
    rootTxAmounts[root].push(Number(tx.amount ?? 0))
  }
  const rootTxFences = Object.fromEntries(
    Object.entries(rootTxAmounts).map(([root, amounts]) => [root, outlierFence(amounts)])
  )
  const rootTxExcluded: Record<string, number> = {}

  // cleanedLifestyleTxs: same as lifestyleTxs but with tx-level outliers removed.
  // Used for both monthly aggregation AND driver drill-down so the drivers stay
  // consistent with the category averages (no outlier tx showing as top driver).
  const cleanedLifestyleTxs = lifestyleTxs.filter(tx => {
    const root   = getRootCode(tx.category_code ?? '__na__')
    const amount = Number(tx.amount ?? 0)
    const isOutlier = amount > (rootTxFences[root] ?? Infinity)
    if (isOutlier) rootTxExcluded[root] = (rootTxExcluded[root] ?? 0) + 1
    return !isOutlier
  })

  // Headline totals use cleaned transactions for consistency with per-category YoY%
  const liCurTotal = cleanedLifestyleTxs
    .filter(tx => tx.date && tx.date >= liCurStartStr && tx.date < liCurEndStr)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)
  const liPrvTotal = cleanedLifestyleTxs
    .filter(tx => tx.date && tx.date >= liPrvStartStr && tx.date < liCurStartStr)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

  // Monthly trend — last 12 complete months (uses cleaned txs, outliers excluded)
  type LiMonth = { label: string; necesario: number; personal: number }
  const liMonthly: LiMonth[] = []
  for (let i = 11; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)
    const ym  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const lbl = `${MONTH_LABELS_LIFESTYLE[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    const monthTxs = cleanedLifestyleTxs.filter(tx => tx.date?.slice(0, 7) === ym)
    liMonthly.push({
      label:     lbl,
      necesario: monthTxs.filter(tx => tx.expense_group === 'necesario').reduce((s, tx) => s + Number(tx.amount ?? 0), 0),
      personal:  monthTxs.filter(tx => tx.expense_group === 'personal').reduce((s, tx) => s + Number(tx.amount ?? 0), 0),
    })
  }

  // Pass 2: build monthly totals from cleaned transactions
  const rootMonthly: Record<string, Record<string, number>> = {}
  for (const tx of cleanedLifestyleTxs) {
    const root   = getRootCode(tx.category_code ?? '__na__')
    const month  = tx.date?.slice(0, 7)
    const amount = Number(tx.amount ?? 0)
    if (!month) continue
    if (!rootMonthly[root]) rootMonthly[root] = {}
    rootMonthly[root][month] = (rootMonthly[root][month] ?? 0) + amount
  }

  // Pass 3: monthly IQR on cleaned totals
  const liTopCats = Object.entries(rootMonthly)
    .filter(([, monthly]) => curYMs.some(m => (monthly[m] ?? 0) > 0))
    .map(([code, monthly]) => {
      const fence         = outlierFence(allYMs.map(m => monthly[m] ?? 0))
      const monthOutliers = new Set(allYMs.filter(m => (monthly[m] ?? 0) > fence))
      const curSum        = curYMs.filter(m => !monthOutliers.has(m)).reduce((s, m) => s + (monthly[m] ?? 0), 0)
      const prvSum        = prvYMs.filter(m => !monthOutliers.has(m)).reduce((s, m) => s + (monthly[m] ?? 0), 0)
      return {
        code,
        name:         catNameMap.get(code) ?? code,
        curAvg:       curSum / 12,
        yoyPct:       prvSum > 0 ? (curSum - prvSum) / prvSum : null,
        outlierCount: (rootTxExcluded[code] ?? 0) + monthOutliers.size,
      }
    })
    .filter(c => c.curAvg > 0)
    .sort((a, b) => b.curAvg - a.curAvg)
    .slice(0, 8)

  // Driver breakdown: group by concept using cleaned transactions (outliers excluded)
  const liTopCatsWithDrivers = liTopCats.map(cat => {
    const catTxs = cleanedLifestyleTxs.filter(tx =>
      getRootCode(tx.category_code ?? '__na__') === cat.code
    )
    const subSums: Record<string, { cur: number; prv: number }> = {}
    for (const tx of catTxs) {
      const key = tx.concept?.trim()
        || catNameMap.get(tx.category_code ?? '')
        || tx.vendor?.trim()
        || '(sin etiqueta)'
      if (!subSums[key]) subSums[key] = { cur: 0, prv: 0 }
      if (tx.date && tx.date >= liCurStartStr && tx.date < liCurEndStr)   subSums[key].cur += Number(tx.amount ?? 0)
      if (tx.date && tx.date >= liPrvStartStr && tx.date < liCurStartStr) subSums[key].prv += Number(tx.amount ?? 0)
    }
    const drivers = Object.entries(subSums)
      .filter(([, v]) => v.cur > 0 || v.prv > 0)
      .map(([key, v]) => ({
        key,
        curAvg: v.cur / 12,
        prvAvg: v.prv / 12,
        yoyPct: v.prv > 0 ? (v.cur - v.prv) / v.prv : null,
      }))
      .sort((a, b) => b.curAvg - a.curAvg)
      .slice(0, 8)
    return { ...cat, drivers }
  })

  // Wealth Delta: monthly NW attribution for last 12 complete months
  const MONTH_LABELS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  // Group snapshots by year-month (first-of-month date = NW at start of that month)
  const snapByYM: Record<string, number> = {}
  for (const s of snapshotRows ?? []) {
    const ym = (s.snapshot_date as string).slice(0, 7)
    snapByYM[ym] = Number(s.net_worth_crc)
  }

  type WealthDeltaMonth = {
    ym: string; label: string
    delta: number; savings: number; returns: number; residual: number
  }
  const wealthDelta: WealthDeltaMonth[] = []

  for (let i = 12; i >= 1; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const ym     = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const ymNext = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`

    const nwStart = snapByYM[ym]
    const nwEnd   = snapByYM[ymNext]
    if (nwStart == null || nwEnd == null) continue

    const delta = nwEnd - nwStart

    const savings = (txs ?? []).filter(tx =>
      (tx.date as string | null)?.slice(0, 7) === ym &&
      tx.expense_group === 'objetivos_financieros' &&
      !tx.is_settlement &&
      (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')
    ).reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

    const passiveIncome = (txs ?? []).filter(tx =>
      (tx.date as string | null)?.slice(0, 7) === ym &&
      tx.is_passive_income &&
      tx.movement_type === 'income' &&
      !tx.is_settlement
    ).reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

    const envelopeInterest = (movements ?? []).filter(m =>
      m.movement_type === 'interes' &&
      (m as { date?: string | null }).date?.slice(0, 7) === ym
    ).reduce((s, m) => s + Number(m.amount ?? 0), 0)

    const returns  = passiveIncome + envelopeInterest
    const residual = delta - savings - returns

    wealthDelta.push({
      ym,
      label: `${MONTH_LABELS_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      delta, savings, returns, residual,
    })
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <ProgresoView
        activosInvertibles={activosInvertibles}
        liquidBalance={liquidBalance}
        totalInvested={totalInvested}
        fireNumber={fireNumber}
        leanFireNumber={leanFireNumber}
        fireProgress={fireProgress}
        runway={runway}
        avgMonthlyExpenses={avgMonthlyExpenses}
        avgMonthlySurvivalExpenses={avgMonthlySurvivalExpenses}
        avgMonthlyIncome={avgMonthlyIncome}
        avgMonthlyDeposits={avgMonthlyDeposits}
        passiveIncome12m={passiveIncome12m}
        realizedReturnRate={realizedReturnRate}
        forecastYears={forecastYears}
        snapshots={(snapshotRows ?? []).map(s => ({
          snapshot_date: s.snapshot_date,
          net_worth_crc: Number(s.net_worth_crc),
          invested_crc:  Number(s.invested_crc ?? 0),
          liquid_crc:    Number((s as { liquid_crc?: number | null }).liquid_crc ?? 0),
        }))}
        exchangeRate={exchangeRate}
        fireConfig={{ swr, targetExp, expReturn, inflation }}
        runwayGreen={fireConfig?.runway_green_months  ?? 6}
        runwayYellow={fireConfig?.runway_yellow_months ?? 3}
        wealthDelta={wealthDelta}
        lifestyle={{
          inflationRate: inflation,
          curTotal:      liCurTotal,
          prvTotal:      liPrvTotal,
          monthly:       liMonthly,
          topCats:       liTopCatsWithDrivers,
        }}
      />
    </div>
  )
}
