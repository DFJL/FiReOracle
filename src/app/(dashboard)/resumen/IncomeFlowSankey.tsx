'use client'

// Ingreso → gasto/ahorro/inversión/deuda for whatever period the page's own
// period tabs have selected (/resumen already has one — Todo/5A/2A/YTD/12M/
// 6M/3M/1M/MTD — the existing "Flujo de ingresos" Sankey card above this one
// already uses it via periodTxs; this card used to carry its own separate
// 6-tab window selector, which just duplicated that control. Two layers:
// 1. Summary cards — the "general" view, amount + % del ingreso per bucket,
//    answers the question at a glance without reading anything else.
// 2. A bar per branch below for "quiero ver el detalle" — click one to drop
//    its top sources into a plain list underneath it. Started as a Sankey
//    ribbon diagram; dropped in favor of plain HTML bars after two rounds of
//    real-data screenshots kept finding new label-collision cases (the
//    income label running off the viewBox edge, then branch labels
//    colliding once Gasto dominated and squeezed the other segments thin) —
//    a bar chart has no equivalent geometry to fight: every row owns its own
//    block-flow space.
//
// Built on computeFlowWindow (@/lib/ahorroInversionFlow) — the same
// classification AhorroInversionSection (/progreso) uses, so the two can
// never disagree about what counts as ahorro vs. inversión vs. gasto.
//
// Two different percentage bases are used on purpose, each labeled:
// cards show "% del ingreso" (can exceed 100% — a real deficit month should
// read as >100%, that's the signal); the diagram and drill-down lists show
// "% de lo asignado" (share of gasto+ahorro+inversión+deuda+remanente,
// always sums to 100% by construction) — that's "de lo que sale, cómo se
// distribuye el 100%".

import { useState } from 'react'
import { ChevronUp } from 'lucide-react'

type SourceAmount = { name: string; amount: number }

export type FlowWindow = {
  from: string
  to: string
  income: number
  gasto: number
  ahorro: number
  inversion: number
  deuda: number
  remainder: number
  gastoSources: SourceAmount[]
  ahorroSources: SourceAmount[]
  inversionSources: SourceAmount[]
  deudaSources: SourceAmount[]
}

type BranchKey = 'gasto' | 'ahorro' | 'inversion' | 'deuda' | 'remanente'

// Dark-only app — validated against this app's actual --bg (#080c08), not a
// generic surface (node scripts/validate_palette.js "#9085e9,#d95926,#199e70"
// --mode dark --surface "#080c08" --pairs all → ALL CHECKS PASS). Gasto and
// Remanente stay neutral on purpose: this is the "money that left/is
// unassigned" side, not a competing identity — the three colored branches
// are the ones worth telling apart at a glance.
const BRANCH_COLOR: Record<BranchKey, string> = {
  gasto:     '#71717a', // zinc-500 — neutral, not a categorical identity
  ahorro:    '#199e70', // aqua
  inversion: '#9085e9', // violet
  deuda:     '#d95926', // orange
  remanente: '#52525b', // zinc-600 — neutral, unassigned/unspent
}

const BRANCH_LABEL: Record<BranchKey, string> = {
  gasto: 'Gasto', ahorro: 'Ahorro', inversion: 'Inversión',
  deuda: 'Abono extra deuda', remanente: 'Remanente',
}

// Static literal classes — Tailwind's JIT scanner can't pick up a
// template-literal class name built from a runtime count.
const GRID_COLS_SM: Record<number, string> = {
  1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4',
}

const MAX_SOURCES_SHOWN = 8

function foldSources(sources: SourceAmount[]): SourceAmount[] {
  if (sources.length <= MAX_SOURCES_SHOWN) return sources
  const top = sources.slice(0, MAX_SOURCES_SHOWN - 1)
  const restTotal = sources.slice(MAX_SOURCES_SHOWN - 1).reduce((s, x) => s + x.amount, 0)
  return [...top, { name: 'Otros', amount: restTotal }]
}

