// Single source of truth for "what's a milestone worth marking on a trend
// chart" — shared by /progreso, /patrimonio and /inversiones so the same
// event shows up consistently everywhere instead of three independent
// (and inevitably drifting) copies of the same detection logic.

import { isLoanPayment } from '@/app/(dashboard)/resumen/categoryUtils'
import {
  isExtraLoanPrincipalPayment, buildRootCodeMap, computeGlobalP95, outlierFence,
  type CategoryRow, type LifestyleTx,
} from '@/lib/lifestyleExpenses'

export type Milestone = { date: string; label: string; kind: 'auto' | 'fire' | 'manual'; amount?: number; id?: string }

// A transaction unusually large FOR ITS OWN category (same IQR-fence formula
// as the Lifestyle Inflation outlier cleaning, reused so "outlier" means the
// same thing everywhere) — not just "biggest transaction that month". A
// flat/global threshold would flag routine biweekly salary every single
// month, since it's consistently the largest line item; the per-category
// fence only fires when something is abnormal for THAT category (a car
// purchase, a big investment liquidation), leaving routine salary/rent
// alone. Capped to the top N by amount — even the per-category fence let
// through too many to read on a chart spanning several years, since they
// all bunch up in the most recent window at that x-axis scale.
export function computeAutoMilestones(
  txs: LifestyleTx[],
  categories: CategoryRow[],
  opts?: { windowMonths?: number; minAmount?: number; cap?: number; now?: Date },
): Milestone[] {
  const now = opts?.now ?? new Date()
  const windowMonths = opts?.windowMonths ?? 24
  const minAmount = opts?.minAmount ?? 1_500_000
  const cap = opts?.cap ?? 6
  const getRootCode = buildRootCodeMap(categories)
  const windowStartStr = new Date(now.getFullYear(), now.getMonth() - windowMonths, 1).toISOString().slice(0, 10)

  const candidates = txs.filter(tx =>
    tx.date && tx.date >= windowStartStr && tx.amount != null &&
    (tx.movement_type === 'expense' || tx.movement_type === 'income' || tx.movement_type === 'cash_withdrawal') &&
    tx.expense_group !== 'objetivos_financieros' &&
    !(isLoanPayment(tx.vendor ?? null, tx.concept, tx.category_code) && !isExtraLoanPrincipalPayment(tx.concept, tx.category_code))
  )
  const globalP95 = computeGlobalP95(candidates)
  const rootAmounts: Record<string, number[]> = {}
  for (const tx of candidates) {
    const root = getRootCode(tx.category_code ?? '__na__')
    ;(rootAmounts[root] ??= []).push(Number(tx.amount ?? 0))
  }
  const rootFences = Object.fromEntries(
    Object.entries(rootAmounts).map(([root, amounts]) => [root, outlierFence(amounts, globalP95)])
  )

  const monthlyBiggest = new Map<string, { amount: number; date: string; vendor: string | null; concept: string | null }>()
  for (const tx of candidates) {
    const amt = Math.abs(Number(tx.amount ?? 0))
    if (amt < minAmount) continue
    const root = getRootCode(tx.category_code ?? '__na__')
    if (amt <= (rootFences[root] ?? Infinity)) continue
    const ym = tx.date!.slice(0, 7)
    const existing = monthlyBiggest.get(ym)
    if (!existing || amt > existing.amount) {
      monthlyBiggest.set(ym, { amount: amt, date: tx.date!, vendor: tx.vendor ?? null, concept: tx.concept })
    }
  }

  return [...monthlyBiggest.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, cap)
    .map(({ amount, date, vendor, concept }) => ({
      date,
      label: `${concept || vendor || 'Movimiento grande'} · ₡${Math.round(amount).toLocaleString('es-CR')}`,
      kind: 'auto' as const,
      amount,
    }))
}

// First date liquid_crc + invested_crc (NOT net_worth_crc — that includes
// illiquid real estate, which isn't part of what a FIRE number is measured
// against) crossed each threshold.
export function computeFireMilestones(
  snapshots: { snapshot_date: string; liquid_crc: number | null; invested_crc: number | null }[],
  fireNumber: number,
  leanFireNumber: number,
): Milestone[] {
  const thresholds = [
    leanFireNumber > 0 ? { val: leanFireNumber, label: 'Lean FI alcanzado' } : null,
    fireNumber > 0 ? { val: fireNumber * 0.5, label: '50% del FIRE number' } : null,
    fireNumber > 0 ? { val: fireNumber, label: 'FIRE number alcanzado 🎯' } : null,
  ].filter((t): t is { val: number; label: string } => t !== null)
  const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
  const milestones: Milestone[] = []
  for (const th of thresholds) {
    const hit = sorted.find(s => Number(s.liquid_crc ?? 0) + Number(s.invested_crc ?? 0) >= th.val)
    if (hit) milestones.push({ date: hit.snapshot_date, label: th.label, kind: 'fire' })
  }
  return milestones
}

export function manualMilestones(lifeEventRows: { id: string; date: string; label: string }[]): Milestone[] {
  return lifeEventRows.map(ev => ({ date: ev.date, label: ev.label, kind: 'manual' as const, id: ev.id }))
}

export function mergeMilestones(...lists: Milestone[][]): Milestone[] {
  return lists.flat().sort((a, b) => a.date.localeCompare(b.date))
}
