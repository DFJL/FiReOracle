import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { WrappedView } from './WrappedView'
import { isRealizedPassiveIncome } from '@/lib/incomeAllocation'
import { interpolatePropertyValue } from '@/lib/rentalPerformance'
import { classifyFlowTx, computeFlowWindow } from '@/lib/ahorroInversionFlow'
import { buildRootCodeMap, outlierFence } from '@/lib/lifestyleExpenses'
import { inferCategory, getGroupLabel } from '@/app/(dashboard)/resumen/categoryUtils'

// Bucket codes that only describe where the money sits (the account/sobre),
// not the economic nature of the transaction — same set InteractiveSection.tsx
// (/resumen) uses before falling through to inferCategory(vendor, concept).
// Without this, a generic "MISC" shows up as an actual pattern with no
// information in it instead of being resolved to a real category.
const GENERIC_CODES = new Set([
  'SAVINGS', 'INCOME', 'SAVINGS_INVESTMENT', 'PASSIVE_INCOME',
  'MISC', 'MISC_EXPENSE', 'TRANSFER', 'CASH_WITHDRAWAL', 'DEPOSIT_DEBIT',
])
function resolveGroupLabel(tx: { vendor: string | null; concept: string | null; category_code: string | null }): string {
  const code = tx.category_code && !GENERIC_CODES.has(tx.category_code)
    ? tx.category_code
    : inferCategory(tx.vendor, tx.concept, null)
  return getGroupLabel(code)
}

// Historical colón rates used only to convert older years' CRC passive-income
// transactions to USD when they predate the per-transaction historical FX
// backfill — approximate, fine for a "this year vs last year" headline, not
// used anywhere else.
const APPROX_RATE: Record<number, number> = { 2024: 520, 2025: 510, 2026: 480 }

