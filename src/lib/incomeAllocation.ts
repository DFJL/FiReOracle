// Single source of truth for "what bucket does this transaction belong to"
// when answering ingreso → gasto / ahorro / inversión. /resumen, /progreso
// and /flujo each grew their own version of these classifications and they
// drifted — most concretely, /resumen's old isSavings() only matched codes
// starting with 'SAVINGS_', silently missing the bare 'SAVINGS' code ("Ahorro",
// ₡7.37M / 99 transactions in this account) that /progreso had already fixed
// locally. Every page should build its KPIs from these functions instead of
// re-deriving its own.

import { SAVINGS_EXPENSE_GROUP } from '@/app/(dashboard)/resumen/categoryUtils'

export type AllocationTx = {
  movement_type?: string | null
  concept?: string | null
  category_code?: string | null
  expense_group?: string | null
  is_settlement?: boolean | null
  is_passive_income?: boolean | null
}

// A "pérdida/aumento de valor" or "valorización" concept marks a pure
// mark-to-market adjustment — never real income or a real deposit.
export function isValuationConcept(concept: string | null | undefined): boolean {
  return /p[eé]rdida\s*valor|aumento\s*valor|valorizaci[oó]n/i.test(concept ?? '')
}

// Passive income actually earned — cashed out (movement_type 'income') or
// accrued/reinvested (movement_type null, e.g. TRANSCOMER/crypto farming
// that compounds instead of being withdrawn) both count as real yield.
// APPRECIATION (pure unrealized mark-to-market) and valuation-concept rows
// don't — those are capital gains/losses, not earned passive income.
export function isRealizedPassiveIncome(
  tx: Pick<AllocationTx, 'is_passive_income' | 'is_settlement' | 'category_code' | 'concept'>,
): boolean {
  return !!tx.is_passive_income && !tx.is_settlement && tx.category_code !== 'APPRECIATION' && !isValuationConcept(tx.concept)
}

// Active (non-passive) income — the denominator /resumen and /progreso both
// use for "tasa de ahorro". Deliberately does NOT exclude is_settlement
// (liquidaciones): ₡241M / 168 transactions in this account are settlement
// income, and neither page currently excludes it from this denominator —
// changing that is a real definitional call, not a drift bug, so it's left
// as-is pending an explicit decision to change it.
export function isActiveIncome(
  tx: Pick<AllocationTx, 'movement_type' | 'is_passive_income'>,
): boolean {
  return tx.movement_type === 'income' && !tx.is_passive_income
}

// The bare 'SAVINGS' code ("Ahorro") doesn't start with 'SAVINGS_' — a
// `.startsWith('SAVINGS_')` check alone silently excludes it.
export function isSavingsCategoryCode(code: string | null | undefined): boolean {
  return code === 'SAVINGS' || (code ?? '').startsWith('SAVINGS_')
}

// Within objetivos_financieros, which SAVINGS_* codes have market exposure
// (inversión, expected return) vs just sit liquid (ahorro puro).
export const INVERSION_CATEGORY_CODES = new Set(['SAVINGS_INVESTMENT', 'SAVINGS_PENSION'])

export function isInversionCategoryCode(code: string | null | undefined): boolean {
  return INVERSION_CATEGORY_CODES.has(code ?? '')
}

// A transaction that represents money being set aside (ahorro puro or
// inversión con retorno esperado) rather than consumed — the deposit-side
// counterpart to isSavingsCategoryCode. Loan principal paydowns beyond the
// required installment are a separate, deliberate deposit type handled by
// isExtraLoanPrincipalPayment (@/lib/lifestyleExpenses), not this function.
export function isDepositTx(
  tx: Pick<AllocationTx, 'movement_type' | 'is_settlement' | 'concept' | 'expense_group' | 'category_code'>,
): boolean {
  return (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')
    && !tx.is_settlement
    && !isValuationConcept(tx.concept)
    && tx.expense_group === SAVINGS_EXPENSE_GROUP
    && isSavingsCategoryCode(tx.category_code)
}
