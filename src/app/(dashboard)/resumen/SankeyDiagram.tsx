'use client'

import { useState, useRef, useCallback } from 'react'
import { ChevronUp } from 'lucide-react'
import { isLoanPayment } from './categoryUtils'
import { isValuationConcept } from '@/lib/incomeAllocation'
import { type FlowWindow, classifyFlowTx } from '@/lib/ahorroInversionFlow'

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
// A 4th fully-distinct categorical hue alongside Ahorro/Inversión/Deuda
// doesn't clear CVD separation in this app's dark mode (the dataviz
// skill's own palette caps all-pairs-safe categoricals at 3) — so Gasto,
// Cuotas and Margen stay a neutral zinc ladder by lightness instead of a
// 4th competing hue: lighter = Cuotas (a known recurring bill), mid =
// Gasto (the default "left"), darkest/most recessive = Margen
// (unclassified leftover).
const COLOR_NECESARIO      = '#52525b'
const COLOR_DISCRECIONAL   = '#a1a1aa'
const COLOR_CUOTAS         = '#71717a'
const COLOR_AHORRO         = '#199e70'
const COLOR_INVERSION      = '#9085e9'
const COLOR_DEUDA          = '#d95926'
const COLOR_MARGIN         = '#3f3f46'
const EXPENSE_COLORS       = ['#f87171', '#fb923c', '#fbbf24', '#e879f9', '#94a3b8', '#64748b']

// UI-level buckets — Gasto itself splits into Necesario/Discrecional here
// (via tx.is_survival_expense) so "cuánto gasto en sobrevivencia vs.
// discrecional" is a direct answer, not buried inside a Gasto drill-down.
// cuotas/ahorro/inversion/deuda map 1:1 to FlowWindow's own fields.
type UiBucket = 'necesario' | 'discrecional' | 'cuotas' | 'ahorro' | 'inversion' | 'deuda'

