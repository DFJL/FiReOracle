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

import { isSavingsCategoryCode, INVERSION_CATEGORY_CODES, isValuationConcept } from './incomeAllocation'
import { isExtraLoanPrincipalPayment } from './lifestyleExpenses'

export type FlowTx = {
  date: string | null
  amount: number | string | null
  movement_type: string | null
  is_settlement?: boolean | null
  is_passive_income?: boolean | null
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
  ahorro: number
  inversion: number
  deuda: number
  /** income − (gasto+ahorro+inversion+deuda) — can be negative (a real deficit, financed from savings/credit). */
  remainder: number
  gastoSources: SourceAmount[]
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
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount }))
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

  // Include settlement income — same as avgMonthlyIncome elsewhere on this page.
  const income = windowTxs
    .filter(tx => tx.movement_type === 'income' && !tx.is_passive_income)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

  const gastoSourceMap: SourceMap = {}
  const ahorroSourceMap: SourceMap = {}
  const inversionSourceMap: SourceMap = {}
  const deudaSourceMap: SourceMap = {}

  let ahorro = 0, inversion = 0, deuda = 0, gasto = 0

  for (const tx of windowTxs) {
    if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') continue
    if (tx.is_settlement) continue
    if (isValuationConcept(tx.concept)) continue

    const amt = Number(tx.amount ?? 0)
    const dest = depositDestination(tx)

    if (isExtraLoanPrincipalPayment(tx.concept ?? null, tx.category_code ?? null)) {
      deuda += amt
      const name = tx.concept || tx.vendor || 'Abono extra'
      addSource(deudaSourceMap, name, null, amt)
    } else if (tx.expense_group === 'objetivos_financieros' && isSavingsCategoryCode(tx.category_code)) {
      if (INVERSION_CATEGORY_CODES.has(tx.category_code ?? '')) {
        inversion += amt
        const baseName = (tx.category_code && catNameMap.get(tx.category_code)) || tx.category_code || 'Inversión'
        addSource(inversionSourceMap, baseName, dest, amt)
      } else {
        ahorro += amt
        const baseName = (tx.category_code && catNameMap.get(tx.category_code)) || tx.category_code || 'Ahorro'
        addSource(ahorroSourceMap, baseName, dest, amt)
      }
    } else {
      gasto += amt
      const baseName = (tx.category_code && catNameMap.get(tx.category_code)) || tx.category_code || 'Gasto'
      addSource(gastoSourceMap, baseName, dest, amt)
    }
  }

  // Envelope CONTRIBUTIONS count as ahorro too — money moving from spendable
  // liquidity into a savings sobre (see progreso/page.tsx for the full
  // rationale on why only 'deposito' counts, not retiro/traslado).
  const envelopeContribs = windowMovements.filter(m =>
    savingsEnvelopeIds.has(m.envelope_id) &&
    m.movement_type === 'deposito' &&
    !/restauraci[oó]n\s*(de\s*)?saldo|ajuste\s*de\s*saldo/i.test(m.notes ?? '')
  )
  for (const m of envelopeContribs) {
    const amt = Number(m.amount)
    ahorro += amt
    const name = envelopeNameMap.get(m.envelope_id) ?? 'Sobre'
    addSource(ahorroSourceMap, name, null, amt)
  }

  const remainder = income - (gasto + ahorro + inversion + deuda)

  return {
    from, to, income, gasto, ahorro, inversion, deuda, remainder,
    gastoSources: toSourceList(gastoSourceMap),
    ahorroSources: toSourceList(ahorroSourceMap),
    inversionSources: toSourceList(inversionSourceMap),
    deudaSources: toSourceList(deudaSourceMap),
  }
}
