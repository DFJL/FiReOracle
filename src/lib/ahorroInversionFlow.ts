// Window-parametrized version of the ingreso → gasto/ahorro/inversión/deuda
// split that /progreso's AhorroInversionSection computes, but hardcoded to a
// rolling 12 calendar months (see progreso/page.tsx's `for (let i = 12...)`
// loop). This generalizes that same classification (same functions from
// @/lib/incomeAllocation, same isExtraLoanPrincipalPayment, same envelope-
// contribution rule) to an arbitrary [from, to) range, so both the KPI
// window selector and the income-flow diagram can share one source of truth
// instead of growing their own copies.
//
// Unlike avgMonthlyExpenses (outlier-cleaned, for FIRE/runway projection),
// `gasto` here is the literal ledger total for the window — a flow diagram
// has to conserve (income in = everything out), so smoothing away an
// outlier would make money vanish from the picture instead of just the
// average.

import { isActiveIncome, isSavingsCategoryCode, INVERSION_CATEGORY_CODES, isValuationConcept } from './incomeAllocation'
import { isExtraLoanPrincipalPayment } from './lifestyleExpenses'
import { isLoanPayment } from '@/app/(dashboard)/resumen/categoryUtils'

export type FlowTx = {
  date: string | null
  amount: number | string | null
  movement_type: string | null
  is_settlement?: boolean | null
  is_passive_income?: boolean | null
  is_survival_expense?: boolean | null
  expense_group?: string | null
  category_code?: string | null
  concept?: string | null
  vendor?: string | null
}

export type FlowMovement = {
  date: string | null
  amount: number | string
  movement_type: string | null
  envelope_id: string
  notes?: string | null
}

export type SourceAmount = { name: string; amount: number }

export type FlowWindow = {
  from: string
  to: string
  income: number
  gasto: number
  /** Within gasto — necesario (is_survival_expense) vs. everything else. gastoSurvival + gastoDiscrecional === gasto. */
  gastoSurvival: number
  gastoDiscrecional: number
  /** Regular/scheduled loan installments — isLoanPayment but not the extra/discretionary kind (that's `deuda`). */
  cuotas: number
  ahorro: number
  inversion: number
  deuda: number
  /** income − (gasto+cuotas+ahorro+inversion+deuda) — can be negative (a real deficit, financed from savings/credit). */
  remainder: number
  gastoSources: SourceAmount[]
  cuotasSources: SourceAmount[]
  ahorroSources: SourceAmount[]
  inversionSources: SourceAmount[]
  deudaSources: SourceAmount[]
}

// Destination detail for a deposit/expense tx — vendor is the real
// destination; fall back to concept for the odd row where vendor is 'NA'.
function depositDestination(tx: { vendor?: string | null; concept?: string | null }): string | null {
  const v = tx.vendor?.trim()
  if (v && !/^na$/i.test(v)) return v
  return tx.concept?.trim() || null
}

type SourceMap = Record<string, number>
function addSource(map: SourceMap, baseName: string, destination: string | null, amt: number) {
  const name = destination && destination !== baseName ? `${baseName} · ${destination}` : baseName
  map[name] = (map[name] ?? 0) + amt
}
function toSourceList(map: SourceMap): SourceAmount[] {
  // A source can legitimately net to <=0 (e.g. an ahorro sobre that was
  // withdrawn from more than it was deposited into this window) — drop it
  // rather than show a negative-amount row a bar list can't render sanely.
  return Object.entries(map)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }))
}

export type FlowBucket = 'gasto' | 'cuotas' | 'ahorro' | 'inversion' | 'deuda'

/**
 * Which bucket a single outflow transaction belongs to, or null if it's not
 * one at all (income, settlement, valuation). Exported so any renderer that
 * needs its own grouping of the same transactions — e.g. IncomeFunnel
 * grouping Gasto by expense category rather than by vendor — still agrees
 * tx-by-tx with the totals computeFlowWindow reports, instead of growing a
 * second copy of this decision.
 *
 * cuotas vs. gasto vs. deuda, all three loan-payment-adjacent: a regular
 * scheduled installment (isLoanPayment) is `cuotas` — a real recurring
 * obligation, not discretionary lifestyle spending, so it doesn't belong
 * in `gasto` either. An *extra* paydown beyond the schedule
 * (isExtraLoanPrincipalPayment — "abono extra", "pago extraordinario") is
 * `deuda`: discretionary, optional, building equity faster. Everything
 * else expense-shaped is `gasto`.
 */
