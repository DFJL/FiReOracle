'use client'

// Ingreso → gasto/ahorro/inversión/deuda, window-selectable. Two layers:
// 1. Summary cards — the "general" view, amount + % del ingreso per bucket,
//    answers the question at a glance without reading a diagram.
// 2. A flow (Sankey-style ribbon) diagram below for "quiero ver el detalle" —
//    click a branch to drop its top sources into a plain list underneath it
//    (not a 3rd SVG column: with several small sobres that column's labels
//    collided no matter how tight the packing got, so the drill-down is a
//    normal list instead, same pattern as the sources lists elsewhere on
//    this page).
//
// Built on computeFlowWindow (@/lib/ahorroInversionFlow) — the same
// classification AhorroInversionSection below uses, just parametrized by
// window instead of fixed to 12 rolling months, so the two can never
// disagree about what counts as ahorro vs. inversión vs. gasto.
//
// Two different percentage bases are used on purpose, each labeled:
// cards show "% del ingreso" (can exceed 100% — a real deficit month should
// read as >100%, that's the signal); the diagram and drill-down lists show
// "% de lo asignado" (share of gasto+ahorro+inversión+deuda+remanente,
// always sums to 100% by construction) — that's "de lo que sale, cómo se
// distribuye el 100%".

import { useState } from 'react'

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

export type IncomeFlowWindows = Record<'mes' | 'm3' | 'm6' | 'm12' | 'ytd' | 'todo', FlowWindow>

const WINDOW_TABS: { key: keyof IncomeFlowWindows; label: string }[] = [
  { key: 'mes',  label: 'Este mes' },
  { key: 'm3',   label: '3M' },
  { key: 'm6',   label: '6M' },
  { key: 'm12',  label: '12M' },
  { key: 'ytd',  label: 'Año' },
  { key: 'todo', label: 'Todo' },
]

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

// A horizontal ribbon: thick stroked bezier, uniform width (no taper) —
// simplest link shape that still reads as "flow" at this scale.
function ribbonPath(x0: number, y0: number, x1: number, y1: number): string {
  const midX = (x0 + x1) / 2
  return `M ${x0},${y0} C ${midX},${y0} ${midX},${y1} ${x1},${y1}`
}

export function IncomeFlowSankey({
  windows, fmt,
}: {
  windows: IncomeFlowWindows
  fmt: (v: number) => string
}) {
  const [windowKey, setWindowKey] = useState<keyof IncomeFlowWindows>('m12')
  const [expandedBranch, setExpandedBranch] = useState<BranchKey | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)

  const w = windows[windowKey]

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
  const total = Math.max(w.income, branchTotal, 1)

  // % del ingreso — can exceed 100% (deficit); used only in the summary cards.
  function pctIncome(amount: number): string {
    return w.income > 0 ? `${((amount / w.income) * 100).toFixed(0)}%` : '—'
  }
  // % de lo asignado — always sums to 100% across branches; used in the diagram/lists.
  function pctAllocated(amount: number): string {
    return branchTotal > 0 ? `${((amount / branchTotal) * 100).toFixed(0)}%` : '—'
  }

  // ── Diagram layout ─────────────────────────────────────────────────────
  const W = 640
  const plotH = 240
  const topPad = 36 // room for the Ingreso label above its bar
  const nodeW = 10
  const gap = 8
  const colIncomeX  = 60
  const colBranchX  = 340
  const scale = (plotH - gap * (branches.length - 1)) / total

  const incomeH = Math.max(w.income * scale, 2)
  const incomeY = topPad + (plotH - incomeH) / 2

  let cursorIncome = incomeY
  let cursorBranch = topPad
  const branchLayout = branches.map(b => {
    const h = Math.max(b.amount * scale, 2)
    const incomeSegY = cursorIncome
    const branchY = cursorBranch
    cursorIncome += h
    cursorBranch += h + gap
    return { ...b, h, incomeSegY, branchY }
  })

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
            Cuánto entró, cuánto se gastó, cuánto se guardó
          </p>
        </div>
        <div className="flex gap-1 bg-black/20 rounded-lg p-0.5">
          {WINDOW_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setWindowKey(t.key); setExpandedBranch(null) }}
              className={`px-2 py-1 rounded-md text-[9px] font-black transition-colors ${
                windowKey === t.key ? 'bg-[#a3e635] text-black' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
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

          {/* Detail — the diagram, for "quiero ver el detalle" */}
          <div>
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider mb-1">
              Detalle · tocá un destino para ver sus fuentes
            </p>
            <svg viewBox={`0 0 ${W} ${plotH + topPad}`} className="w-full" role="img" aria-label="Flujo de ingreso hacia gasto, ahorro, inversión y deuda">
              {/* Links: income → branch */}
              {branchLayout.map(b => (
                <path
                  key={`link-${b.key}`}
                  d={ribbonPath(colIncomeX + nodeW, b.incomeSegY + b.h / 2, colBranchX, b.branchY + b.h / 2)}
                  stroke={BRANCH_COLOR[b.key]}
                  strokeWidth={b.h}
                  fill="none"
                  opacity={hoverKey === null || hoverKey === b.key ? 0.32 : 0.1}
                  style={{ transition: 'opacity 120ms' }}
                />
              ))}

              {/* Income node — label centered above the bar, never clipped */}
              <rect x={colIncomeX} y={incomeY} width={nodeW} height={incomeH} rx={2} fill="#a3e635" />
              <text x={colIncomeX + nodeW / 2} y={incomeY - 20} textAnchor="middle" className="fill-zinc-300" style={{ fontSize: 10, fontWeight: 900 }}>
                Ingreso
              </text>
              <text x={colIncomeX + nodeW / 2} y={incomeY - 8} textAnchor="middle" className="fill-zinc-500" style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(w.income)}
              </text>

              {/* Branch nodes — % here is share of lo asignado (sums to 100%) */}
              {branchLayout.map(b => {
                const isExpanded = expandedBranch === b.key
                const canExpand = b.key !== 'remanente' && b.sources.length > 0
                return (
                  <g
                    key={b.key}
                    onMouseEnter={() => setHoverKey(b.key)}
                    onMouseLeave={() => setHoverKey(null)}
                    onClick={() => canExpand && setExpandedBranch(isExpanded ? null : b.key)}
                    style={{ cursor: canExpand ? 'pointer' : 'default' }}
                  >
                    <rect
                      x={colBranchX} y={b.branchY} width={nodeW} height={b.h} rx={2}
                      fill={BRANCH_COLOR[b.key]}
                      stroke={isExpanded ? '#fff' : 'none'}
                      strokeWidth={isExpanded ? 1 : 0}
                    />
                    <text x={colBranchX + nodeW + 8} y={b.branchY + b.h / 2 - 6} className="fill-zinc-300" style={{ fontSize: 10, fontWeight: 900 }}>
                      {BRANCH_LABEL[b.key]}{canExpand ? ' ›' : ''}
                    </text>
                    <text x={colBranchX + nodeW + 8} y={b.branchY + b.h / 2 + 8} className="fill-zinc-500" style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(b.amount)} · {pctAllocated(b.amount)} de lo asignado
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* Drill-down — plain list, not another SVG column (collided with
                several small sobres no matter how tightly packed). */}
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
