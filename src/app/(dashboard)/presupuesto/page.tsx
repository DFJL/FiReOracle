import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { PresupuestoClient } from './PresupuestoClient'
import type { Envelope, TxCategory, FinancialAccount } from './PresupuestoClient'
import { AguinaldoSection } from './AguinaldoSection'
import { getGroupLabel, displayCategory } from '../resumen/categoryUtils'
import { isInversionCategoryCode } from '@/lib/incomeAllocation'
import { fetchExchangeRate } from '@/lib/exchange-rate'

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { m } = await searchParams
  const now = new Date()
  const [yearStr, monthStr] = (m ?? '').split('-')
  const year  = parseInt(yearStr)  || now.getFullYear()
  const month = parseInt(monthStr) || (now.getMonth() + 1)

  const admin  = createAdminClient()
  const tcRate = (await fetchExchangeRate()).sell

  // Previous 3 complete months for historical averages
  const prevMonths: [number, number][] = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(year, month - 1 - i, 1)
    prevMonths.push([d.getFullYear(), d.getMonth() + 1])
  }
  // Last 12 months INCLUDING the viewed month — for the Gasto/Ahorro/
  // Inversión/Ingreso trend chart (oldest first). A superset of prevMonths
  // above, so the same histRows/envelope-deposit fetches below can serve
  // both this and the existing 3-month budget average without a second
  // round-trip.
  const TREND_MONTHS_COUNT = 12
  const trendMonths: [number, number][] = []
  for (let i = TREND_MONTHS_COUNT - 1; i >= 0; i--) {
    const d = new Date(year, (month - 1) - i, 1)
    trendMonths.push([d.getFullYear(), d.getMonth() + 1])
  }
  const trendYears     = [...new Set(trendMonths.map(([y]) => y))]
  const trendMonthN    = [...new Set(trendMonths.map(([, mn]) => mn))]
  const trendStartDate = `${trendMonths[0][0]}-${String(trendMonths[0][1]).padStart(2, '0')}-01`

  // Last day of the viewed month (for temporal budget filtering)
  const lastDayOfMonth = new Date(year, month, 0).toISOString().slice(0, 10)

  // Aguinaldo (CR 13th-month bonus): legal base is gross ordinary + extraordinary
  // salary earned Dec 1 (prev year) through Nov 30 — independent of which month
  // is being browsed above, always anchored to today's real date so it doesn't
  // shift while paging through past/future budget months.
  const aguinaldoYear = now.getFullYear()
  const aguinaldoPeriodStart = `${aguinaldoYear - 1}-12-01`
  const aguinaldoPeriodEnd   = `${aguinaldoYear}-11-30`

  const [
    { data: allBudgetRows },
    { data: txRows },
    { data: histRows },
    { data: incomeTxRows },
    { data: catRows },
    { data: envelopeRows },
    { data: accountRows },
    { data: monthlyDoneRows },
    { data: aguinaldoBaseTxRows },
    { data: aguinaldoPaidTxRows },
    { data: aguinaldoAllocRows },
    { data: aguinaldoGrossRows },
    { data: envelopeDepositRows },
  ] = await Promise.all([
    admin.from('budgets')
      .select('id, category, monthly_limit, q1_amount, q2_amount, q1_done, q2_done, sort_order, budget_type, effective_from, notes, envelope_id, auto_tx_category_code, auto_tx_account_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .lte('effective_from', lastDayOfMonth)
      .order('sort_order')
      .order('category')
      .order('effective_from', { ascending: false }),

    // Current month expenses split by day (for Q1/Q2 actuals)
    admin.from('transactions')
      .select('category_code, amount, currency_code, amount_usd, expense_group, day')
      .eq('user_id', user.id)
      .in('movement_type', ['expense', 'cash_withdrawal'])
      .eq('year', year)
      .eq('month', month)
      .not('amount', 'is', null),

    // Last 12 months (trendMonths ⊇ the 3-month prevMonths window) —
    // serves both the 3-month budget average below and the 12-month trend.
    admin.from('transactions')
      .select('category_code, amount, currency_code, amount_usd, expense_group, year, month, day')
      .eq('user_id', user.id)
      .in('movement_type', ['expense', 'cash_withdrawal'])
      .in('year', trendYears)
      .in('month', trendMonthN)
      .not('amount', 'is', null),

    // Income over the same 12-month trend window — incomeActual below
    // filters this down to just the viewed month.
    admin.from('transactions')
      .select('amount, currency_code, amount_usd, year, month')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .eq('is_settlement', false)
      .in('year', trendYears)
      .in('month', trendMonthN)
      .not('amount', 'is', null),

    admin.from('transaction_categories')
      .select('code, name')
      .eq('is_active', true)
      .order('name'),

    admin.from('savings_envelopes')
      .select('id, name, parent_envelope_id, custodio, counts_as_ahorro')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),

    admin.from('financial_accounts')
      .select('id, name, account_type')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),

    // Per-month done state + manual actuals
    admin.from('budget_monthly_done')
      .select('category, q1_done, q2_done, q1_actual, q2_actual')
      .eq('user_id', user.id)
      .eq('year', year)
      .eq('month', month),

    // Salary + bono earned during the legal aguinaldo period — the base for
    // the estimate, independent of the browsed month/year above.
    admin.from('transactions')
      .select('amount, currency_code, amount_usd')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .in('category_code', ['SALARY', 'BONO'])
      .gte('date', aguinaldoPeriodStart)
      .lte('date', aguinaldoPeriodEnd)
      .not('amount', 'is', null),

    // Already-deposited aguinaldo for this cycle, if the real payment already
    // landed in December — takes priority over the estimate once it exists.
    admin.from('transactions')
      .select('amount, currency_code, amount_usd')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .eq('category_code', 'AGUINALDO')
      .gte('date', `${aguinaldoYear}-12-01`)
      .lte('date', `${aguinaldoYear}-12-31`)
      .not('amount', 'is', null),

    admin.from('aguinaldo_allocations')
      .select('id, year, label, amount, real_amount, group_name, category_code, envelope_id, sort_order')
      .eq('user_id', user.id)
      .eq('year', aguinaldoYear)
      .order('sort_order'),

    // Real gross-salary ledger (per quincena, entered manually from payslips)
    // — isolated from `transactions`, used only for this estimate. Takes
    // priority over the net-deposit approximation above whenever it has
    // entries, since net salary excludes CCSS/renta withholdings and
    // understates the legal (gross-based) aguinaldo formula.
    admin.from('aguinaldo_gross_salary')
      .select('id, pay_date, gross_amount, notes')
      .eq('user_id', user.id)
      .order('pay_date'),

    // Gross ahorro — raw deposits into counts_as_ahorro envelopes, this
    // month and the previous 3 (for the historical average below). NOT
    // netted against later withdrawals (unlike /resumen's "Ahorro" card):
    // a sobre you fund monthly and later spend down for its own purpose
    // (vacaciones, marchamo, Emma, Mariam) nets toward zero over a wide
    // window on /resumen, which is correct for "what's left unspent" but
    // hides the actual month-to-month saving habit — the thing this card
    // answers instead. See that chat thread for the full reasoning.
    admin.from('envelope_movements')
      .select('amount, envelope_id, date, notes')
      .eq('user_id', user.id)
      .eq('movement_type', 'deposito')
      .gte('date', trendStartDate)
      .lte('date', lastDayOfMonth),
  ])

  // Dedup: keep only the most recent effective row per category
  // (rows are already sorted effective_from DESC, so first occurrence wins)
  // Done-state priority: monthly_done record > budget-row value (current month only) > false
  // This prevents marks from one month bleeding into other months while keeping the budget-row
  // as a safe fallback for the current month (avoids optimistic-rollback flicker).
  const isCurrentViewMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const seen = new Set<string>()
  const monthlyDoneMap = new Map((monthlyDoneRows ?? []).map(d => [d.category, d]))
  const budgetRows = (allBudgetRows ?? []).filter(b => {
    if (seen.has(b.category)) return false
    seen.add(b.category)
    return true
  }).map(b => {
    const md = monthlyDoneMap.get(b.category)
    const q1_done   = md ? md.q1_done   : (isCurrentViewMonth ? b.q1_done : false)
    const q2_done   = md ? md.q2_done   : (isCurrentViewMonth ? b.q2_done : false)
    const q1_actual = md?.q1_actual ?? null
    const q2_actual = md?.q2_actual ?? null
    return { ...b, q1_done, q2_done, q1_actual, q2_actual }
  })

  function toCRC(tx: { amount: number | null; currency_code: string | null; amount_usd: number | null }) {
    return tx.currency_code === 'CRC'
      ? Number(tx.amount ?? 0)
      : Number(tx.amount_usd ?? 0) * tcRate
  }

  // Actual Q1 (day 1-15) and Q2 (day 16+)
  // Indexed by BOTH group label AND raw category_code so budget rows match
  // regardless of whether they use auto_tx_category_code or a free-text name.
  const actualQ1: Record<string, number> = {}
  const actualQ2: Record<string, number> = {}
  for (const tx of txRows ?? []) {
    if (tx.expense_group === 'objetivos_financieros') continue
    const code  = tx.category_code ?? 'MISC_EXPENSE'
    const group = getGroupLabel(code)
    const crc   = toCRC(tx)
    const day   = tx.day ?? 0
    if (day <= 15) {
      actualQ1[group] = (actualQ1[group] ?? 0) + crc
      if (code !== group) actualQ1[code] = (actualQ1[code] ?? 0) + crc
    } else {
      actualQ2[group] = (actualQ2[group] ?? 0) + crc
      if (code !== group) actualQ2[code] = (actualQ2[code] ?? 0) + crc
    }
  }

  // Historical avg (last 3 months) per L1 group, split by quincena
  const histQ1PerGroupMonth: Record<string, Record<string, number>> = {}
  const histQ2PerGroupMonth: Record<string, Record<string, number>> = {}
  for (const tx of histRows ?? []) {
    const key = `${tx.year}-${tx.month}`
    if (!prevMonths.some(([py, pm]) => py === tx.year && pm === tx.month)) continue
    if (tx.expense_group === 'objetivos_financieros') continue
    const group = getGroupLabel(tx.category_code ?? 'MISC_EXPENSE')
    const crc = toCRC(tx)
    const day = tx.day ?? 0
    if (day <= 15) {
      if (!histQ1PerGroupMonth[group]) histQ1PerGroupMonth[group] = {}
      histQ1PerGroupMonth[group][key] = (histQ1PerGroupMonth[group][key] ?? 0) + crc
    } else {
      if (!histQ2PerGroupMonth[group]) histQ2PerGroupMonth[group] = {}
      histQ2PerGroupMonth[group][key] = (histQ2PerGroupMonth[group][key] ?? 0) + crc
    }
  }
  const histQ1: Record<string, number> = {}
  const histQ2: Record<string, number> = {}
  for (const [group, byMonth] of Object.entries(histQ1PerGroupMonth)) {
    const vals = Object.values(byMonth)
    if (vals.length) histQ1[group] = vals.reduce((a, b) => a + b, 0) / vals.length
  }
  for (const [group, byMonth] of Object.entries(histQ2PerGroupMonth)) {
    const vals = Object.values(byMonth)
    if (vals.length) histQ2[group] = vals.reduce((a, b) => a + b, 0) / vals.length
  }

  // Single per-quincena historical reference (avg of Q1 avg and Q2 avg)
  const history: Record<string, number> = {}
  for (const group of new Set([...Object.keys(histQ1), ...Object.keys(histQ2)])) {
    const hasQ1 = histQ1[group] !== undefined
    const hasQ2 = histQ2[group] !== undefined
    if (hasQ1 && hasQ2) history[group] = (histQ1[group] + histQ2[group]) / 2
    else if (hasQ1)     history[group] = histQ1[group]
    else                history[group] = histQ2[group]
  }

  // Actual income — incomeTxRows now spans the 12-month trend window, so
  // filter down to just the viewed month here; incomeByMonth below keeps
  // the full spread for the trend chart.
  const incomeByMonth: Record<string, number> = {}
  for (const tx of incomeTxRows ?? []) {
    const ym = `${tx.year}-${String(tx.month).padStart(2, '0')}`
    incomeByMonth[ym] = (incomeByMonth[ym] ?? 0) + toCRC(tx)
  }
  const incomeActual = incomeByMonth[`${year}-${String(month).padStart(2, '0')}`] ?? 0

  // Ahorro real (bruto) — same "balance-correction noise" exclusion
  // ahorroInversionFlow.ts uses for the real deposit/withdrawal rule.
  const ahorroEnvelopeIds = new Set(
    (envelopeRows ?? []).filter(e => e.counts_as_ahorro === true).map(e => e.id)
  )
  const isRealDeposit = (m: { envelope_id: string; notes: string | null }) =>
    ahorroEnvelopeIds.has(m.envelope_id) &&
    !/restauraci[oó]n\s*(de\s*)?saldo|ajuste\s*de\s*saldo/i.test(m.notes ?? '')
  const ahorroByMonth: Record<string, number> = {}
  for (const m of envelopeDepositRows ?? []) {
    if (!m.date || !isRealDeposit(m)) continue
    const ym = m.date.slice(0, 7)
    ahorroByMonth[ym] = (ahorroByMonth[ym] ?? 0) + Number(m.amount)
  }
  const thisMonthKey = `${year}-${String(month).padStart(2, '0')}`
  function histAvg(byMonth: Record<string, number>) {
    const vals = prevMonths
      .map(([py, pm]) => byMonth[`${py}-${String(pm).padStart(2, '0')}`])
      .filter((v): v is number => v !== undefined)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const ahorroGrossThisMonth = ahorroByMonth[thisMonthKey] ?? 0
  const ahorroGrossHistAvg   = histAvg(ahorroByMonth)

  // Gasto real (bruto) — lifestyle spending, same objetivos_financieros
  // exclusion actualQ1/actualQ2 already use (those can't be summed directly
  // for a clean total — each tx is double-keyed by both group AND category
  // code to match budget rows either way).
  const gastoRealThisMonth = (txRows ?? [])
    .filter(tx => tx.expense_group !== 'objetivos_financieros')
    .reduce((s, tx) => s + toCRC(tx), 0)

  // Inversión real (bruto) — objetivos_financieros rows whose category is an
  // investment code (SAVINGS_INVESTMENT/SAVINGS_PENSION — direct fund/
  // pension contributions). Disjoint from Ahorro real above: those sobres
  // (Vacaciones, Marchamo, Emma…) never carry an investment category_code,
  // and these fund/pension transactions never touch an envelope — verified
  // against this account's actual data, not assumed.
  const inversionRealThisMonth = (txRows ?? [])
    .filter(tx => tx.expense_group === 'objetivos_financieros' && isInversionCategoryCode(tx.category_code))
    .reduce((s, tx) => s + toCRC(tx), 0)

  // Segundo nivel — de qué está hecho cada rubro, this month only.
  function toBreakdown(map: Record<string, number>) {
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .filter(r => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }
  const gastoBreakdownMap: Record<string, number> = {}
  for (const tx of txRows ?? []) {
    if (tx.expense_group === 'objetivos_financieros') continue
    const label = getGroupLabel(tx.category_code ?? 'MISC_EXPENSE')
    gastoBreakdownMap[label] = (gastoBreakdownMap[label] ?? 0) + toCRC(tx)
  }
  const gastoBreakdownThisMonth = toBreakdown(gastoBreakdownMap)

  const envelopeNameMap = new Map((envelopeRows ?? []).map(e => [e.id, e.name]))
  const ahorroBreakdownMap: Record<string, number> = {}
  for (const m of envelopeDepositRows ?? []) {
    if (!m.date || !isRealDeposit(m) || m.date.slice(0, 7) !== thisMonthKey) continue
    const label = envelopeNameMap.get(m.envelope_id) ?? 'Sobre'
    ahorroBreakdownMap[label] = (ahorroBreakdownMap[label] ?? 0) + Number(m.amount)
  }
  const ahorroBreakdownThisMonth = toBreakdown(ahorroBreakdownMap)

  const inversionBreakdownMap: Record<string, number> = {}
  for (const tx of txRows ?? []) {
    if (tx.expense_group !== 'objetivos_financieros' || !isInversionCategoryCode(tx.category_code)) continue
    const label = displayCategory(tx.category_code ?? '')
    inversionBreakdownMap[label] = (inversionBreakdownMap[label] ?? 0) + toCRC(tx)
  }
  const inversionBreakdownThisMonth = toBreakdown(inversionBreakdownMap)

  // Full 12-month spread (not just the 3-month prevMonths window — histRows
  // itself now covers the whole trend range) for Gasto/Inversión, same as
  // ahorroByMonth above.
  const gastoByMonth: Record<string, number> = {}
  const inversionByMonth: Record<string, number> = {}
  for (const tx of histRows ?? []) {
    if (!trendMonths.some(([py, pm]) => py === tx.year && pm === tx.month)) continue
    const ym = `${tx.year}-${String(tx.month).padStart(2, '0')}`
    const crc = toCRC(tx)
    if (tx.expense_group !== 'objetivos_financieros') {
      gastoByMonth[ym] = (gastoByMonth[ym] ?? 0) + crc
    } else if (isInversionCategoryCode(tx.category_code)) {
      inversionByMonth[ym] = (inversionByMonth[ym] ?? 0) + crc
    }
  }
  const gastoRealHistAvg     = histAvg(gastoByMonth)
  const inversionRealHistAvg = histAvg(inversionByMonth)

  // Ingreso explicit + Margen (surplus/deficit) for the viewed month — Gasto
  // + Ahorro + Inversión can legitimately exceed Ingreso for a single month
  // (spending down savings/credit from before), so this is the number that
  // actually answers "¿fue más que el ingreso?" instead of leaving three
  // percentages that don't visibly sum to 100%.
  const marginThisMonth = incomeActual - (gastoRealThisMonth + ahorroGrossThisMonth + inversionRealThisMonth)

  // 12-month trend — same four figures, one row per month, oldest first —
  // so the composition above isn't just a single-month snapshot.
  const trendData = trendMonths.map(([ty, tm]) => {
    const ym = `${ty}-${String(tm).padStart(2, '0')}`
    const income    = incomeByMonth[ym] ?? 0
    const gasto     = gastoByMonth[ym] ?? 0
    const ahorro    = ahorroByMonth[ym] ?? 0
    const inversion = inversionByMonth[ym] ?? 0
    return { month: ym, income, gasto, ahorro, inversion, margin: income - (gasto + ahorro + inversion) }
  })

  // Suggestions for combobox (from DB — no hardcoding)
  const suggSet = new Set<string>()
  for (const cat of catRows ?? []) {
    suggSet.add(getGroupLabel(cat.code))
    suggSet.add(displayCategory(cat.code))
    suggSet.add(cat.name)
  }
  const suggestions = [...suggSet].filter(Boolean).sort()

  // Aguinaldo estimate, in priority order:
  // 1. Already deposited (real AGUINALDO-coded transaction in December) — no
  //    point projecting once the actual number is known.
  // 2. Real gross-salary ledger (payslip data entered by hand) within the
  //    legal period — literal sum ÷ 12. Most accurate when coverage is full;
  //    reported months-covered lets the UI flag a partial/understated figure.
  // 3. Net salary deposits (SALARY + BONO transactions) ÷ 12 — a fallback
  //    approximation that understates the true (gross-based) amount, since
  //    it's net of CCSS/renta withholdings.
  const grossEntriesInPeriod = (aguinaldoGrossRows ?? []).filter(
    e => e.pay_date >= aguinaldoPeriodStart && e.pay_date <= aguinaldoPeriodEnd
  )
  const aguinaldoGrossSum = grossEntriesInPeriod.reduce((s, e) => s + Number(e.gross_amount), 0)
  const grossMonthsCovered = new Set(grossEntriesInPeriod.map(e => e.pay_date.slice(0, 7))).size

  const aguinaldoNetBase  = (aguinaldoBaseTxRows ?? []).reduce((s, tx) => s + toCRC(tx), 0)
  const aguinaldoReceived = (aguinaldoPaidTxRows ?? []).reduce((s, tx) => s + toCRC(tx), 0)

  const aguinaldoEstimated = aguinaldoGrossSum > 0 ? aguinaldoGrossSum / 12 : aguinaldoNetBase / 12
  const aguinaldoSource: 'gross' | 'net' = aguinaldoGrossSum > 0 ? 'gross' : 'net'

  // Projected estimate: fills any quincena missing from the period (out of
  // the expected 2 per month) — more accurate than the strict sum ÷ 12 above
  // when the gap is unpaid-yet months (e.g. Oct/Nov) rather than genuinely
  // unknown ones, since those months really will be paid, not zero.
  // A month with one known quincena (e.g. Dec — II recorded, I missing)
  // fills the gap with THAT month's own rate, not the latest one — a month
  // with zero entries (e.g. unpaid Oct/Nov) forward-fills from the latest
  // known rate instead, since a flat "use the latest rate everywhere" would
  // wrongly apply the current post-raise rate to a pre-raise historical gap.
  let aguinaldoProjected: number | null = null
  if (grossEntriesInPeriod.length > 0) {
    const latestRate = [...grossEntriesInPeriod].sort((a, b) => b.pay_date.localeCompare(a.pay_date))[0].gross_amount
    const entriesByMonth: Record<string, number[]> = {}
    for (const e of grossEntriesInPeriod) {
      const ym = e.pay_date.slice(0, 7)
      ;(entriesByMonth[ym] ??= []).push(Number(e.gross_amount))
    }
    let missingAmount = 0
    const cursor = new Date(aguinaldoPeriodStart + 'T00:00:00')
    for (let i = 0; i < 12; i++) {
      const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      const known = entriesByMonth[ym] ?? []
      const missingCount = Math.max(0, 2 - known.length)
      if (missingCount > 0) {
        const fillRate = known.length > 0 ? known.reduce((s, v) => s + v, 0) / known.length : Number(latestRate)
        missingAmount += missingCount * fillRate
      }
      cursor.setMonth(cursor.getMonth() + 1)
    }
    aguinaldoProjected = (aguinaldoGrossSum + missingAmount) / 12
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <PresupuestoClient
        budgets={budgetRows ?? []}
        actualQ1={actualQ1}
        actualQ2={actualQ2}
        history={history}
        incomeActual={incomeActual}
        year={year}
        month={month}
        suggestions={suggestions}
        envelopes={(envelopeRows ?? []) as Envelope[]}
        txCategories={(catRows ?? []) as TxCategory[]}
        accounts={(accountRows ?? []) as FinancialAccount[]}
        ahorroGrossThisMonth={ahorroGrossThisMonth}
        ahorroGrossHistAvg={ahorroGrossHistAvg}
        gastoRealThisMonth={gastoRealThisMonth}
        gastoRealHistAvg={gastoRealHistAvg}
        inversionRealThisMonth={inversionRealThisMonth}
        inversionRealHistAvg={inversionRealHistAvg}
        marginThisMonth={marginThisMonth}
        trendData={trendData}
        gastoBreakdownThisMonth={gastoBreakdownThisMonth}
        ahorroBreakdownThisMonth={ahorroBreakdownThisMonth}
        inversionBreakdownThisMonth={inversionBreakdownThisMonth}
      />
      <AguinaldoSection
        year={aguinaldoYear}
        periodStart={aguinaldoPeriodStart}
        periodEnd={aguinaldoPeriodEnd}
        estimatedAmount={aguinaldoEstimated}
        estimateSource={aguinaldoSource}
        monthsCovered={grossMonthsCovered}
        projectedAmount={aguinaldoProjected}
        receivedAmount={aguinaldoReceived}
        allocations={aguinaldoAllocRows ?? []}
        grossSalaryEntries={aguinaldoGrossRows ?? []}
        envelopes={(envelopeRows ?? []) as Envelope[]}
        txCategories={(catRows ?? []) as TxCategory[]}
      />
    </div>
  )
}