export function classifyFlowTx(tx: FlowTx): FlowBucket | null {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return null
  if (tx.is_settlement) return null
  if (isValuationConcept(tx.concept)) return null

  if (isExtraLoanPrincipalPayment(tx.concept ?? null, tx.category_code ?? null)) return 'deuda'
  if (isLoanPayment(tx.vendor ?? null, tx.concept ?? null, tx.category_code ?? null)) return 'cuotas'
  if (tx.expense_group === 'objetivos_financieros' && isSavingsCategoryCode(tx.category_code)) {
    return INVERSION_CATEGORY_CODES.has(tx.category_code ?? '') ? 'inversion' : 'ahorro'
  }
  return 'gasto'
}

export function computeFlowWindow(
  txs: FlowTx[],
  movements: FlowMovement[],
  savingsEnvelopeIds: Set<string>,
  envelopeNameMap: Map<string, string>,
  catNameMap: Map<string, string>,
  from: string,
  to: string, // exclusive, 'YYYY-MM-DD'
): FlowWindow {
  const windowTxs = txs.filter(tx => tx.date && tx.date >= from && tx.date < to)
  const windowMovements = movements.filter(m => m.date && m.date >= from && m.date < to)

  // isActiveIncome, not a hand-rolled check — includes settlement income on
  // purpose (same as avgMonthlyIncome elsewhere on this page; see that
  // function's own comment for why this is a deliberate, still-open call
  // rather than a drift bug).
  const income = windowTxs
    .filter(isActiveIncome)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

  const gastoSourceMap: SourceMap = {}
  const cuotasSourceMap: SourceMap = {}
  const ahorroSourceMap: SourceMap = {}
  const inversionSourceMap: SourceMap = {}
  const deudaSourceMap: SourceMap = {}

  let ahorro = 0, inversion = 0, deuda = 0, gasto = 0, cuotas = 0
  let gastoSurvival = 0

  for (const tx of windowTxs) {
    const bucket = classifyFlowTx(tx)
    if (!bucket) continue

    const amt = Number(tx.amount ?? 0)
    const dest = depositDestination(tx)

    if (bucket === 'deuda') {
      deuda += amt
      const name = tx.concept || tx.vendor || 'Abono extra'
      addSource(deudaSourceMap, name, null, amt)
    } else if (bucket === 'cuotas') {
      cuotas += amt
      const baseName = (tx.category_code && catNameMap.get(tx.category_code)) || tx.category_code || 'Cuotas'
      addSource(cuotasSourceMap, baseName, dest, amt)
    } else if (bucket === 'inversion') {
      inversion += amt
      const baseName = (tx.category_code && catNameMap.get(tx.category_code)) || tx.category_code || 'Inversión'
      addSource(inversionSourceMap, baseName, dest, amt)
    } else if (bucket === 'ahorro') {
      ahorro += amt
      const baseName = (tx.category_code && catNameMap.get(tx.category_code)) || tx.category_code || 'Ahorro'
      addSource(ahorroSourceMap, baseName, dest, amt)
    } else {
      gasto += amt
      if (tx.is_survival_expense) gastoSurvival += amt
      const baseName = (tx.category_code && catNameMap.get(tx.category_code)) || tx.category_code || 'Gasto'
      addSource(gastoSourceMap, baseName, dest, amt)
    }
  }

  // Envelope CONTRIBUTIONS count as ahorro, net of withdrawals from those
  // same sobres within the window — a deposit that gets pulled back out
  // again before the window closes (e.g. staged for a loan paydown that
  // then shows up separately as `deuda`) isn't net new savings, even
  // though the deposit itself was a real event. Both sides exclude plain
  // balance-correction noise; traslado_in/out between sobres is left out
  // on purpose (money moving between two ahorro sobres is still ahorro,
  // nothing left the system).
  const isRealEnvelopeMove = (m: FlowMovement) =>
    savingsEnvelopeIds.has(m.envelope_id) &&
    !/restauraci[oó]n\s*(de\s*)?saldo|ajuste\s*de\s*saldo/i.test(m.notes ?? '')
  for (const m of windowMovements) {
    if (!isRealEnvelopeMove(m)) continue
    const name = envelopeNameMap.get(m.envelope_id) ?? 'Sobre'
    if (m.movement_type === 'deposito') {
      const amt = Number(m.amount)
      ahorro += amt
      addSource(ahorroSourceMap, name, null, amt)
    } else if (m.movement_type === 'retiro') {
      const amt = Number(m.amount) // already negative in the ledger
      ahorro += amt
      addSource(ahorroSourceMap, name, null, amt)
    }
  }

  const remainder = income - (gasto + cuotas + ahorro + inversion + deuda)

  return {
    from, to, income, gasto, gastoSurvival, gastoDiscrecional: gasto - gastoSurvival,
    cuotas, ahorro, inversion, deuda, remainder,
    gastoSources: toSourceList(gastoSourceMap),
    cuotasSources: toSourceList(cuotasSourceMap),
    ahorroSources: toSourceList(ahorroSourceMap),
    inversionSources: toSourceList(inversionSourceMap),
    deudaSources: toSourceList(deudaSourceMap),
  }
}
