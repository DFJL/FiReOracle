// Performance metrics for a rental property asset (cap rate, DSCR, cash-on-cash,
// appreciation, total return) — all derived from real transactions/loan data,
// nothing stored/cached, so it always reflects the current balance and ledger.

export type RentalTx = {
  category_code?: string | null
  amount?: number | string | null
  date?: string | null
}

export function isRentalIncomeTx(tx: Pick<RentalTx, 'category_code'>): boolean {
  return tx.category_code === 'RENTAL_INCOME'
}

export function isRentalExpenseTx(tx: Pick<RentalTx, 'category_code'>): boolean {
  return tx.category_code === 'RENTAL_EXPENSE'
}

export function computeRentalNOI(txs: RentalTx[], startDate: string, endDateExclusive: string) {
  let income = 0
  let expenses = 0
  for (const tx of txs) {
    if (!tx.date || tx.date < startDate || tx.date >= endDateExclusive) continue
    const amt = Number(tx.amount ?? 0)
    if (isRentalIncomeTx(tx)) income += amt
    else if (isRentalExpenseTx(tx)) expenses += amt
  }
  return { income, expenses, noi: income - expenses }
}

export type RentalLoan = {
  current_balance?: number | string | null
  interest_rate?: number | string | null  // annual %, e.g. 6.5
  end_date?: string | null
  currency_code?: string | null
}

// Standard amortizing payment implied by the loan's current balance, rate and
// remaining term to end_date — not a stored cuota (loans has none), and more
// robust than parsing "extraordinario" out of payment transaction text.
export function computeMonthlyDebtService(loan: RentalLoan, asOfDate: Date): number {
  const balance = Number(loan.current_balance ?? 0)
  const annualRate = Number(loan.interest_rate ?? 0) / 100
  if (!balance || !annualRate || !loan.end_date) return 0
  const end = new Date(loan.end_date + 'T12:00:00')
  const msPerMonth = 30.4375 * 24 * 3600 * 1000
  const months = Math.max(1, Math.round((end.getTime() - asOfDate.getTime()) / msPerMonth))
  const i = annualRate / 12
  return (balance * i) / (1 - Math.pow(1 + i, -months))
}

export function computeCapRate(annualNoiCrc: number, valueCrc: number): number | null {
  return valueCrc > 0 ? annualNoiCrc / valueCrc : null
}

export function computeDSCR(noiMonthlyCrc: number, debtServiceMonthlyCrc: number): number | null {
  return debtServiceMonthlyCrc > 0 ? noiMonthlyCrc / debtServiceMonthlyCrc : null
}

export function computeCashOnCash(
  annualNoiCrc: number,
  annualDebtServiceCrc: number,
  equityCrc: number,
): number | null {
  return equityCrc > 0 ? (annualNoiCrc - annualDebtServiceCrc) / equityCrc : null
}

export function computeAppreciationCAGR(
  purchaseValueCrc: number,
  currentValueCrc: number,
  purchaseDate: string,
  asOfDate: string,
): number | null {
  if (!purchaseValueCrc || purchaseValueCrc <= 0 || !currentValueCrc) return null
  const years =
    (new Date(asOfDate + 'T12:00:00').getTime() - new Date(purchaseDate + 'T12:00:00').getTime()) /
    (365.25 * 24 * 3600 * 1000)
  if (years <= 0) return null
  return Math.pow(currentValueCrc / purchaseValueCrc, 1 / years) - 1
}

export function computeTotalReturn(
  cashOnCash: number | null,
  appreciationCAGR: number | null,
): number | null {
  if (cashOnCash === null || appreciationCAGR === null) return null
  return cashOnCash + appreciationCAGR
}

export interface RentalPerformanceInput {
  asset: {
    value_crc: number | string | null
    as_of_date: string | null
    purchase_price_crc: number | string | null
    purchase_date: string | null
  }
  loan: RentalLoan | null
  txs: RentalTx[]
  fxRate: number
  today?: Date
}

export interface RentalPerformance {
  noiMonthly: number
  noiAnnual: number
  capRate: number | null
  debtServiceMonthly: number
  dscr: number | null
  equityCrc: number
  cashOnCash: number | null
  appreciationCAGR: number | null
  totalReturn: number | null
}

export function computeRentalPerformance(input: RentalPerformanceInput): RentalPerformance {
  const today = input.today ?? new Date()
  const valueCrc = Number(input.asset.value_crc ?? 0)
  const asOfDate = input.asset.as_of_date ?? today.toISOString().slice(0, 10)

  const endStr = today.toISOString().slice(0, 10)
  const start = new Date(today)
  start.setFullYear(start.getFullYear() - 1)
  const startStr = start.toISOString().slice(0, 10)
  const { noi } = computeRentalNOI(input.txs, startStr, endStr)
  const noiAnnual = noi
  const noiMonthly = noi / 12

  const capRate = computeCapRate(noiAnnual, valueCrc)

  let debtServiceMonthly = 0
  let loanBalanceCrc = 0
  if (input.loan) {
    const isUsd = (input.loan.currency_code ?? 'CRC') === 'USD'
    const rawService = computeMonthlyDebtService(input.loan, today)
    debtServiceMonthly = isUsd ? rawService * input.fxRate : rawService
    loanBalanceCrc = isUsd
      ? Number(input.loan.current_balance ?? 0) * input.fxRate
      : Number(input.loan.current_balance ?? 0)
  }

  const dscr = computeDSCR(noiMonthly, debtServiceMonthly)
  const equityCrc = valueCrc - loanBalanceCrc
  const cashOnCash = computeCashOnCash(noiAnnual, debtServiceMonthly * 12, equityCrc)

  const purchaseValueCrc = Number(input.asset.purchase_price_crc ?? 0)
  const appreciationCAGR = input.asset.purchase_date
    ? computeAppreciationCAGR(purchaseValueCrc, valueCrc, input.asset.purchase_date, asOfDate)
    : null

  const totalReturn = computeTotalReturn(cashOnCash, appreciationCAGR)

  return { noiMonthly, noiAnnual, capRate, debtServiceMonthly, dscr, equityCrc, cashOnCash, appreciationCAGR, totalReturn }
}
