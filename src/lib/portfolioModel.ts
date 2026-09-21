// Tropicalized Golden Butterfly model: maps real CR holdings to categories by
// economic FUNCTION (growth engine, high-beta growth, local fixed income,
// crisis hedge, cash, rental real estate) instead of forcing US labels
// (stocks/bonds/gold) onto instruments that don't behave like them — e.g.
// crypto sits under growth_high_risk (correlates with risk-off selloffs),
// not gold_hedge (which is supposed to be uncorrelated). Locked pension funds
// (ROP & FCL, Pensión Voluntaria) are shown as context only — they're forced
// savings, not a lever the user can rebalance today.

export type PortfolioModelCategory =
  | 'growth_global'
  | 'growth_high_risk'
  | 'fixed_income_local'
  | 'gold_hedge'
  | 'cash'
  | 'real_estate_rental'
  | 'pension_locked'

export const ACTIONABLE_CATEGORIES: PortfolioModelCategory[] = [
  'growth_global',
  'growth_high_risk',
  'fixed_income_local',
  'gold_hedge',
  'cash',
  'real_estate_rental',
]

export const CONTEXT_CATEGORIES: PortfolioModelCategory[] = ['pension_locked']

export const ALL_CATEGORIES: PortfolioModelCategory[] = [...ACTIONABLE_CATEGORIES, ...CONTEXT_CATEGORIES]

export const CATEGORY_LABELS: Record<PortfolioModelCategory, string> = {
  growth_global: 'Crecimiento global',
  growth_high_risk: 'Crecimiento alto riesgo',
  fixed_income_local: 'Renta fija local',
  gold_hedge: 'Cobertura (oro)',
  cash: 'Liquidez',
  real_estate_rental: 'Renta inmobiliaria',
  pension_locked: 'Pensiones (ahorro forzado)',
}

export const CATEGORY_HINTS: Record<PortfolioModelCategory, string> = {
  growth_global: 'Motor de crecimiento — acciones/ETFs globales (prosperidad)',
  growth_high_risk: 'Beta alto del mismo motor — no es cobertura, cae con el riesgo',
  fixed_income_local: 'Renta fija / crédito privado costarricense',
  gold_hedge: 'Descorrelacionado — refugio en pánico/inflación',
  cash: 'Colchón y munición para ir rebalanceando',
  real_estate_rental: 'Renta + apreciación, apalancado e ilíquido',
  pension_locked: 'Ahorro forzado — no es una palanca que muevas hoy',
}

export interface ModelHolding {
  name: string
  category: PortfolioModelCategory | null
  amount: number
}

export interface ModelTargetRow {
  category: string
  target_pct: number
}

export interface ModelCategoryResult {
  category: PortfolioModelCategory
  label: string
  hint: string
  actual: number
  actualPct: number
  targetPct: number
  targetAmount: number
  gapPct: number
  gapAmount: number
  holdings: { name: string; amount: number }[]
}

export interface PortfolioModelResult {
  actionable: ModelCategoryResult[]
  context: ModelCategoryResult[]
  actionableTotal: number
}

export function computePortfolioModel(
  holdings: ModelHolding[],
  targetRows: ModelTargetRow[],
): PortfolioModelResult {
  const targetByCategory = new Map(targetRows.map(t => [t.category, Number(t.target_pct)]))
  const totals: Partial<Record<PortfolioModelCategory, number>> = {}
  const holdingsByCategory: Partial<Record<PortfolioModelCategory, { name: string; amount: number }[]>> = {}

  for (const h of holdings) {
    if (!h.category) continue
    totals[h.category] = (totals[h.category] ?? 0) + h.amount
    const list = holdingsByCategory[h.category] ?? (holdingsByCategory[h.category] = [])
    list.push({ name: h.name, amount: h.amount })
  }

  const actionableTotal = ACTIONABLE_CATEGORIES.reduce((s, c) => s + (totals[c] ?? 0), 0)

  const buildResult = (category: PortfolioModelCategory, isActionable: boolean): ModelCategoryResult => {
    const actual = totals[category] ?? 0
    const targetPct = isActionable ? (targetByCategory.get(category) ?? 0) : 0
    const targetAmount = actionableTotal * (targetPct / 100)
    const actualPct = isActionable && actionableTotal > 0 ? (actual / actionableTotal) * 100 : 0
    return {
      category,
      label: CATEGORY_LABELS[category],
      hint: CATEGORY_HINTS[category],
      actual,
      actualPct,
      targetPct,
      targetAmount,
      gapPct: targetPct - actualPct,
      gapAmount: targetAmount - actual,
      holdings: holdingsByCategory[category] ?? [],
    }
  }

  const actionable = ACTIONABLE_CATEGORIES
    .map(c => buildResult(c, true))
    .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))

  const context = CONTEXT_CATEGORIES.map(c => buildResult(c, false))

  return { actionable, context, actionableTotal }
}
