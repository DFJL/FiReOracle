'use client'

// Ingreso → gasto/ahorro/inversión/deuda as a flow (Sankey-style ribbon)
// diagram, window-selectable, with one optional drill-down layer per branch
// (click a branch to see its top sources). Built on computeFlowWindow
// (@/lib/ahorroInversionFlow) — the same classification AhorroInversionSection
// below uses, just parametrized by window instead of fixed to 12 rolling
// months, so the two can never disagree about what counts as ahorro vs.
// inversión vs. gasto.
//
// Hand-rolled SVG (no chart lib in this app) — a ribbon is a thick stroked
// bezier between a source segment and a target segment; both ends use the
// same vertical scale, so a straight sum of segment heights always equals
// the node height on each side (conservation reads directly from the
// geometry, not just the numbers).

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

const MAX_SOURCES_SHOWN = 6

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

  // ── Layout ──────────────────────────────────────────────────────────────
  const W = 640
  const plotH = 260
  const topPad = 16
  const nodeW = 10
  const gap = 6
  const colIncomeX  = 10
  const colBranchX  = 300
  const colSourceX  = 560
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

  const expanded = expandedBranch ? branchLayout.find(b => b.key === expandedBranch) ?? null : null
  const expandedSources = expanded ? foldSources(expanded.sources) : []
  const sourceScale = expanded && expanded.amount > 0 ? expanded.h / expanded.amount : 0
  let cursorSource = expanded ? expanded.branchY : 0
  const sourceLayout = expandedSources.map(s => {
    const h = Math.max(s.amount * sourceScale, 2)
    const y = cursorSource
    cursorSource += h + 3
    return { ...s, h, y }
  })

  function pct(amount: number): string {
    return w.income > 0 ? `${((amount / w.income) * 100).toFixed(0)}%` : '—'
  }

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Flujo de ingreso</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">
            De dónde a dónde — tocá un destino para ver sus fuentes
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
          <svg viewBox={`0 0 ${W} ${plotH + topPad * 2}`} className="w-full" role="img" aria-label="Flujo de ingreso hacia gasto, ahorro, inversión y deuda">
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

            {/* Links: branch → sources (only the expanded one) */}
            {expanded && sourceLayout.map((s, i) => (
              <path
                key={`srclink-${i}`}
                d={ribbonPath(colBranchX + nodeW, expanded.branchY + expanded.h / 2, colSourceX, s.y + s.h / 2)}
                stroke={BRANCH_COLOR[expanded.key]}
                strokeWidth={s.h}
                fill="none"
                opacity={0.28}
              />
            ))}

            {/* Income node */}
            <rect x={colIncomeX} y={incomeY} width={nodeW} height={incomeH} rx={2} fill="#a3e635" />
            <text x={colIncomeX - 6} y={incomeY + incomeH / 2 - 6} textAnchor="end" className="fill-zinc-300" style={{ fontSize: 10, fontWeight: 900 }}>
              Ingreso
            </text>
            <text x={colIncomeX - 6} y={incomeY + incomeH / 2 + 8} textAnchor="end" className="fill-zinc-500" style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(w.income)}
            </text>

            {/* Branch nodes */}
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
                    {fmt(b.amount)} · {pct(b.amount)}
                  </text>
                </g>
              )
            })}

            {/* Source nodes (expanded branch's breakdown) */}
            {expanded && sourceLayout.map((s, i) => (
              <g key={`src-${i}`}>
                <rect x={colSourceX} y={s.y} width={nodeW} height={s.h} rx={2} fill={BRANCH_COLOR[expanded.key]} opacity={0.7} />
                <text x={colSourceX + nodeW + 8} y={s.y + s.h / 2 - 2} className="fill-zinc-400" style={{ fontSize: 9, fontWeight: 700 }}>
                  {s.name.length > 26 ? s.name.slice(0, 25) + '…' : s.name}
                </text>
                <text x={colSourceX + nodeW + 8} y={s.y + s.h / 2 + 10} className="fill-zinc-600" style={{ fontSize: 8, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(s.amount)}
                </text>
              </g>
            ))}
          </svg>

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
