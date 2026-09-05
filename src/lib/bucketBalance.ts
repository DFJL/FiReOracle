// Single source of truth for "how much is this investment bucket worth" —
// this formula used to be copy-pasted (and drifting) across inversiones/page.tsx,
// patrimonio/page.tsx, netWorthTotals.ts and computeYieldHistory.ts. One bad
// concept_map edit in one of those copies could silently disagree with the others.
//
// Also introduces `baseline_date` / `baseline_value_crc`: a concept_based or
// vendor_based bucket normally replays its ENTIRE transaction history from day
// one, forever — a single misclassified transaction from years ago corrupts
// today's balance permanently, and there is no way to audit that without
// re-checking the whole ledger. Setting a baseline anchors the bucket to a
// verified real value as of a date (e.g. the user's own manual month-end
// snapshot) and only replays transactions AFTER it — bounded, auditable, and
// immune to old data.

export interface BucketConceptMap {
  depositConcepts: string[]
  rendimientosConcepts: string[]
  valorizacionConcepts: string[]
  liquidacionConcepts: string[]
}

// Alias kept for call sites that imported this shape under its old local name.
export type ConceptMap = BucketConceptMap

export interface BucketDef {
  id: string
  name?: string
  bucket_type: string
  vendors: string[] | null
  concept_map: BucketConceptMap | null
  baseline_date?: string | null
  baseline_value_crc?: number | null
}

export interface BucketTxRow {
  date: string | null
  amount: number | null
  concept: string | null
  vendor: string | null
  category_code?: string | null
  movement_type: string | null
  expense_group: string | null
  is_settlement: boolean | null
  is_passive_income: boolean | null
  investment_bucket_id?: string | null
}

export interface BucketTotals {
  deposits: number
  liquidaciones: number
  rendimientos: number
  passiveValuation: number
  markToMarketLoss: number
  balance: number
}

// Strips stray punctuation (typos like a trailing backtick/quote) and collapses
// whitespace so e.g. "TRANSCOMER`" still matches a bucket's "TRANSCOMER" vendor.
export function normalizeVendor(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, '').trim().replace(/\s+/g, ' ')
}

export function computeBucketTotals(def: BucketDef, txs: BucketTxRow[]): BucketTotals {
  let deposits = 0, liquidaciones = 0, rendimientos = 0, passiveValuation = 0, markToMarketLoss = 0
  const baselineDate = def.baseline_date ?? null

  for (const tx of txs) {
    if (baselineDate && tx.date && tx.date <= baselineDate) continue
    const amt = Number(tx.amount ?? 0)

    if (def.bucket_type === 'concept_based' && def.concept_map) {
      const cm = def.concept_map
      const c = (tx.concept ?? '').toLowerCase()
      const ciIncludes = (arr: string[]) => arr.some(s => s.toLowerCase() === c)
      if (tx.investment_bucket_id === def.id) {
        if (tx.movement_type === 'income' && tx.is_settlement) liquidaciones += amt
        else if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) deposits += amt
        else if (tx.is_passive_income && tx.movement_type === 'income') {
          if (tx.category_code === 'APPRECIATION') passiveValuation += amt
          else rendimientos += amt
        }
        else if (tx.is_passive_income && !tx.movement_type) passiveValuation += amt
      } else if (ciIncludes(cm.depositConcepts))       deposits += amt
      else if (ciIncludes(cm.rendimientosConcepts))    rendimientos += amt
      else if (ciIncludes(cm.valorizacionConcepts))    passiveValuation += amt
      else if (ciIncludes(cm.liquidacionConcepts))     liquidaciones += amt
    } else if (def.bucket_type === 'vendor_based') {
      const txVendor = normalizeVendor(tx.vendor ?? '')
      const vendors = (def.vendors ?? []).map(v => normalizeVendor(v))
      if (!vendors.includes(txVendor)) continue

      if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) deposits += amt
      else if (tx.is_settlement)                                               liquidaciones += amt
      else if (tx.is_passive_income && tx.movement_type === 'income')          rendimientos += amt
      else if (tx.is_passive_income && !tx.movement_type)                      passiveValuation += amt
      else if (tx.movement_type === 'expense' && tx.expense_group === 'na' && !tx.is_passive_income) markToMarketLoss += amt
    }
  }

  const baseline = def.baseline_value_crc ?? 0
  const balance = baseline + deposits + passiveValuation + rendimientos - liquidaciones
  return { deposits, liquidaciones, rendimientos, passiveValuation, markToMarketLoss, balance }
}

// Same classification used above, exposed standalone for building a per-bucket
// transaction *history* list (display only — doesn't touch the balance).
export type BucketTxKind = 'deposit' | 'liquidacion' | 'rendimiento' | 'valorizacion' | 'perdida' | 'otro'

export function classifyBucketTx(def: BucketDef, tx: BucketTxRow): BucketTxKind | null {
  if (def.bucket_type === 'concept_based' && def.concept_map) {
    const cm = def.concept_map
    const c = (tx.concept ?? '').toLowerCase()
    const ci = (arr: string[]) => arr.some(s => s.toLowerCase() === c)
    if (tx.investment_bucket_id === def.id) {
      if (tx.movement_type === 'income' && tx.is_settlement)                      return 'liquidacion'
      if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement)      return 'deposit'
      if (tx.is_passive_income && tx.movement_type === 'income')                  return 'rendimiento'
      if (tx.is_passive_income)                                                   return 'valorizacion'
      if (tx.movement_type === 'income')                                          return 'rendimiento'
      if (tx.movement_type === 'expense')                                         return 'perdida'
      return null
    }
    if (ci(cm.depositConcepts))       return 'deposit'
    if (ci(cm.rendimientosConcepts))  return 'rendimiento'
    if (ci(cm.valorizacionConcepts))  return 'valorizacion'
    if (ci(cm.liquidacionConcepts))   return 'liquidacion'
    return null
  }
  if (def.bucket_type === 'vendor_based') {
    const v = normalizeVendor(tx.vendor ?? '')
    const vs = (def.vendors ?? []).map(s => normalizeVendor(s))
    if (!vs.includes(v)) return null
    if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement)  return 'deposit'
    if (tx.is_settlement)                                                   return 'liquidacion'
    if (tx.is_passive_income && tx.movement_type === 'income')              return 'rendimiento'
    if (tx.is_passive_income)                                               return 'valorizacion'
    if (tx.movement_type === 'expense' && !tx.is_passive_income)            return 'perdida'
    return null
  }
  if (def.bucket_type === 'snapshot_based') {
    // No vendors/concept_map of its own — match by explicit link or by the
    // bucket's own name, purely for display (never drives the balance, which
    // comes from account_balance_snapshots).
    const linked = tx.investment_bucket_id === def.id || normalizeVendor(tx.vendor ?? '') === normalizeVendor(def.name ?? '')
    if (!linked) return null
    if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement)  return 'deposit'
    if (tx.is_settlement)                                                   return 'liquidacion'
    if (tx.is_passive_income && tx.movement_type === 'income')              return 'rendimiento'
    if (tx.is_passive_income)                                               return 'valorizacion'
    if (tx.movement_type === 'expense')                                     return 'otro'
    if (tx.movement_type === 'income')                                      return 'otro'
    return null
  }
  return null
}
