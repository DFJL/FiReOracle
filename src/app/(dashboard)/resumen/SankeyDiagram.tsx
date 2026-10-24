'use client'

import { useState, useRef, useCallback } from 'react'
import { ChevronUp } from 'lucide-react'
import { isLoanPayment } from './categoryUtils'
import { isValuationConcept } from '@/lib/incomeAllocation'
import { type FlowWindow, classifyFlowTx, type FlowBucket } from '@/lib/ahorroInversionFlow'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TxClient {
  date: string | null
  vendor: string | null
  concept: string | null
  category_code: string | null
  movement_type: string | null
  amount: number | null
  expense_group: string | null
  is_settlement: boolean
  is_passive_income?: boolean
  is_survival_expense?: boolean
}

// ── Category code → display name mapping (per spec) ───────────────────────────

const CATEGORY_DISPLAY: Record<string, string> = {
  FOOD_SUPER:         'Supermercado',
  FOOD_OUT:           'Comida fuera',
  TRANSPORT_FUEL:     'Gasolina',
  TRANSPORT:          'Transporte',
  RENT_SERVICE:       'Servicios hogar',
  SERVICES_INTERNET:  'Internet/Cable',
  HEALTH_MEDS:        'Farmacia',
  HEALTH_CONSULT:     'Médico',
  EDUCATION:          'Educación',
  ENTERTAINMENT:      'Entretenimiento',
  ENTERTAINMENT_SUBS: 'Streaming',
  CLOTHING:           'Ropa',
  PERSONAL_CARE:      'Cuidado personal',
  LOAN_PAYMENT:       'Préstamos',
  INSURANCE:          'Seguros',
  CAR_EXPENSES:       'Carro',
  MISC_EXPENSE:       'Varios',
  CASH_WITHDRAWAL:    'Efectivo',
  TAXES:              'Impuestos',
}

function getExpenseLabel(tx: TxClient): string {
  // Loan payments always go to "Préstamos" (the regular-installment ones —
  // isExtraLoanPrincipalPayment-tagged extra paydowns are already pulled
  // into the Abono extra deuda bucket upstream, by classifyFlowTx).
  if (isLoanPayment(tx.vendor, tx.concept, tx.category_code)) return 'Préstamos'

  // Known category codes
  if (tx.category_code && CATEGORY_DISPLAY[tx.category_code]) {
    return CATEGORY_DISPLAY[tx.category_code]
  }

  // Fallback: first word of vendor || concept || 'Otro'
  const raw = tx.vendor ?? tx.concept ?? ''
  const trimmed = raw.trim()
  if (!trimmed) return 'Otro'
  return trimmed.split(/\s+/)[0] ?? 'Otro'
}

// Groups a set of (label, amount) entries into top-N + "Otros" below a %
// threshold — same rule applied to Gasto categories and to each bucket's
// sources, so every drill-down folds the same way.
function foldTopN(
  entries: [string, number][], total: number, topN = 6, thresholdPct = 0.03,
): [string, number][] {
  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, topN)
  const rest = sorted.slice(topN)
  const threshold = total * thresholdPct
  const main: [string, number][] = []
  let othersAccum = rest.reduce((s, [, v]) => s + v, 0)
  for (const [label, amt] of top) {
    if (amt < threshold) othersAccum += amt
    else main.push([label, amt])
  }
  main.sort((a, b) => b[1] - a[1])
  if (othersAccum > threshold || (othersAccum > 0 && main.length === 0)) {
    main.push(['Otros', othersAccum])
  }
  return main
}

// ── Income-side classifiers (left column only — which income source, not
// touched by the gasto/ahorro/inversión/deuda split below) ────────────────

function isValuationEntry(tx: TxClient): boolean {
  if (tx.movement_type) return false
  return isValuationConcept(tx.concept)
}

function isPatrimonialIncome(tx: TxClient): boolean {
  return !tx.movement_type && tx.amount != null && Number(tx.amount) > 0 && !isValuationEntry(tx)
}

function isActivIncome(tx: TxClient): boolean {
  return tx.movement_type === 'income' && !tx.is_settlement && !tx.is_passive_income
}

function isPassiveIncome(tx: TxClient): boolean {
  return tx.movement_type === 'income' && !!tx.is_passive_income && !tx.is_settlement
}

// ── Node and flow data structures ─────────────────────────────────────────────

interface SankeyNode {
  key: string
  label: string
  amount: number
  color: string
  x1: number
  x2: number
  y1: number
  y2: number
}

