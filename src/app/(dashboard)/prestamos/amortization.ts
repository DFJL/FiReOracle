// Pure amortization math — no server dependencies

export type ScheduleRow = {
  month: number
  yearMonth: string       // "2026-06"
  balanceStart: number
  interest: number
  principal: number
  insurance: number
  totalPayment: number
  balanceEnd: number
  cumulInterest: number
  cumulPrincipal: number
}

export type AmortizationResult = {
  rows: ScheduleRow[]
  totalInterest: number
  totalPrincipal: number
  payoffYearMonth: string
  monthsRemaining: number
  baseMonthlyPayment: number   // capital + interest only (no insurance, no extra)
}

export function computeSchedule(
  balance: number,
  annualRate: number,        // e.g. 7.67 (percent)
  remainingMonths: number,
  monthlyInsurance: number,
  extraMonthly = 0,
  startYearMonth = '2026-06',
): AmortizationResult {
  const empty: AmortizationResult = {
    rows: [], totalInterest: 0, totalPrincipal: 0,
    payoffYearMonth: startYearMonth, monthsRemaining: 0, baseMonthlyPayment: 0,
  }
  if (balance <= 0 || remainingMonths <= 0) return empty

  const r = annualRate / 100 / 12
  const factor = Math.pow(1 + r, remainingMonths)
  const baseMonthlyPayment = r > 0 ? balance * r * factor / (factor - 1) : balance / remainingMonths

  const rows: ScheduleRow[] = []
  let bal = balance
  let cumulInterest = 0
  let cumulPrincipal = 0

  let [yr, mo] = startYearMonth.split('-').map(Number)

  for (let i = 0; i < 600 && bal > 0.5; i++) {
    const interest  = bal * r
    let principal   = baseMonthlyPayment - interest + extraMonthly
    if (principal > bal) principal = bal
    if (principal < 0)   principal = 0

    const balEnd = Math.max(0, bal - principal)
    cumulInterest  += interest
    cumulPrincipal += principal

    rows.push({
      month: i + 1,
      yearMonth: `${yr}-${String(mo).padStart(2, '0')}`,
      balanceStart: bal,
      interest,
      principal,
      insurance: monthlyInsurance,
      totalPayment: interest + principal + monthlyInsurance,
      balanceEnd: balEnd,
      cumulInterest,
      cumulPrincipal,
    })

    bal = balEnd
    mo++
    if (mo > 12) { mo = 1; yr++ }
  }

  const last = rows[rows.length - 1]
  return {
    rows,
    totalInterest:   last?.cumulInterest  ?? 0,
    totalPrincipal:  last?.cumulPrincipal ?? 0,
    payoffYearMonth: last?.yearMonth      ?? startYearMonth,
    monthsRemaining: rows.length,
    baseMonthlyPayment,
  }
}

export type SimResult = {
  monthsSaved: number
  interestSaved: number
  newPayoffYearMonth: string
  newMonthlyTotal: number
  yearsSaved: number
}

export function simulateExtra(
  balance: number,
  annualRate: number,
  remainingMonths: number,
  monthlyInsurance: number,
  extraMonthly: number,
  startYearMonth: string,
): SimResult {
  const base = computeSchedule(balance, annualRate, remainingMonths, monthlyInsurance, 0, startYearMonth)
  const sim  = computeSchedule(balance, annualRate, remainingMonths, monthlyInsurance, extraMonthly, startYearMonth)
  const monthsSaved = base.monthsRemaining - sim.monthsRemaining
  return {
    monthsSaved,
    yearsSaved: monthsSaved / 12,
    interestSaved: base.totalInterest - sim.totalInterest,
    newPayoffYearMonth: sim.payoffYearMonth,
    newMonthlyTotal: (sim.rows[0]?.totalPayment) ?? 0,
  }
}

export function simulateLumpSum(
  balance: number,
  annualRate: number,
  remainingMonths: number,
  monthlyInsurance: number,
  lumpSum: number,
  startYearMonth: string,
): SimResult {
  const base       = computeSchedule(balance, annualRate, remainingMonths, monthlyInsurance, 0, startYearMonth)
  const newBalance = Math.max(0, balance - lumpSum)
  const sim        = computeSchedule(newBalance, annualRate, remainingMonths, monthlyInsurance, 0, startYearMonth)
  const monthsSaved = base.monthsRemaining - sim.monthsRemaining
  return {
    monthsSaved,
    yearsSaved: monthsSaved / 12,
    interestSaved: base.totalInterest - sim.totalInterest,
    newPayoffYearMonth: sim.payoffYearMonth,
    newMonthlyTotal: (sim.rows[0]?.totalPayment) ?? 0,
  }
}