const UI_BUCKET_LABEL: Record<UiBucket, string> = {
  necesario: 'Necesario', discrecional: 'Discrecional', cuotas: 'Cuotas préstamos',
  ahorro: 'Ahorro', inversion: 'Inversión', deuda: 'Abono extra deuda',
}
const UI_BUCKET_COLOR: Record<UiBucket, string> = {
  necesario: COLOR_NECESARIO, discrecional: COLOR_DISCRECIONAL, cuotas: COLOR_CUOTAS,
  ahorro: COLOR_AHORRO, inversion: COLOR_INVERSION, deuda: COLOR_DEUDA,
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

const W      = 900
const MID_X1 = W - NODE_W
const MID_X2 = W

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

// ── Summary card groups — each of the four questions this page exists to
// answer (tipos de ingreso / gasto / ahorro+inversión / deuda) as one card,
// with a proportional mini-bar + legend so the relative size of its own
// items is readable at a glance, not just each item's size vs. total
// income. Clicking a clickable item reuses the exact same expandedBucket
// drill-down as clicking its Sankey node — one state, two entry points. ──

type GroupItem = { key: string; label: string; amount: number; color: string; clickable: boolean }

function BucketGroupCard({
  label, items, fmtAmt, monthsInWindow, totalIncome, showPctOfIncome = true, onToggle,
}: {
  label: string
  items: GroupItem[]
  fmtAmt: (n: number) => string
  monthsInWindow: number
  totalIncome: number
  showPctOfIncome?: boolean
  onToggle: (key: string) => void
}) {
  const visible = items.filter(i => i.amount > 0)
  const total = visible.reduce((s, i) => s + i.amount, 0)
  if (total <= 0) return null

  return (
    <div className="bg-black/20 rounded-xl p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[8px] text-zinc-500 uppercase tracking-wider">{label}</p>
        <div className="text-right shrink-0">
          <p className="text-sm font-black tabular-nums text-zinc-200 leading-none">{fmtAmt(total)}</p>
          <p className="text-[8px] text-zinc-600 mt-0.5 tabular-nums">
            {showPctOfIncome && totalIncome > 0 && `${((total / totalIncome) * 100).toFixed(0)}% del ingreso`}
            {showPctOfIncome && totalIncome > 0 && monthsInWindow > 1 && ' · '}
            {monthsInWindow > 1 && `~${fmtAmt(total / monthsInWindow)}/mes`}
          </p>
        </div>
      </div>

      {/* Proportional mini-bar — this item's size relative to the rest of the group */}
      {visible.length > 1 && (
        <div className="flex rounded-full overflow-hidden h-1.5 mb-2 gap-[1px]">
          {visible.map(i => (
            <div key={i.key} style={{ flex: i.amount, background: i.color }} />
          ))}
        </div>
      )}

      <div className="space-y-1">
        {visible.map(i => {
          const pct = total > 0 ? (i.amount / total) * 100 : 0
          const row = (
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="inline-block w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: i.color }} />
                <span className="text-[9px] text-zinc-400 truncate">{i.label}{i.clickable ? ' ›' : ''}</span>
              </span>
              <span className="text-[9px] tabular-nums shrink-0">
                <span className="text-zinc-300 font-semibold">{fmtAmt(i.amount)}</span>
                {visible.length > 1 && <span className="text-zinc-600"> · {pct.toFixed(0)}%</span>}
              </span>
            </div>
          )
          return i.clickable ? (
            <button key={i.key} onClick={() => onToggle(i.key)}
              className="w-full text-left hover:bg-white/[0.04] rounded-md px-1 -mx-1 py-0.5 transition-colors">
              {row}
            </button>
          ) : (
            <div key={i.key} className="px-1 py-0.5">{row}</div>
          )
        })}
      </div>
    </div>
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
  const [expandedBucket, setExpandedBucket] = useState<UiBucket | null>(null)

  // ── Left side: income sources (unrelated to the gasto/ahorro/inversión
  // split — a different question, "where income came from" vs. "where it
  // went") ──────────────────────────────────────────────────────────────
  let activeIncome = 0, passiveIncome = 0, patrimonial = 0
  // Gasto category breakdown, split necesario/discrecional — gated by
  // classifyFlowTx so the two sum to exactly flow.gasto, same as the
  // Necesario+Discrecional node amounts below.
  const expenseMapNecesario: Record<string, number> = {}
  const expenseMapDiscrecional: Record<string, number> = {}

  for (const tx of transactions) {
    const amt = Number(tx.amount ?? 0)
    if (amt <= 0 && tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') continue
    if (isActivIncome(tx))    { activeIncome  += amt; continue }
    if (isPassiveIncome(tx))  { passiveIncome += amt; continue }
    if (isPatrimonialIncome(tx) && amt > 0) { patrimonial += amt; continue }
    if (classifyFlowTx(tx) === 'gasto') {
      const label = getExpenseLabel(tx)
      const map = tx.is_survival_expense ? expenseMapNecesario : expenseMapDiscrecional
      map[label] = (map[label] ?? 0) + amt
    }
  }

  const totalIncome = activeIncome + passiveIncome + patrimonial
  if (totalIncome === 0) return null

  // Canonical gasto/cuotas/ahorro/inversión/deuda — same figures the
  // summary cards above and /progreso's AhorroInversionSection report,
  // not re-derived here.
  const margin = totalIncome - flow.gasto - flow.cuotas - flow.ahorro - flow.inversion - flow.deuda

  // Window can span anywhere from one month (period tabs like 'mtd'/'1m') to
  // several years ('all'/'5y') — a raw total alone answers "how much" but not
  // "is that a lot", so wide windows also get a per-month average. ~30.44
  // days/month (365.25/12) rather than calendar-month counting: `to` is
  // exclusive and doesn't line up on month boundaries for every period.
  const daysInWindow = (new Date(flow.to).getTime() - new Date(flow.from).getTime()) / 86_400_000
  const monthsInWindow = Math.max(1, Math.round(daysInWindow / 30.44))

  const amountFor = (b: UiBucket): number => {
    if (b === 'necesario') return flow.gastoSurvival
    if (b === 'discrecional') return flow.gastoDiscrecional
    return flow[b]
  }

  // ── Left nodes ────────────────────────────────────────────────────────────
  const leftRaw: Omit<SankeyNode, 'x1' | 'x2' | 'y1' | 'y2'>[] = []
  if (activeIncome  > 0) leftRaw.push({ key: 'active',      label: 'Ingreso activo',   amount: activeIncome,  color: COLOR_ACTIVE_INCOME })
  if (passiveIncome > 0) leftRaw.push({ key: 'passive',     label: 'Ingreso pasivo',   amount: passiveIncome, color: COLOR_PASSIVE_INCOME })
  if (patrimonial   > 0) leftRaw.push({ key: 'patrimonial', label: 'Val. patrimonial', amount: patrimonial,   color: COLOR_PATRIMONIAL })

  // ── Mid nodes: Necesario / Discrecional / Cuotas / Ahorro / Inversión /
  // Abono extra deuda / Margen ──────────────────────────────────────────
  const midRaw: Omit<SankeyNode, 'x1' | 'x2' | 'y1' | 'y2'>[] = []
  const UI_ORDER: UiBucket[] = ['necesario', 'discrecional', 'cuotas', 'ahorro', 'inversion', 'deuda']
  for (const b of UI_ORDER) {
    const amount = amountFor(b)
    if (amount > 0) midRaw.push({ key: b, label: UI_BUCKET_LABEL[b], amount, color: UI_BUCKET_COLOR[b] })
  }
  if (margin > 0) midRaw.push({ key: 'margin', label: 'Margen neto', amount: margin, color: COLOR_MARGIN })

  if (leftRaw.length === 0 || midRaw.length === 0) return null

  // ── Drill-down source lists — same data every other consumer of `flow`
  // uses (flow.ahorroSources etc.), except Necesario/Discrecional, which
  // have no per-tx source list on FlowWindow and are grouped by expense
  // category here instead (reusing getExpenseLabel's nicer display names),
  // gated by classifyFlowTx + is_survival_expense so the two always sum to
  // exactly flow.gasto between them. Rendered as a bar list below the
  // diagram, not a 3rd Sankey column — a 3rd column forced the diagram
  // wider than the viewport on phones (scroll-to-see was the actual bug
  // report), and a bar list needs no extra width at all.
  function detailEntriesFor(b: UiBucket): [string, number][] {
    if (b === 'necesario') return Object.entries(expenseMapNecesario)
    if (b === 'discrecional') return Object.entries(expenseMapDiscrecional)
    if (b === 'cuotas') return flow.cuotasSources.map(s => [s.name, s.amount] as [string, number])
    if (b === 'ahorro') return flow.ahorroSources.map(s => [s.name, s.amount] as [string, number])
    if (b === 'inversion') return flow.inversionSources.map(s => [s.name, s.amount] as [string, number])
    return flow.deudaSources.map(s => [s.name, s.amount] as [string, number])
  }
  const canExpand = (b: UiBucket) => detailEntriesFor(b).length > 0
  const expandedEntries = expandedBucket ? foldTopN(detailEntriesFor(expandedBucket), amountFor(expandedBucket)) : []

  // ── Layout — always 2 columns, always the full container width; no
  // horizontal scroll regardless of what's expanded. ──────────────────────
  const leftNodes = layoutNodes(leftRaw, LEFT_X1, LEFT_X2, totalIncome)
  const midNodes  = layoutNodes(midRaw, MID_X1, MID_X2, totalIncome)
  const flows     = buildFlows(leftNodes, midNodes)

  // ── Tooltip data ──────────────────────────────────────────────────────────
  const allNodes = [...leftNodes, ...midNodes]
  const hoveredFlow = hoverFlow
    ? flows.find((f) => f.fromKey === hoverFlow.fromKey && f.toKey === hoverFlow.toKey)
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
        De dónde viene, y cuánto es gasto, ahorro, inversión o abono extra a deuda
      </p>

      {/* ── Summary — one card per question (ingreso / gasto / ahorro e
          inversión / deuda), each sectioned so its own items' relative
          size reads at a glance instead of only their size vs. total
          income. ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        <BucketGroupCard
          label="Ingreso" fmtAmt={fmtAmt} monthsInWindow={monthsInWindow} totalIncome={totalIncome}
          showPctOfIncome={false} onToggle={() => {}}
          items={[
            { key: 'active',      label: 'Ingreso activo',   amount: activeIncome,  color: COLOR_ACTIVE_INCOME,  clickable: false },
            { key: 'passive',     label: 'Ingreso pasivo',   amount: passiveIncome, color: COLOR_PASSIVE_INCOME, clickable: false },
            { key: 'patrimonial', label: 'Val. patrimonial', amount: patrimonial,   color: COLOR_PATRIMONIAL,    clickable: false },
          ]}
        />
        <BucketGroupCard
          label="Gasto" fmtAmt={fmtAmt} monthsInWindow={monthsInWindow} totalIncome={totalIncome}
          onToggle={(key) => setExpandedBucket(prev => prev === key ? null : key as UiBucket)}
          items={(['necesario', 'discrecional', 'cuotas'] as UiBucket[]).map(b => (
            { key: b, label: UI_BUCKET_LABEL[b], amount: amountFor(b), color: UI_BUCKET_COLOR[b], clickable: canExpand(b) }
          ))}
        />
        <BucketGroupCard
          label="Ahorro e inversión" fmtAmt={fmtAmt} monthsInWindow={monthsInWindow} totalIncome={totalIncome}
          onToggle={(key) => setExpandedBucket(prev => prev === key ? null : key as UiBucket)}
          items={(['ahorro', 'inversion'] as UiBucket[]).map(b => (
            { key: b, label: UI_BUCKET_LABEL[b], amount: amountFor(b), color: UI_BUCKET_COLOR[b], clickable: canExpand(b) }
          ))}
        />
        <BucketGroupCard
          label="Deuda" fmtAmt={fmtAmt} monthsInWindow={monthsInWindow} totalIncome={totalIncome}
          onToggle={(key) => setExpandedBucket(prev => prev === key ? null : key as UiBucket)}
          items={[{ key: 'deuda', label: UI_BUCKET_LABEL.deuda, amount: amountFor('deuda'), color: UI_BUCKET_COLOR.deuda, clickable: canExpand('deuda') }]}
        />
      </div>

      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider mb-1">
        Detalle · tocá un destino para ver sus fuentes
      </p>
      <div className="relative">
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
          width="100%"
          style={{ overflow: 'visible' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverFlow(null)}
          className="cursor-crosshair"
        >
          {flows.map((f, i) => {
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
            const bucket = node.key as UiBucket
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
        </svg>
      </div>

      {/* ── Drill-down — a bar list, not another Sankey column (that forced
          the whole diagram wider than the screen on phones). ── */}
      {expandedBucket && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
          <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: UI_BUCKET_COLOR[expandedBucket] }}>
            Fuentes de {UI_BUCKET_LABEL[expandedBucket]}
          </p>
          {expandedEntries.map(([name, amt], i) => {
            const expandedAmount = amountFor(expandedBucket)
            const pct = expandedAmount > 0 ? (amt / expandedAmount) * 100 : 0
            const isGastoCategory = expandedBucket === 'necesario' || expandedBucket === 'discrecional'
            const color = isGastoCategory ? EXPENSE_COLORS[i % EXPENSE_COLORS.length] : UI_BUCKET_COLOR[expandedBucket]
            return (
              <div key={name}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] text-zinc-400 truncate">{name}</span>
                  <span className="text-[10px] tabular-nums shrink-0">
                    <span className="text-zinc-300 font-bold">{fmtAmt(amt)}</span>
                    <span className="text-zinc-600"> · {pct.toFixed(0)}%</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-black/25 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 px-1">
        {allNodes.map((node) => (
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
