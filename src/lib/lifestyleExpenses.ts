// Single source of truth for "what's my real monthly lifestyle burn" — this
// outlier-cleaning logic used to be duplicated (and drifting) between
// /progreso (Runway, FIRE number) and the dashboard's runway alert banner.
// A single large one-off purchase (a car, an appliance) could otherwise
// inflate a raw 12-month average by 25%+ even though nothing recurring
// actually changed.

import { isLoanPayment } from '@/app/(dashboard)/resumen/categoryUtils'

export type LifestyleTx = {
  date: string | null
  amount: number | null
  movement_type: string | null
  expense_group: string | null
  category_code: string | null
  concept: string | null
  vendor?: string | null
  is_survival_expense?: boolean | null
}

export type CategoryRow = {
  code: string
  parent_code?: string | null
}

export function isValuation(concept: string | null): boolean {
  return /p[eé]rdida\s*valor|aumento\s*valor/i.test(concept ?? '')
}

// Extra/discretionary loan principal paydowns build equity like any other
// investment — unlike the regular monthly installment (interest + scheduled
// principal), which stays a pure obligation for Runway purposes. Matched by
// concept text, not expense_group, since these get logged under both
// 'necesario' and 'objetivos_financieros' depending on how the user tagged
// them. Shared by /progreso (savings rate + runway) and the alert banner.
export function isExtraLoanPrincipalPayment(concept: string | null, categoryCode: string | null): boolean {
  if (!categoryCode || !/LOAN|PRESTAM/i.test(categoryCode)) return false
  return /extraordinari|abono\s*extra/i.test(concept ?? '')
}

export function buildRootCodeMap(categories: CategoryRow[]): (code: string) => string {
  const catChildMap = new Map<string, string>()
  for (const cat of categories) {
    if (cat.parent_code) catChildMap.set(cat.code, cat.parent_code)
  }
  return (code: string) => catChildMap.get(code) ?? code
}

export function isLifestyleTx(tx: LifestyleTx, getRootCode: (code: string) => string): boolean {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (tx.expense_group === 'objetivos_financieros') return false
  if (isValuation(tx.concept)) return false
  if (tx.category_code && getRootCode(tx.category_code) === 'LOANS') return false
  return true
}

// Mirrors the user's own is_survival_expense tags rather than the lifestyle
// definition above — the regular loan installment stays IN (it's a real
// obligation you can't skip), while an extraordinary/discretionary paydown
// stays OUT (already counted as savings, not a bare-minimum survival cost).
export function isSurvivalTx(tx: LifestyleTx): boolean {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (!tx.is_survival_expense) return false
  if (isExtraLoanPrincipalPayment(tx.concept, tx.category_code)) return false
  if (tx.expense_group === 'objetivos_financieros' && !isLoanPayment(tx.vendor ?? null, tx.concept, tx.category_code)) return false
  return true
}

export function computeGlobalP95(txs: LifestyleTx[]): number {
  const amounts = txs
    .map(tx => Number(tx.amount ?? 0))
    .filter(a => a > 0)
    .sort((a, b) => a - b)
  return amounts.length > 0 ? amounts[Math.floor(amounts.length * 0.95)] : Infinity
}

// Exported for callers that need to fence a *different* series (e.g. monthly
// category totals rather than individual transactions) against the same
// global P95 reference point used for the tx-level pass above.
export function outlierFence(values: number[], globalP95: number): number {
  const nonZero = values.filter(v => v > 0)
  // Sparse category (e.g. one-off purchase) → use global P95 as reference
  if (nonZero.length < 4) return globalP95
  const s  = [...nonZero].sort((a, b) => a - b)
  const q1 = s[Math.floor(s.length * 0.25)]
  const q3 = s[Math.floor(s.length * 0.75)]
  // 4×Q3 floor avoids over-flagging dense categories (food, fuel) where Q3 is low
  return Math.max(q3 + 1.5 * (q3 - q1), q3 * 4)
}

// Removes single-transaction outliers per root category (IQR fence with a
// 4×Q3 floor; sparse categories fall back to the global P95) so one big
// purchase can't skew a monthly average. Pass in as much history as you
// reasonably can — the fence is more reliable with more data per category.
// Shared by cleanLifestyleOutliers and cleanSurvivalOutliers below so both
// "which spending counts" definitions get identical outlier treatment —
// otherwise one series could be skewed by a one-off purchase the other
// already excludes.
function cleanOutliers<T extends LifestyleTx>(
  txs: T[],
  getRootCode: (code: string) => string,
  matches: (tx: T) => boolean,
): { cleaned: T[]; excludedByRoot: Record<string, number> } {
  const matchingTxs = txs.filter(matches)

  const allAmounts = matchingTxs
    .map(tx => Number(tx.amount ?? 0))
    .filter(a => a > 0)
    .sort((a, b) => a - b)
  const globalP95 = allAmounts.length > 0 ? allAmounts[Math.floor(allAmounts.length * 0.95)] : Infinity

  const rootAmounts: Record<string, number[]> = {}
  for (const tx of matchingTxs) {
    const root = getRootCode(tx.category_code ?? '__na__')
    ;(rootAmounts[root] ??= []).push(Number(tx.amount ?? 0))
  }
  const rootFences = Object.fromEntries(
    Object.entries(rootAmounts).map(([root, amounts]) => [root, outlierFence(amounts, globalP95)])
  )

  const excludedByRoot: Record<string, number> = {}
  const cleaned = matchingTxs.filter(tx => {
    const root      = getRootCode(tx.category_code ?? '__na__')
    const amount    = Number(tx.amount ?? 0)
    const isOutlier = amount > (rootFences[root] ?? Infinity)
    if (isOutlier) excludedByRoot[root] = (excludedByRoot[root] ?? 0) + 1
    return !isOutlier
  })

  return { cleaned, excludedByRoot }
}

export function cleanLifestyleOutliers<T extends LifestyleTx>(
  txs: T[],
  getRootCode: (code: string) => string,
): { cleaned: T[]; excludedByRoot: Record<string, number> } {
  return cleanOutliers(txs, getRootCode, tx => isLifestyleTx(tx, getRootCode))
}

export function cleanSurvivalOutliers<T extends LifestyleTx>(
  txs: T[],
  getRootCode: (code: string) => string,
): { cleaned: T[]; excludedByRoot: Record<string, number> } {
  return cleanOutliers(txs, getRootCode, tx => isSurvivalTx(tx))
}

export function avgMonthlyInWindow<T extends LifestyleTx>(
  cleaned: T[],
  windowStartStr: string,
  windowEndStr: string,
): number {
  return cleaned
    .filter(tx => tx.date && tx.date >= windowStartStr && tx.date < windowEndStr)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0) / 12
}