interface SankeyFlow {
  fromKey: string
  toKey: string
  fromYStart: number
  fromYEnd: number
  toYStart: number
  toYEnd: number
  color: string
  amount: number
}

// ── Colors ────────────────────────────────────────────────────────────────────
// Ahorro/Inversión/Abono extra deuda reuse the exact hues the Ahorro e
// inversión card (IncomeFlowSankey, now retired in favor of this merged
// view) validated for this app's dark surface — one color language for the
// same four buckets everywhere, not two diagrams disagreeing on what
// "Ahorro" looks like. Gasto and Margen are neutral (not a competing
// identity), and deliberately different shades of neutral from each other
// and from Margen's old violet, which sat too close to Inversión's violet
// to tell apart — this also incidentally fixes that.

const COLOR_ACTIVE_INCOME  = '#a3e635'
const COLOR_PASSIVE_INCOME = '#34d399'
const COLOR_PATRIMONIAL    = '#a78bfa'
const COLOR_GASTO          = '#71717a'
const COLOR_AHORRO         = '#199e70'
const COLOR_INVERSION      = '#9085e9'
const COLOR_DEUDA          = '#d95926'
const COLOR_MARGIN         = '#78716c'
const EXPENSE_COLORS       = ['#f87171', '#fb923c', '#fbbf24', '#e879f9', '#94a3b8', '#64748b']

const BUCKET_LABEL: Record<FlowBucket, string> = {
  gasto: 'Gasto', ahorro: 'Ahorro', inversion: 'Inversión', deuda: 'Abono extra deuda',
}
const BUCKET_COLOR: Record<FlowBucket, string> = {
  gasto: COLOR_GASTO, ahorro: COLOR_AHORRO, inversion: COLOR_INVERSION, deuda: COLOR_DEUDA,
}

// ── Layout constants ──────────────────────────────────────────────────────────

const H           = 400
const NODE_W      = 140
const NODE_GAP    = 4
const PAD_TOP     = 8
const PAD_BOTTOM  = 8
const USABLE_H    = H - PAD_TOP - PAD_BOTTOM
const LEFT_X1     = 0
const LEFT_X2     = NODE_W

// Collapsed: 2 columns, mid sits where "right" used to. Expanded: 3 columns,
// mid moves to the middle and a 3rd (detail) column takes the old right slot.
const W_COLLAPSED   = 900
const W_EXPANDED     = 1220
const MID_X1_COLLAPSED = W_COLLAPSED - NODE_W
const MID_X2_COLLAPSED = W_COLLAPSED
const MID_X1_EXPANDED  = 540
const MID_X2_EXPANDED  = 540 + NODE_W
const DETAIL_X1         = W_EXPANDED - NODE_W
const DETAIL_X2         = W_EXPANDED

// ── Layout computation ────────────────────────────────────────────────────────

function layoutNodes(
  nodes: Omit<SankeyNode, 'x1' | 'x2' | 'y1' | 'y2'>[],
  x1: number, x2: number,
  totalAmount: number,
): SankeyNode[] {
  const total = totalAmount || 1
  const gapSpace = NODE_GAP * Math.max(0, nodes.length - 1)
  const heightSpace = USABLE_H - gapSpace

  let currentY = PAD_TOP
  return nodes.map((node) => {
    const nodeH = Math.max(2, (node.amount / total) * heightSpace)
    const y1 = currentY
    const y2 = y1 + nodeH
    currentY = y2 + NODE_GAP
    return { ...node, x1, x2, y1, y2 }
  })
}

// Each "from" node contributes proportionally to every "to" node (used both
// for income-sources → buckets, where that's a real assumption since we
// don't track per-source attribution, and for one bucket → its own sources,
// where there's a single "from" node so this reduces to a plain 1-to-many).
function buildFlows(fromNodes: SankeyNode[], toNodes: SankeyNode[]): SankeyFlow[] {
  const flows: SankeyFlow[] = []
  const totalFrom = fromNodes.reduce((s, n) => s + n.amount, 0) || 1

  const toFilled: Record<string, number> = {}
  toNodes.forEach((n) => { toFilled[n.key] = n.y1 })
  const fromFilled: Record<string, number> = {}
  fromNodes.forEach((n) => { fromFilled[n.key] = n.y1 })

  for (const to of toNodes) {
    const toH = to.y2 - to.y1
    for (const from of fromNodes) {
      const fromShare = from.amount / totalFrom
      const flowH = Math.max(0, fromShare * toH)
      if (flowH < 0.5) continue

      const fromNodeH = from.y2 - from.y1
      const toShare = to.amount / totalFrom
      const fromH = Math.max(0, toShare * fromNodeH)

      const fromYStart = fromFilled[from.key]
      const fromYEnd   = fromYStart + fromH
      fromFilled[from.key] = fromYEnd

      const toYStart = toFilled[to.key]
      const toYEnd   = toYStart + flowH
      toFilled[to.key] = toYEnd

      flows.push({
        fromKey: from.key, toKey: to.key,
        fromYStart, fromYEnd, toYStart, toYEnd,
        color: from.color,
        amount: (from.amount / totalFrom) * to.amount,
      })
    }
  }
  return flows
}

