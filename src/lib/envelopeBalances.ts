// Single source of truth for envelope (sobre) balances.
//
// Three pages used to compute the liquid total independently and each one
// drifted a different way: /liquidez summed only a root's direct children
// (silently dropping 3rd-level envelopes), /patrimonio excluded every parent
// (dropping intermediate parents' own money) while never filtering is_active
// (counting archived envelopes). The canonical rule below is /auditoria's,
// which is the one that reconciles against the transaction ledger.
//
// The rule: count principal (non-'interes') movements of ACTIVE envelopes,
// excluding only root-level container envelopes — those with no parent that
// have children, e.g. "Transitorio", whose own movements are structural.
// Intermediate parents DO hold real money and are counted.

export type EnvelopeRow = {
  id: string
  parent_envelope_id: string | null
  is_active?: boolean | null
}

export type MovementRow = {
  envelope_id: string
  amount: string | number
  movement_type: string | null
}

function isActive(e: EnvelopeRow): boolean {
  return e.is_active !== false
}

/** Envelopes that have at least one active child. */
export function parentEnvelopeIds(envelopes: EnvelopeRow[]): Set<string> {
  return new Set(
    envelopes
      .filter(e => isActive(e) && e.parent_envelope_id !== null)
      .map(e => e.parent_envelope_id as string)
  )
}

/**
 * Envelopes whose own movements count toward the liquid total:
 * active, minus root-level containers.
 */
export function countableEnvelopeIds(envelopes: EnvelopeRow[]): Set<string> {
  const parents = parentEnvelopeIds(envelopes)
  return new Set(
    envelopes
      .filter(e => isActive(e) && !(e.parent_envelope_id === null && parents.has(e.id)))
      .map(e => e.id)
  )
}

/** Sum of principal movements for the given countable envelopes. */
export function sumLiquid(movements: MovementRow[], countable: Set<string>): number {
  return movements
    .filter(m => m.movement_type !== 'interes' && countable.has(m.envelope_id))
    .reduce((s, m) => s + Number(m.amount), 0)
}

export type EnvelopeBalances = {
  /** Principal per envelope (excludes 'interes' movements). */
  ownBalance: Record<string, number>
  /** Accrued interest per envelope, tracked separately for reference. */
  ownInterest: Record<string, number>
  parentIds: Set<string>
  /** Root-level containers — own movements excluded from the total. */
  rootParentIds: Set<string>
  countableIds: Set<string>
  /** Canonical liquid total. */
  liquidTotal: number
}

export function computeEnvelopeBalances(
  envelopes: EnvelopeRow[],
  movements: MovementRow[],
): EnvelopeBalances {
  const ownBalance: Record<string, number> = {}
  const ownInterest: Record<string, number> = {}
  for (const m of movements) {
    const target = m.movement_type === 'interes' ? ownInterest : ownBalance
    target[m.envelope_id] = (target[m.envelope_id] ?? 0) + Number(m.amount)
  }

  const parentIds = parentEnvelopeIds(envelopes)
  const rootParentIds = new Set(
    envelopes
      .filter(e => isActive(e) && e.parent_envelope_id === null && parentIds.has(e.id))
      .map(e => e.id)
  )
  const countableIds = countableEnvelopeIds(envelopes)

  return {
    ownBalance,
    ownInterest,
    parentIds,
    rootParentIds,
    countableIds,
    liquidTotal: sumLiquid(movements, countableIds),
  }
}

/**
 * Rolls a subtree's balance up through every level, so a parent's displayed
 * balance includes children AND grandchildren. `countable` decides whether an
 * envelope's own money is included, keeping the displayed hierarchy consistent
 * with `liquidTotal` (root containers contribute only their subtree).
 */
export function rollupBalance(
  envelopeId: string,
  childrenByParent: Record<string, EnvelopeRow[]>,
  own: Record<string, number>,
  countable: Set<string>,
): number {
  const childSum = (childrenByParent[envelopeId] ?? []).reduce(
    (s, c) => s + rollupBalance(c.id, childrenByParent, own, countable),
    0
  )
  return childSum + (countable.has(envelopeId) ? (own[envelopeId] ?? 0) : 0)
}
