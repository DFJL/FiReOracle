import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { WrappedView } from './WrappedView'
import { isRealizedPassiveIncome } from '@/lib/incomeAllocation'
import { interpolatePropertyValue } from '@/lib/rentalPerformance'

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
  ] = await Promise.all([
    admin.from('transactions')
      .select('amount, amount_usd, currency_code, vendor, concept, category_code, movement_type, expense_group, is_settlement, is_passive_income, is_survival_expense, date')
      .eq('user_id', user.id).not('amount', 'is', null)
      .gte('date', yearStart).lte('date', yearEnd).range(0, 49999),
    admin.from('transactions')
      .select('amount, amount_usd, currency_code, is_passive_income, is_settlement, category_code, concept, movement_type, date')
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
  ])

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

  // ── Patrones de consumo: categorías excluidas por ser estructuralmente
  // sesgadas (siempre grandes o siempre presentes, no reflejan cambio de
  // comportamiento) ────────────────────────────────────────────────────────
  const STRUCTURAL_CATEGORIES = new Set(['LOAN_PAYMENT', 'CAR_EXPENSES', 'SAVINGS_INVESTMENT'])
  const DELTA_FLOOR_CRC = 100_000

  const gastos     = (txYear ?? []).filter(t => t.movement_type === 'expense' || t.movement_type === 'cash_withdrawal')
  const gastosPrev = (txPrevYear ?? []).filter(t => t.movement_type === 'expense' || t.movement_type === 'cash_withdrawal')

  function sumByCategory(rows: { category_code: string | null; amount: number | null }[]): Map<string, number> {
    const m = new Map<string, number>()
    for (const t of rows) {
      if (!t.category_code || STRUCTURAL_CATEGORIES.has(t.category_code)) continue
      m.set(t.category_code, (m.get(t.category_code) ?? 0) + Number(t.amount))
    }
    return m
  }
  const catCurrent = sumByCategory(gastos)
  const catPrev    = sumByCategory(gastosPrev)
  const allCats = new Set([...catCurrent.keys(), ...catPrev.keys()])
  const catDeltas = [...allCats].map(code => {
    const current = catCurrent.get(code) ?? 0
    const previous = catPrev.get(code) ?? 0
    const delta = current - previous
    const pct = previous > 0 ? (delta / previous) * 100 : null
    return { code, current, previous, delta, pct }
  }).filter(d => Math.abs(d.delta) >= DELTA_FLOOR_CRC)
  const biggestIncrease = catDeltas.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta)[0] ?? null
  const biggestDecrease = catDeltas.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta)[0] ?? null

  // ── Tendencia H1 vs H2: promedio mensual de gasto (excluye estructurales) ──
  const nonStructuralGastos = gastos.filter(t => t.category_code && !STRUCTURAL_CATEGORIES.has(t.category_code))
  let h1Total = 0, h2Total = 0
  for (const t of nonStructuralGastos) {
    if (!t.date) continue
    const month = Number(t.date.slice(5, 7))
    if (month <= 6) h1Total += Number(t.amount)
    else h2Total += Number(t.amount)
  }
  const h1Avg = h1Total / 6
  const h2Avg = h2Total / 6
  const trendPct = h1Avg > 0 ? ((h2Avg - h1Avg) / h1Avg) * 100 : null

  // ── Hábito nuevo: categoría sin gasto en H1 que aparece y se repite en H2 ──
  const monthsByCat = new Map<string, Set<number>>()
  for (const t of gastos) {
    if (!t.category_code || STRUCTURAL_CATEGORIES.has(t.category_code) || !t.date) continue
    const month = Number(t.date.slice(5, 7))
    const set = monthsByCat.get(t.category_code) ?? new Set<number>()
    set.add(month)
    monthsByCat.set(t.category_code, set)
  }
  let newHabit: { code: string; total: number; months: number } | null = null
  for (const [code, months] of monthsByCat) {
    const h1Months = [...months].filter(m => m <= 6).length
    const h2Months = [...months].filter(m => m > 6).length
    if (h1Months === 0 && h2Months >= 2) {
      const total = gastos.filter(t => t.category_code === code).reduce((s, t) => s + Number(t.amount), 0)
      if (total >= DELTA_FLOOR_CRC && (!newHabit || total > newHabit.total)) {
        newHabit = { code, total, months: h2Months }
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