export function IncomeFlowSankey({
  flow, fmt, onCollapse,
}: {
  flow: FlowWindow
  fmt: (v: number) => string
  onCollapse?: () => void
}) {
  const [expandedBranch, setExpandedBranch] = useState<BranchKey | null>(null)
  // Collapse any open drill-down when the page's period selection changes
  // the data underneath it, instead of showing a stale branch's sources.
  // Adjusted during render (React's documented pattern for this), not in an
  // effect — an effect here would flash the stale drill-down for one frame.
  const flowKey = `${flow.from}|${flow.to}`
  const [lastFlowKey, setLastFlowKey] = useState(flowKey)
  if (flowKey !== lastFlowKey) {
    setLastFlowKey(flowKey)
    setExpandedBranch(null)
  }

  const w = flow

  const branches: { key: BranchKey; amount: number; sources: SourceAmount[] }[] = [
    { key: 'gasto', amount: w.gasto, sources: w.gastoSources },
  ]
  if (w.ahorro > 0.5)    branches.push({ key: 'ahorro',    amount: w.ahorro,    sources: w.ahorroSources })
  if (w.inversion > 0.5) branches.push({ key: 'inversion', amount: w.inversion, sources: w.inversionSources })
  if (w.deuda > 0.5)     branches.push({ key: 'deuda',     amount: w.deuda,     sources: w.deudaSources })

  const remainderThreshold = Math.max(w.income * 0.005, 1)
  const hasRemanente = w.remainder > remainderThreshold
  if (hasRemanente) branches.push({ key: 'remanente', amount: w.remainder, sources: [] })
  const deficit = w.remainder < -remainderThreshold ? -w.remainder : 0

  const branchTotal = branches.reduce((s, b) => s + b.amount, 0)

  // % del ingreso — can exceed 100% (deficit); used only in the summary cards.
  function pctIncome(amount: number): string {
    return w.income > 0 ? `${((amount / w.income) * 100).toFixed(0)}%` : '—'
  }
  // % de lo asignado — always sums to 100% across branches; used in the diagram/lists.
  function pctAllocated(amount: number): string {
    return branchTotal > 0 ? `${((amount / branchTotal) * 100).toFixed(0)}%` : '—'
  }

  const expandedData = expandedBranch ? branches.find(b => b.key === expandedBranch) ?? null : null
  const expandedSources = expandedData ? foldSources(expandedData.sources) : []

  const cards: { key: BranchKey; amount: number }[] = [
    { key: 'gasto', amount: w.gasto },
    ...(w.ahorro > 0.5    ? [{ key: 'ahorro' as const,    amount: w.ahorro }]    : []),
    ...(w.inversion > 0.5 ? [{ key: 'inversion' as const, amount: w.inversion }] : []),
    ...(w.deuda > 0.5     ? [{ key: 'deuda' as const,     amount: w.deuda }]     : []),
  ]

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Flujo de ingreso</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">
            Cuánto entró, cuánto se gastó, cuánto se guardó · según el período de arriba
          </p>
        </div>
        {onCollapse && (
          <button onClick={onCollapse} className="text-zinc-600 hover:text-zinc-400 transition-colors p-1" title="Colapsar">
            <ChevronUp size={14} />
          </button>
        )}
      </div>

      {w.income <= 0 ? (
        <p className="text-[11px] text-zinc-600 text-center py-10">Sin ingresos registrados en esta ventana.</p>
      ) : (
        <>
          {/* Summary — the "general" view: amount + % del ingreso, no diagram needed */}
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-[8px] text-zinc-500 uppercase tracking-wider">Ingreso</p>
            <p className="text-base font-black mt-1 text-[#a3e635] tabular-nums">{fmt(w.income)}</p>
          </div>
          <div className={`grid gap-2 grid-cols-2 ${GRID_COLS_SM[cards.length] ?? GRID_COLS_SM[4]}`}>
            {cards.map(c => (
              <div key={c.key} className="bg-black/20 rounded-xl p-3">
                <p className="text-[8px] text-zinc-500 uppercase tracking-wider truncate">{BRANCH_LABEL[c.key]}</p>
                <p className="text-sm font-black mt-1 tabular-nums" style={{ color: BRANCH_COLOR[c.key] }}>{fmt(c.amount)}</p>
                <p className="text-[8px] text-zinc-600 mt-0.5">{pctIncome(c.amount)} del ingreso</p>
              </div>
            ))}
          </div>

          {/* Detail — a bar per branch, abs + % de lo asignado. Plain HTML,
              not SVG: each row owns its own block-flow space, so there's no
              geometry to collide no matter how small a branch gets. */}
          <div>
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider mb-2">
              Detalle · tocá un destino para ver sus fuentes
            </p>
            <div className="space-y-2.5">
              {branches.map(b => {
                const isExpanded = expandedBranch === b.key
                const canExpand = b.key !== 'remanente' && b.sources.length > 0
                const barPct = branchTotal > 0 ? (b.amount / branchTotal) * 100 : 0
                return (
                  <div
                    key={b.key}
                    onClick={() => canExpand && setExpandedBranch(isExpanded ? null : b.key)}
                    style={{ cursor: canExpand ? 'pointer' : 'default' }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-black text-zinc-300">
                        {BRANCH_LABEL[b.key]}{canExpand ? (isExpanded ? ' ⌄' : ' ›') : ''}
                      </span>
                      <span className="text-[10px] tabular-nums shrink-0">
                        <span className="text-zinc-300 font-bold">{fmt(b.amount)}</span>
                        <span className="text-zinc-600"> · {pctAllocated(b.amount)} de lo asignado</span>
                      </span>
                    </div>
                    <div className="h-3.5 rounded-full bg-black/25 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(barPct, barPct > 0 ? 1.5 : 0)}%`, background: BRANCH_COLOR[b.key] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Drill-down — appears under the bars when a branch is tapped. */}
            {expandedData && (
              <div className="mt-2 pt-3 border-t border-white/[0.06] space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: BRANCH_COLOR[expandedData.key] }}>
                  Fuentes de {BRANCH_LABEL[expandedData.key]}
                </p>
                {expandedSources.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 text-[10px] text-zinc-400 truncate">{s.name}</span>
                    <span className="text-[10px] tabular-nums text-zinc-300 shrink-0">{fmt(s.amount)}</span>
                    <span className="text-[9px] tabular-nums text-zinc-600 shrink-0 w-8 text-right">
                      {expandedData.amount > 0 ? `${((s.amount / expandedData.amount) * 100).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {deficit > 0.5 && (
            <p className="text-[10px] text-orange-400/80 bg-orange-500/5 border border-orange-500/15 rounded-lg px-3 py-2">
              Este período se destinó {fmt(deficit)} más de lo que ingresó — financiado con ahorros existentes o crédito, no se ve como flujo de este ingreso.
            </p>
          )}
        </>
      )}
    </div>
  )
}