function flowPath(flow: SankeyFlow, fromX: number, toX: number): string {
  const { fromYStart, fromYEnd, toYStart, toYEnd } = flow
  const cpX = (fromX + toX) / 2
  const topD = `M${fromX},${fromYStart.toFixed(2)} C${cpX},${fromYStart.toFixed(2)} ${cpX},${toYStart.toFixed(2)} ${toX},${toYStart.toFixed(2)}`
  const botD = `L${toX},${toYEnd.toFixed(2)} C${cpX},${toYEnd.toFixed(2)} ${cpX},${fromYEnd.toFixed(2)} ${fromX},${fromYEnd.toFixed(2)}`
  return `${topD} ${botD} Z`
}

// ── Node + label rendering (shared by every column) ────────────────────────

function NodeGroup({
  node, fmtAmt, clickable, expanded, onClick,
}: {
  node: SankeyNode
  fmtAmt: (n: number) => string
  clickable?: boolean
  expanded?: boolean
  onClick?: () => void
}) {
  const tall = (node.y2 - node.y1) >= 22
  return (
    <g onClick={onClick} style={{ cursor: clickable ? 'pointer' : 'default' }}>
      <rect
        x={node.x1} y={node.y1} width={node.x2 - node.x1} height={node.y2 - node.y1}
        fill={node.color} fillOpacity={0.85} rx={3}
        stroke={expanded ? '#fff' : 'none'} strokeWidth={expanded ? 1.5 : 0}
      />
      {tall ? (
        <>
          <text x={node.x1 + (node.x2 - node.x1) / 2} y={node.y1 + (node.y2 - node.y1) / 2 - 6}
            textAnchor="middle" fontSize="10" fontWeight="700" fill="#0d120d" style={{ pointerEvents: 'none' }}>
            {node.label}{clickable ? ' ›' : ''}
          </text>
          <text x={node.x1 + (node.x2 - node.x1) / 2} y={node.y1 + (node.y2 - node.y1) / 2 + 8}
            textAnchor="middle" fontSize="9" fontWeight="600" fill="#0d120d" fillOpacity={0.7} style={{ pointerEvents: 'none' }}>
            {fmtAmt(node.amount)}
          </text>
        </>
      ) : (
        <text
          x={node.x1 < 400 ? node.x1 - 4 : node.x2 + 4}
          y={node.y1 + (node.y2 - node.y1) / 2 + 4}
          textAnchor={node.x1 < 400 ? 'end' : 'start'}
          fontSize="9" fontWeight="600" fill={node.color} style={{ pointerEvents: 'none' }}
        >
          {node.label}{clickable ? ' ›' : ''}
        </text>
      )}
    </g>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SankeyDiagram({
  transactions,
  flow,
  fmtAmt,
  onCollapse,
}: {
  transactions: TxClient[]
  flow: FlowWindow
  fmtAmt: (n: number) => string
  onCollapse?: () => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverFlow, setHoverFlow] = useState<{ fromKey: string; toKey: string } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [expandedBucket, setExpandedBucket] = useState<FlowBucket | null>(null)

  // ── Left side: income sources (unrelated to the gasto/ahorro/inversión
  // split — a different question, "where income came from" vs. "where it
  // went") ──────────────────────────────────────────────────────────────
  let activeIncome = 0, passiveIncome = 0, patrimonial = 0
  // Gasto category breakdown — gated by classifyFlowTx so this always sums
  // to exactly flow.gasto, the same number the Gasto node shows.
  const expenseMap: Record<string, number> = {}

  for (const tx of transactions) {
    const amt = Number(tx.amount ?? 0)
    if (amt <= 0 && tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') continue
    if (isActivIncome(tx))    { activeIncome  += amt; continue }
    if (isPassiveIncome(tx))  { passiveIncome += amt; continue }
    if (isPatrimonialIncome(tx) && amt > 0) { patrimonial += amt; continue }
    if (classifyFlowTx(tx) === 'gasto') {
      const label = getExpenseLabel(tx)
      expenseMap[label] = (expenseMap[label] ?? 0) + amt
    }
  }

  const totalIncome = activeIncome + passiveIncome + patrimonial
  if (totalIncome === 0) return null

  // Canonical gasto/ahorro/inversión/deuda — same figures the summary cards
  // above and /progreso's AhorroInversionSection report, not re-derived here.
  const margin = totalIncome - flow.gasto - flow.ahorro - flow.inversion - flow.deuda

  // ── Left nodes ────────────────────────────────────────────────────────────
  const leftRaw: Omit<SankeyNode, 'x1' | 'x2' | 'y1' | 'y2'>[] = []
  if (activeIncome  > 0) leftRaw.push({ key: 'active',      label: 'Ingreso activo',   amount: activeIncome,  color: COLOR_ACTIVE_INCOME })
  if (passiveIncome > 0) leftRaw.push({ key: 'passive',     label: 'Ingreso pasivo',   amount: passiveIncome, color: COLOR_PASSIVE_INCOME })
  if (patrimonial   > 0) leftRaw.push({ key: 'patrimonial', label: 'Val. patrimonial', amount: patrimonial,   color: COLOR_PATRIMONIAL })

  // ── Mid nodes: Gasto / Ahorro / Inversión / Abono extra deuda / Margen ──
  const midRaw: Omit<SankeyNode, 'x1' | 'x2' | 'y1' | 'y2'>[] = []
  if (flow.gasto > 0)     midRaw.push({ key: 'gasto',     label: BUCKET_LABEL.gasto,     amount: flow.gasto,     color: BUCKET_COLOR.gasto })
  if (flow.ahorro > 0)    midRaw.push({ key: 'ahorro',    label: BUCKET_LABEL.ahorro,    amount: flow.ahorro,    color: BUCKET_COLOR.ahorro })
  if (flow.inversion > 0) midRaw.push({ key: 'inversion', label: BUCKET_LABEL.inversion, amount: flow.inversion, color: BUCKET_COLOR.inversion })
  if (flow.deuda > 0)     midRaw.push({ key: 'deuda',     label: BUCKET_LABEL.deuda,     amount: flow.deuda,     color: BUCKET_COLOR.deuda })
  if (margin > 0)         midRaw.push({ key: 'margin',    label: 'Margen neto',          amount: margin,         color: COLOR_MARGIN })

  if (leftRaw.length === 0 || midRaw.length === 0) return null

  // ── Detail (3rd column) for whichever bucket is expanded — same source
  // list every other consumer of `flow` uses (flow.ahorroSources etc.),
  // except Gasto, which has no per-tx source list on FlowWindow and is
  // grouped by expense category here instead (reusing getExpenseLabel's
  // nicer display names), gated by classifyFlowTx so it always sums to
  // exactly flow.gasto. ────────────────────────────────────────────────
  function detailEntriesFor(b: FlowBucket): [string, number][] {
    if (b === 'gasto') return Object.entries(expenseMap)
    if (b === 'ahorro') return flow.ahorroSources.map(s => [s.name, s.amount] as [string, number])
    if (b === 'inversion') return flow.inversionSources.map(s => [s.name, s.amount] as [string, number])
    return flow.deudaSources.map(s => [s.name, s.amount] as [string, number])
  }
  const canExpand = (b: FlowBucket) => detailEntriesFor(b).length > 0

  // ── Layout ────────────────────────────────────────────────────────────────
  const isExpanded = expandedBucket !== null
  const W = isExpanded ? W_EXPANDED : W_COLLAPSED
  const midX1 = isExpanded ? MID_X1_EXPANDED : MID_X1_COLLAPSED
  const midX2 = isExpanded ? MID_X2_EXPANDED : MID_X2_COLLAPSED

  const leftNodes = layoutNodes(leftRaw, LEFT_X1, LEFT_X2, totalIncome)
  const midNodes  = layoutNodes(midRaw, midX1, midX2, totalIncome)
  const flows     = buildFlows(leftNodes, midNodes)

  let detailNodes: SankeyNode[] = []
  let detailFlows: SankeyFlow[] = []
  if (isExpanded && expandedBucket) {
    const midNode = midNodes.find(n => n.key === expandedBucket)
    const expandedAmount = flow[expandedBucket]
    if (midNode && expandedAmount > 0) {
      const folded = foldTopN(detailEntriesFor(expandedBucket), expandedAmount)
      const detailRaw = folded.map(([label, amt], i) => ({
        key: `d_${label}`,
        label,
        amount: amt,
        color: expandedBucket === 'gasto' ? EXPENSE_COLORS[i % EXPENSE_COLORS.length] : BUCKET_COLOR[expandedBucket],
      }))
      detailNodes = layoutNodes(detailRaw, DETAIL_X1, DETAIL_X2, expandedAmount)
      detailFlows = buildFlows([midNode], detailNodes)
    }
  }

  const allFlows = [...flows, ...detailFlows]

  // ── Tooltip data ──────────────────────────────────────────────────────────
  const allNodes = [...leftNodes, ...midNodes, ...detailNodes]
  const hoveredFlow = hoverFlow
    ? allFlows.find((f) => f.fromKey === hoverFlow.fromKey && f.toKey === hoverFlow.toKey)
    : null
  const hoveredFromNode = hoveredFlow ? allNodes.find((n) => n.key === hoveredFlow.fromKey) : null
  const hoveredToNode   = hoveredFlow ? allNodes.find((n) => n.key === hoveredFlow.toKey)   : null

  // ── Mouse tracking ────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5">
      <div className="flex items-start justify-between mb-1">
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Flujo de ingresos</p>
        {onCollapse && (
          <button onClick={onCollapse} className="text-zinc-600 hover:text-zinc-400 transition-colors -mt-0.5 -mr-1 p-1" title="Colapsar">
            <ChevronUp size={14} />
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        De dónde viene, y cuánto es gasto, ahorro, inversión o abono extra a deuda — tocá un destino para ver el detalle
      </p>

      <div className="relative overflow-x-auto">
        {hoveredFlow && hoveredFromNode && hoveredToNode && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translate(12px, -50%)' }}
          >
            <div className="bg-[#111811] border border-[#a3e635]/20 rounded-xl px-3 py-2.5 shadow-xl whitespace-nowrap text-[11px]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: hoveredFromNode.color }} />
                <span className="text-zinc-300 font-semibold">{hoveredFromNode.label}</span>
                <span className="text-zinc-600 mx-1">→</span>
                <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: hoveredToNode.color }} />
                <span className="text-zinc-300 font-semibold">{hoveredToNode.label}</span>
              </div>
              <p className="text-center font-black tabular-nums text-white">{fmtAmt(hoveredFlow.amount)}</p>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          style={{ maxWidth: isExpanded ? 'none' : '100%', minWidth: isExpanded ? W : undefined, overflow: 'visible' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverFlow(null)}
          className="cursor-crosshair"
        >
          {allFlows.map((f, i) => {
            const isHovered = hoverFlow?.fromKey === f.fromKey && hoverFlow?.toKey === f.toKey
            const isAnyHovered = hoverFlow !== null
            const opacity = isHovered ? 0.6 : isAnyHovered ? 0.1 : 0.25
            const fromX = allNodes.find(n => n.key === f.fromKey)?.x2 ?? 0
            const toX   = allNodes.find(n => n.key === f.toKey)?.x1 ?? 0
            return (
              <path
                key={`${f.fromKey}-${f.toKey}-${i}`}
                d={flowPath(f, fromX, toX)}
                fill={f.color} fillOpacity={opacity} stroke="none"
                style={{ transition: 'fill-opacity 0.15s ease', cursor: 'pointer' }}
                onMouseEnter={() => setHoverFlow({ fromKey: f.fromKey, toKey: f.toKey })}
              />
            )
          })}

          {leftNodes.map((node) => <NodeGroup key={node.key} node={node} fmtAmt={fmtAmt} />)}

          {midNodes.map((node) => {
            if (node.key === 'margin') return <NodeGroup key={node.key} node={node} fmtAmt={fmtAmt} />
            const bucket = node.key as FlowBucket
            const clickable = canExpand(bucket)
            return (
              <NodeGroup
                key={node.key} node={node} fmtAmt={fmtAmt}
                clickable={clickable}
                expanded={expandedBucket === bucket}
                onClick={() => clickable && setExpandedBucket(expandedBucket === bucket ? null : bucket)}
              />
            )
          })}

          {detailNodes.map((node) => <NodeGroup key={node.key} node={node} fmtAmt={fmtAmt} />)}
        </svg>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 px-1">
        {[...leftNodes, ...midNodes, ...detailNodes].map((node) => (
          <div key={node.key} className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: node.color }} />
            <span className="text-[9px] text-zinc-500">{node.label}</span>
            <span className="text-[9px] text-zinc-600 tabular-nums">{fmtAmt(node.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