export default async function WrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const now = new Date()
  const sp = await searchParams
  const year = sp.y ? parseInt(sp.y) : now.getFullYear()
  const prevYear = year - 1
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const prevYearStart = `${prevYear}-01-01`
  const prevYearEnd = `${prevYear}-12-31`

  const [
    { data: txYear },
    { data: txPrevYear },
    { data: nwSnapshots },
    { data: yieldRows },
    { data: selfLoans },
    { data: aguinaldoItems },
    { data: aguinaldoAllocs },
    { data: vilaAsset },
    { data: vilaLoanPaymentsStart },
    { data: categoriesRaw },
    { data: savingsEnvelopes },
    { data: envelopeMovements },
  ] = await Promise.all([
    admin.from('transactions')
      .select('amount, amount_usd, currency_code, vendor, concept, category_code, movement_type, expense_group, is_settlement, is_passive_income, is_survival_expense, date')
      .eq('user_id', user.id).not('amount', 'is', null)
      .gte('date', yearStart).lte('date', yearEnd).range(0, 49999),
    admin.from('transactions')
      .select('amount, amount_usd, currency_code, vendor, concept, category_code, movement_type, expense_group, is_settlement, is_passive_income, is_survival_expense, date')
      .eq('user_id', user.id).not('amount', 'is', null)
      .gte('date', prevYearStart).lte('date', prevYearEnd).range(0, 49999),
    admin.from('net_worth_snapshots')
      .select('snapshot_date, invested_crc, liquid_crc')
      .eq('user_id', user.id)
      .gte('snapshot_date', yearStart).lte('snapshot_date', yearEnd)
      .order('snapshot_date', { ascending: true }),
    admin.from('investment_yield_history')
      .select('product_name, year_month, yield_usd, invested_usd')
      .eq('user_id', user.id)
      .gte('year_month', yearStart).lte('year_month', yearEnd),
    admin.from('self_loans')
      .select('id, status, loan_date')
      .eq('user_id', user.id)
      .gte('loan_date', yearStart).lte('loan_date', yearEnd),
    admin.from('aguinaldo_allocation_items')
      .select('amount, allocation_id')
      .eq('user_id', user.id),
    admin.from('aguinaldo_allocations')
      .select('id')
      .eq('user_id', user.id).eq('year', year),
    admin.from('assets')
      .select('id, value_crc, as_of_date, purchase_price_crc, purchase_date, loan_id')
      .eq('user_id', user.id).eq('is_rental', true).eq('is_active', true).maybeSingle(),
    // Loan balance as of the start of the year — real history, no modeling.
    admin.from('loan_payments')
      .select('loan_id, payment_date, balance_after, balance_before')
      .eq('user_id', user.id)
      .lte('payment_date', yearStart)
      .order('payment_date', { ascending: false })
      .limit(1),
    // Global catalog, not user-scoped — same source buildRootCodeMap()'s
    // callers elsewhere (progreso, dailyFacts, oracleContext) all use.
    admin.from('transaction_categories').select('code, parent_code'),
    // Same ahorro-envelope rule /resumen, /progreso and /liquidez use.
    admin.from('savings_envelopes').select('id, counts_as_ahorro').eq('user_id', user.id).eq('is_active', true),
    admin.from('envelope_movements').select('amount, movement_type, envelope_id, date, notes').eq('user_id', user.id),
  ])
  const getRootCode = buildRootCodeMap((categoriesRaw ?? []) as { code: string; parent_code?: string | null }[])

  // ── Passive income: current year vs previous year, in USD ──────────────────
  type PassiveTx = {
    amount: number | null
    amount_usd: number | null
    currency_code: string
    is_passive_income: boolean | null
    is_settlement: boolean | null
    category_code: string | null
    concept: string | null
  }
  function passiveIncomeUsd(rows: PassiveTx[] | null, fallbackRate: number): number {
    return (rows ?? []).reduce((sum, tx) => {
      if (!isRealizedPassiveIncome(tx)) return sum
      if (tx.amount_usd != null) return sum + Number(tx.amount_usd)
      const rate = tx.currency_code === 'USD' ? 1 : fallbackRate
      return sum + Number(tx.amount) / (tx.currency_code === 'USD' ? 1 : rate)
    }, 0)
  }
  const passiveIncomeCurrent = passiveIncomeUsd(txYear, APPROX_RATE[year] ?? 480)
  const passiveIncomePrev    = passiveIncomeUsd(txPrevYear, APPROX_RATE[prevYear] ?? 510)

  // ── Ingreso activo y tasa de ahorro: mismo computeFlowWindow que alimenta
  // el flujo de ahorro/inversión en /resumen y /progreso (income = isActiveIncome,
  // deposits = ahorro+inversión+abonos extra de préstamo) — nada recalculado
  // a mano, para no repetir el desfase de metodología que tuvo PortfolioYield
  // vs /progreso antes. Nombres/fuentes de los Maps no afectan los totales.
  const savingsEnvelopeIds = new Set((savingsEnvelopes ?? []).filter(e => e.counts_as_ahorro === true).map(e => e.id))
  const allTxs = [...(txYear ?? []), ...(txPrevYear ?? [])]
  const yearEndExclusive = `${year + 1}-01-01`
  const prevYearEndExclusive = `${prevYear + 1}-01-01`
  const flowCurrent = computeFlowWindow(allTxs, envelopeMovements ?? [], savingsEnvelopeIds, new Map(), new Map(), yearStart, yearEndExclusive)
  const flowPrev    = computeFlowWindow(allTxs, envelopeMovements ?? [], savingsEnvelopeIds, new Map(), new Map(), prevYearStart, prevYearEndExclusive)
  const activeIncomeCurrent = flowCurrent.income
  const activeIncomePrev    = flowPrev.income
  const savingsRateCurrent = flowCurrent.income > 0 ? (flowCurrent.ahorro + flowCurrent.inversion + flowCurrent.deuda) / flowCurrent.income : null
  const savingsRatePrev    = flowPrev.income > 0 ? (flowPrev.ahorro + flowPrev.inversion + flowPrev.deuda) / flowPrev.income : null

  // ── Patrimonio (liquid + invertido en buckets — net_worth_snapshots, no
  // incluye bienes raíces): primer vs último snapshot del año ────────────────
  const nwFirst = nwSnapshots?.[0]
  const nwLast  = nwSnapshots?.[nwSnapshots.length - 1]
  const netWorthStart = nwFirst ? Number(nwFirst.invested_crc) + Number(nwFirst.liquid_crc) : 0
  const netWorthEnd   = nwLast  ? Number(nwLast.invested_crc)  + Number(nwLast.liquid_crc)  : 0

  // ── Real estate equity (Vila): valor interpolado + deuda real por
  // loan_payments, ya que no hay snapshots de valor de la propiedad ──────────
  let realEstateEquityStart = 0
  let realEstateEquityNow = 0
  let hasRealEstate = false
  if (vilaAsset?.loan_id && vilaAsset.purchase_date && vilaAsset.purchase_price_crc) {
    hasRealEstate = true
    const { data: loanNow } = await admin.from('loans')
      .select('current_balance, currency_code').eq('id', vilaAsset.loan_id).maybeSingle()
    const { data: exchangeRateRow } = await admin.from('transactions')
      .select('exchange_rate_used').eq('user_id', user.id).not('exchange_rate_used', 'is', null)
      .order('date', { ascending: false }).limit(1).maybeSingle()
    const rate = Number(exchangeRateRow?.exchange_rate_used ?? APPROX_RATE[year] ?? 480)
    const valueNow   = Number(vilaAsset.value_crc)
    const asOf       = vilaAsset.as_of_date ?? yearEnd
    const valueStart = interpolatePropertyValue(
      Number(vilaAsset.purchase_price_crc), vilaAsset.purchase_date, valueNow, asOf, new Date(yearStart + 'T12:00:00'),
    )
    const loanBalStartNative = vilaLoanPaymentsStart?.[0]?.balance_after != null
      ? Number(vilaLoanPaymentsStart[0].balance_after)
      : Number(loanNow?.current_balance ?? 0)
    const loanBalNowNative = Number(loanNow?.current_balance ?? 0)
    const isUsd = (loanNow?.currency_code ?? 'CRC') === 'USD'
    const loanBalStartCrc = isUsd ? loanBalStartNative * rate : loanBalStartNative
    const loanBalNowCrc   = isUsd ? loanBalNowNative * rate   : loanBalNowNative
    realEstateEquityStart = valueStart - loanBalStartCrc
    realEstateEquityNow   = valueNow - loanBalNowCrc
  }
  const totalPatrimonyStart = netWorthStart + realEstateEquityStart
  const totalPatrimonyEnd   = netWorthEnd + realEstateEquityNow

  // ── Vila NOI del año ─────────────────────────────────────────────────────────
  const rentalIncome  = (txYear ?? []).filter(t => t.category_code === 'RENTAL_INCOME').reduce((s, t) => s + Number(t.amount), 0)
  const rentalExpense = (txYear ?? []).filter(t => t.category_code === 'RENTAL_EXPENSE').reduce((s, t) => s + Number(t.amount), 0)
  const vilaNoiCrc = rentalIncome - rentalExpense

  // ── Mejor inversión del año — mismo cálculo money-weighted que PortfolioYield
  const byProduct = new Map<string, { totalUsd: number; investedSum: number; months: number }>()
  for (const r of yieldRows ?? []) {
    const cur = byProduct.get(r.product_name) ?? { totalUsd: 0, investedSum: 0, months: 0 }
    cur.totalUsd += Number(r.yield_usd)
    cur.investedSum += Number(r.invested_usd)
    cur.months += 1
    byProduct.set(r.product_name, cur)
  }
  const summaries = [...byProduct.entries()].map(([name, v]) => {
    const avgInvested = v.months > 0 ? v.investedSum / v.months : 0
    const annPct = avgInvested > 0 ? (v.totalUsd / avgInvested) * (12 / v.months) * 100 : 0
    return { name, annPct, totalUsd: v.totalUsd }
  }).filter(s => s.totalUsd !== 0)
  const bestInvestment = summaries.sort((a, b) => b.annPct - a.annPct)[0] ?? null

  // ── Patrones de consumo: mismo filtro que /resumen y /progreso — gasto real
  // (classifyFlowTx === 'gasto'), lo que ya excluye settlements, valorización,
  // cuotas de préstamo, abonos extra y ahorro/inversión (esos dominaban las
  // categorías antes y no reflejan un cambio de comportamiento real) ────────
  const gastos     = (txYear ?? []).filter(t => classifyFlowTx(t) === 'gasto')
  const gastosPrev = (txPrevYear ?? []).filter(t => classifyFlowTx(t) === 'gasto')
  const DELTA_FLOOR_CRC = 100_000 // anual — piso para evitar ruido de categorías chicas

  // Mismo cercado de outliers por raíz de categoría que cleanLifestyleOutliers
  // (IQR con piso 4×Q3, categorías dispersas caen al P95 global) — sin esto,
  // una compra única grande (ej. una remodelación) se lee como "patrón" de
  // consumo en vez de lo que es: un evento aislado.
  function fenceOutliers<T extends { amount: number | null; category_code: string | null }>(rows: T[]): T[] {
    const amounts = rows.map(r => Number(r.amount ?? 0)).filter(a => a > 0).sort((a, b) => a - b)
    const globalP95 = amounts.length > 0 ? amounts[Math.floor(amounts.length * 0.95)] : Infinity
    const byRoot: Record<string, number[]> = {}
    for (const r of rows) {
      const root = getRootCode(r.category_code ?? '__na__')
      ;(byRoot[root] ??= []).push(Number(r.amount ?? 0))
    }
    const fences = Object.fromEntries(Object.entries(byRoot).map(([root, amts]) => [root, outlierFence(amts, globalP95)]))
    return rows.filter(r => Number(r.amount ?? 0) <= (fences[getRootCode(r.category_code ?? '__na__')] ?? Infinity))
  }
  const gastosClean     = fenceOutliers(gastos)
  const gastosPrevClean = fenceOutliers(gastosPrev)

  // Categoría resuelta igual que /resumen: los códigos "bucket" genéricos
  // (MISC, TRANSFER, etc.) caen a inferCategory(vendor, concept) en vez de
  // mostrarse tal cual — así no aparece un "MISC" o un "HOME_RENO" sin
  // traducir que no le dice nada al usuario.
  function sumByGroup(rows: { vendor: string | null; concept: string | null; category_code: string | null; amount: number | null }[]): Map<string, number> {
    const m = new Map<string, number>()
    for (const t of rows) {
      const label = resolveGroupLabel(t)
      m.set(label, (m.get(label) ?? 0) + Number(t.amount))
    }
    return m
  }
  const catCurrent = sumByGroup(gastosClean)
  const catPrev    = sumByGroup(gastosPrevClean)
  const allLabels = new Set([...catCurrent.keys(), ...catPrev.keys()])
  const catDeltas = [...allLabels].map(label => {
    const current = catCurrent.get(label) ?? 0
    const previous = catPrev.get(label) ?? 0
    const delta = current - previous
    const pct = previous > 0 ? (delta / previous) * 100 : null
    return { label, current, previous, delta, pct }
  }).filter(d => Math.abs(d.delta) >= DELTA_FLOOR_CRC)
  const biggestIncreaseAnnual = catDeltas.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta)[0] ?? null
  const biggestDecreaseAnnual = catDeltas.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta)[0] ?? null
  // Millones anuales no dicen nada de un vistazo — se muestra promedio mensual.
  const toMonthly = (d: typeof biggestIncreaseAnnual) => d && {
    label: d.label, current: d.current / 12, previous: d.previous / 12, delta: d.delta / 12, pct: d.pct,
  }
  const biggestIncrease = toMonthly(biggestIncreaseAnnual)
  const biggestDecrease = toMonthly(biggestDecreaseAnnual)

  // ── Tendencia H1 vs H2: promedio mensual de gasto real, outlier-cleaned ──
  let h1Total = 0, h2Total = 0
  for (const t of gastosClean) {
    if (!t.date) continue
    const month = Number(t.date.slice(5, 7))
    if (month <= 6) h1Total += Number(t.amount)
    else h2Total += Number(t.amount)
  }
  const h1Avg = h1Total / 6
  const h2Avg = h2Total / 6
  const trendPct = h1Avg > 0 ? ((h2Avg - h1Avg) / h1Avg) * 100 : null

  // ── Hábito nuevo: grupo sin gasto en H1 que aparece y se repite en H2 ──────
  const monthsByGroup = new Map<string, Set<number>>()
  for (const t of gastosClean) {
    if (!t.date) continue
    const label = resolveGroupLabel(t)
    const month = Number(t.date.slice(5, 7))
    const set = monthsByGroup.get(label) ?? new Set<number>()
    set.add(month)
    monthsByGroup.set(label, set)
  }
  let newHabit: { label: string; monthlyAvg: number; months: number } | null = null
  for (const [label, months] of monthsByGroup) {
    const h1Months = [...months].filter(m => m <= 6).length
    const h2Months = [...months].filter(m => m > 6).length
    if (h1Months === 0 && h2Months >= 2) {
      const total = gastosClean.filter(t => resolveGroupLabel(t) === label).reduce((s, t) => s + Number(t.amount), 0)
      const monthlyAvg = total / h2Months
      if (total >= DELTA_FLOOR_CRC && (!newHabit || total > newHabit.monthlyAvg * newHabit.months)) {
        newHabit = { label, monthlyAvg, months: h2Months }
      }
    }
  }

  // ── Hábitos: distribución día de semana, diversidad de vendors ─────────────
  const totalTx = (txYear ?? []).length
  const selfLoansCount = selfLoans?.length ?? 0
  const selfLoansPaid  = (selfLoans ?? []).filter(l => l.status === 'paid').length
  const cryptoProtocols = new Set(
    (txYear ?? [])
      .filter(t => t.category_code === 'INVESTMENT_RETURN_CRYPTO' && t.vendor && t.vendor !== 'Crypto / DeFi')
      .map(t => t.vendor),
  ).size
  const thisYearAllocIds = new Set((aguinaldoAllocs ?? []).map(a => a.id))
  const aguinaldoItemCount = (aguinaldoItems ?? []).filter(i => thisYearAllocIds.has(i.allocation_id)).length
  const aguinaldoItemTotal = (aguinaldoItems ?? [])
    .filter(i => thisYearAllocIds.has(i.allocation_id))
    .reduce((s, i) => s + Number(i.amount), 0)

  const dayOfWeekTotals = [0, 0, 0, 0, 0, 0, 0] // dom..sab
  for (const t of gastos) {
    if (!t.date) continue
    const d = new Date(t.date + 'T12:00:00')
    dayOfWeekTotals[d.getDay()] += Number(t.amount)
  }
  const vendorSet = new Set((gastos ?? []).filter(t => t.vendor).map(t => t.vendor))
  const vendorDiversity = vendorSet.size

  return (
    <WrappedView
      year={year}
      data={{
        passiveIncome: { current: passiveIncomeCurrent, previous: passiveIncomePrev },
        income: {
          activeCrc: { current: activeIncomeCurrent, previous: activeIncomePrev },
          savingsRate: { current: savingsRateCurrent, previous: savingsRatePrev },
        },
        netWorth: { start: netWorthStart, end: netWorthEnd },
        patrimony: { start: totalPatrimonyStart, end: totalPatrimonyEnd, hasRealEstate },
        bestInvestment,
        vila: vilaAsset ? { noiCrc: vilaNoiCrc } : null,
        patterns: {
          biggestIncrease,
          biggestDecrease,
          trendPct,
          h1Avg,
          h2Avg,
          newHabit,
        },
        habits: {
          totalTx, selfLoansCount, selfLoansPaid, cryptoProtocols, aguinaldoItemCount, aguinaldoItemTotal,
          dayOfWeekTotals, vendorDiversity,
        },
      }}
    />
  )
}
