'use client'

import { useState, useRef, useCallback } from 'react'
import { isLoanPayment, SAVINGS_EXPENSE_GROUP } from './categoryUtils'

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
  // Loan payments always go to "Préstamos"
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

// ── Transaction classifiers ────────────────────────────────────────────────────

// Valuation entries (no movement_type): mark-to-market / unrealized, no cash impact
function isValuationEntry(tx: TxClient): boolean {
  if (tx.movement_type) return false
  const c = (tx.concept ?? '').toLowerCase()
  return /p[eé]rdida\s*valor|aumento\s*valor|valorizaci[oó]n/.test(c)
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

// Savings = expense_group === 'objetivos_financieros' AND NOT a loan payment
function isSavingsTx(tx: TxClient): boolean {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (tx.expense_group !== SAVINGS_EXPENSE_GROUP) return false
  return !isLoanPayment(tx.vendor, tx.concept, tx.category_code)
}

// Patrimonial loss: expense_group='na', no category_code — valuation adjustment
function isPatrimonialLoss(tx: TxClient): boolean {
  if (tx.movement_type !== 'expense') return false
  return tx.expense_group === 'na' && !tx.category_code
}

function isExpenseTx(tx: TxClient): boolean {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (tx.is_settlement) return false
  if (isPatrimonialLoss(tx)) return false
  if (tx.expense_group === SAVINGS_EXPENSE_GROUP) {
    // Only loan payments within objetivos_financieros count as expenses
    return isLoanPayment(tx.vendor, tx.concept, tx.category_code)
  }
  return true
}

// ── Node and flow data structures ─────────────────────────────────────────────

interface SankeyNode {
  key: string
  label: string
  amount: number
  color: string
  side: 'left' | 'right'
  // Layout (computed)
  x1: number
  x2: number
  y1: number
  y2: number
}

interface SankeyFlow {
  fromKey: string
  toKey: string
  // Fraction of from-node height this flow occupies (stacked from top)
  fromYStart: number // absolute y in SVG
  fromYEnd: number
  toYStart: number
  toYEnd: number
  color: string      // from-node color
  amount: number
}

// ── Colors ────────────────────────────────────────────────────────────────────

const COLOR_ACTIVE_INCOME  = '#a3e635'
const COLOR_PASSIVE_INCOME = '#34d399'
const COLOR_SAVINGS        = '#60a5fa'
const COLOR_MARGIN         = '#a78bfa'
const EXPENSE_COLORS       = ['#f87171', '#fb923c', '#fbbf24', '#e879f9', '#94a3b8', '#64748b']

// ── Layout constants ──────────────────────────────────────────────────────────

const W     = 900
const H     = 400
const NODE_W      = 140
const NODE_GAP    = 4
const PAD_TOP     = 8
const PAD_BOTTOM  = 8
const USABLE_H    = H - PAD_TOP - PAD_BOTTOM
const LEFT_X1     = 0
const LEFT_X2     = NODE_W
const RIGHT_X1    = W - NODE_W
const RIGHT_X2    = W
const CP_X        = W / 2  // bezier control-point x

// ── Layout computation ────────────────────────────────────────────────────────

function layoutNodes(
  nodes: Omit<SankeyNode, 'x1' | 'x2' | 'y1' | 'y2'>[],
  side: 'left' | 'right',
  totalAmount: number,
): SankeyNode[] {
  const x1 = side === 'left' ? LEFT_X1 : RIGHT_X1
  const x2 = side === 'left' ? LEFT_X2 : RIGHT_X2
  const total = totalAmount || 1

  // Total gap space
  const gapSpace = NODE_GAP * (nodes.length - 1)
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

// Build flows: each left node contributes proportionally to all right nodes
function buildFlows(leftNodes: SankeyNode[], rightNodes: SankeyNode[]): SankeyFlow[] {
  const flows: SankeyFlow[] = []

  const totalIncome = leftNodes.reduce((s, n) => s + n.amount, 0) || 1

  // Track how much of each right node's height has been filled from the top
  const rightFilled: Record<string, number> = {}
  rightNodes.forEach((n) => { rightFilled[n.key] = n.y1 })

  // Track how much of each left node's height has been filled from the top
  const leftFilled: Record<string, number> = {}
  leftNodes.forEach((n) => { leftFilled[n.key] = n.y1 })

  for (const right of rightNodes) {
    const rightH = right.y2 - right.y1
    for (const left of leftNodes) {
      const leftShare = left.amount / totalIncome
      const flowH = Math.max(0, leftShare * rightH)
      if (flowH < 0.5) continue  // skip sub-pixel flows

      const leftNodeH = left.y2 - left.y1
      const rightShare = right.amount / totalIncome
      const fromH = Math.max(0, rightShare * leftNodeH)

      const fromYStart = leftFilled[left.key]
      const fromYEnd   = fromYStart + fromH
      leftFilled[left.key] = fromYEnd

      const toYStart = rightFilled[right.key]
      const toYEnd   = toYStart + flowH
      rightFilled[right.key] = toYEnd

      flows.push({
        fromKey: left.key,
        toKey:   right.key,
        fromYStart,
        fromYEnd,
        toYStart,
        toYEnd,
        color:  left.color,
        amount: (left.amount / totalIncome) * right.amount,
      })
    }
  }

  return flows
}

// ── Bezier flow path ──────────────────────────────────────────────────────────

function flowPath(flow: SankeyFlow, leftX2: number, rightX1: number): string {
  const { fromYStart, fromYEnd, toYStart, toYEnd } = flow
  const fx = leftX2
  const tx = rightX1

  // Top cubic bezier
  const topD  = `M${fx},${fromYStart.toFixed(2)} C${CP_X},${fromYStart.toFixed(2)} ${CP_X},${toYStart.toFixed(2)} ${tx},${toYStart.toFixed(2)}`
  // Bottom cubic bezier (reversed)
  const botD  = `L${tx},${toYEnd.toFixed(2)} C${CP_X},${toYEnd.toFixed(2)} ${CP_X},${fromYEnd.toFixed(2)} ${fx},${fromYEnd.toFixed(2)}`

  return `${topD} ${botD} Z`
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SankeyDiagram({
  transactions,
  fmtAmt,
}: {
  transactions: TxClient[]
  fmtAmt: (n: number) => string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverFlow, setHoverFlow] = useState<{ fromKey: string; toKey: string } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // ── Aggregate ──────────────────────────────────────────────────────────────

  let activeIncome  = 0
  let passiveIncome = 0
  let patrimonial   = 0

  const expenseMap: Record<string, number> = {}
  let totalSavings = 0

  for (const tx of transactions) {
    const amt = Number(tx.amount ?? 0)
    if (amt <= 0 && tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') continue

    if (isActivIncome(tx))    { activeIncome  += amt; continue }
    if (isPassiveIncome(tx))  { passiveIncome += amt; continue }
    if (isPatrimonialIncome(tx) && amt > 0) { patrimonial += amt; continue }
    if (isSavingsTx(tx))      { totalSavings  += amt; continue }
    if (isExpenseTx(tx)) {
      const label = getExpenseLabel(tx)
      expenseMap[label] = (expenseMap[label] ?? 0) + amt
    }
  }

  const totalIncome = activeIncome + passiveIncome + patrimonial
  if (totalIncome === 0) return null

  const totalExpenses = Object.values(expenseMap).reduce((s, v) => s + v, 0)
  const margin = totalIncome - totalExpenses - totalSavings

  // ── Left nodes ────────────────────────────────────────────────────────────

  const leftRaw: Omit<SankeyNode, 'x1' | 'x2' | 'y1' | 'y2'>[] = []
  if (activeIncome  > 0) leftRaw.push({ key: 'active',     label: 'Ingreso activo',  amount: activeIncome,  color: COLOR_ACTIVE_INCOME,  side: 'left' })
  if (passiveIncome > 0) leftRaw.push({ key: 'passive',    label: 'Ingreso pasivo',  amount: passiveIncome, color: COLOR_PASSIVE_INCOME, side: 'left' })
  if (patrimonial   > 0) leftRaw.push({ key: 'patrimonial',label: 'Val. patrimonial',amount: patrimonial,   color: '#a78bfa',            side: 'left' })

  // ── Right nodes: expenses (top 6 + Otros), then savings, then margin ────

  // Sort and group expenses
  const expenseEntries = Object.entries(expenseMap).sort((a, b) => b[1] - a[1])
  const TOP_N = 6
  const topExpenses = expenseEntries.slice(0, TOP_N)
  const smallExpenses = expenseEntries.slice(TOP_N)
  const othersFromSmall = smallExpenses.reduce((s, [, v]) => s + v, 0)

  // Also group categories < 3% of total expenses into "Otros"
  const THRESHOLD_PCT = 0.03
  const threshold = totalExpenses * THRESHOLD_PCT
  const main: [string, number][]  = []
  let   othersAccum = othersFromSmall

  for (const [label, amt] of topExpenses) {
    if (amt < threshold) {
      othersAccum += amt
    } else {
      main.push([label, amt])
    }
  }

  // Re-sort after threshold filtering
  main.sort((a, b) => b[1] - a[1])

  const rightRaw: Omit<SankeyNode, 'x1' | 'x2' | 'y1' | 'y2'>[] = []

  main.forEach(([label, amt], i) => {
    rightRaw.push({
      key:    `exp_${label}`,
      label,
      amount: amt,
      color:  EXPENSE_COLORS[i % EXPENSE_COLORS.length],
      side:   'right',
    })
  })

  if (othersAccum > threshold || (othersAccum > 0 && main.length === 0)) {
    rightRaw.push({
      key:   'exp_otros',
      label: 'Otros gastos',
      amount: othersAccum,
      color: '#64748b',
      side:  'right',
    })
  }

  if (totalSavings > 0) {
    rightRaw.push({
      key:   'savings',
      label: 'Ahorros / Inv.',
      amount: totalSavings,
      color: COLOR_SAVINGS,
      side:  'right',
    })
  }

  if (margin > 0) {
    rightRaw.push({
      key:   'margin',
      label: 'Margen neto',
      amount: margin,
      color: COLOR_MARGIN,
      side:  'right',
    })
  }

  if (leftRaw.length === 0 || rightRaw.length === 0) return null

  // ── Layout ────────────────────────────────────────────────────────────────

  const leftNodes  = layoutNodes(leftRaw,  'left',  totalIncome)
  const rightNodes = layoutNodes(rightRaw, 'right', totalIncome)
  const flows      = buildFlows(leftNodes, rightNodes)

  // ── Tooltip data ──────────────────────────────────────────────────────────

  const hoveredFlow = hoverFlow
    ? flows.find((f) => f.fromKey === hoverFlow.fromKey && f.toKey === hoverFlow.toKey)
    : null

  const hoveredFromNode = hoveredFlow
    ? leftNodes.find((n) => n.key === hoveredFlow.fromKey)
    : null

  const hoveredToNode = hoveredFlow
    ? rightNodes.find((n) => n.key === hoveredFlow.toKey)
    : null

  // ── Mouse tracking ────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5">
      <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-1">
        Flujo de ingresos
      </p>
      <p className="text-xs text-zinc-500 mb-4">
        Cómo se distribuyen tus ingresos en el período
      </p>

      <div className="relative">
        {/* Tooltip */}
        {hoveredFlow && hoveredFromNode && hoveredToNode && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: tooltipPos.x,
              top:  tooltipPos.y,
              transform: 'translate(12px, -50%)',
            }}
          >
            <div className="bg-[#111811] border border-[#a3e635]/20 rounded-xl px-3 py-2.5 shadow-xl whitespace-nowrap text-[11px]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ background: hoveredFromNode.color }}
                />
                <span className="text-zinc-300 font-semibold">{hoveredFromNode.label}</span>
                <span className="text-zinc-600 mx-1">→</span>
                <span
                  className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ background: hoveredToNode.color }}
                />
                <span className="text-zinc-300 font-semibold">{hoveredToNode.label}</span>
              </div>
              <p className="text-center font-black tabular-nums text-white">
                {fmtAmt(hoveredFlow.amount)}
              </p>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverFlow(null)}
          className="cursor-crosshair"
          style={{ overflow: 'visible' }}
        >
          {/* ── Flows ── */}
          {flows.map((flow) => {
            const isHovered = hoverFlow?.fromKey === flow.fromKey && hoverFlow?.toKey === flow.toKey
            const isAnyHovered = hoverFlow !== null
            const opacity = isHovered ? 0.6 : isAnyHovered ? 0.1 : 0.25

            return (
              <path
                key={`${flow.fromKey}-${flow.toKey}`}
                d={flowPath(flow, LEFT_X2, RIGHT_X1)}
                fill={flow.color}
                fillOpacity={opacity}
                stroke="none"
                style={{ transition: 'fill-opacity 0.15s ease', cursor: 'pointer' }}
                onMouseEnter={() => setHoverFlow({ fromKey: flow.fromKey, toKey: flow.toKey })}
              />
            )
          })}

          {/* ── Left nodes ── */}
          {leftNodes.map((node) => (
            <g key={node.key}>
              <rect
                x={node.x1}
                y={node.y1}
                width={node.x2 - node.x1}
                height={node.y2 - node.y1}
                fill={node.color}
                fillOpacity={0.85}
                rx={3}
              />
              {/* Label — inside if tall enough, outside otherwise */}
              {(node.y2 - node.y1) >= 22 ? (
                <>
                  <text
                    x={node.x1 + (node.x2 - node.x1) / 2}
                    y={node.y1 + (node.y2 - node.y1) / 2 - 6}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#0d120d"
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.label}
                  </text>
                  <text
                    x={node.x1 + (node.x2 - node.x1) / 2}
                    y={node.y1 + (node.y2 - node.y1) / 2 + 8}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill="#0d120d"
                    fillOpacity={0.7}
                    style={{ pointerEvents: 'none' }}
                  >
                    {fmtAmt(node.amount)}
                  </text>
                </>
              ) : (
                <text
                  x={node.x1 - 4}
                  y={node.y1 + (node.y2 - node.y1) / 2 + 4}
                  textAnchor="end"
                  fontSize="9"
                  fontWeight="600"
                  fill={node.color}
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label}
                </text>
              )}
            </g>
          ))}

          {/* ── Right nodes ── */}
          {rightNodes.map((node) => (
            <g key={node.key}>
              <rect
                x={node.x1}
                y={node.y1}
                width={node.x2 - node.x1}
                height={node.y2 - node.y1}
                fill={node.color}
                fillOpacity={0.85}
                rx={3}
              />
              {(node.y2 - node.y1) >= 22 ? (
                <>
                  <text
                    x={node.x1 + (node.x2 - node.x1) / 2}
                    y={node.y1 + (node.y2 - node.y1) / 2 - 6}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#0d120d"
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.label}
                  </text>
                  <text
                    x={node.x1 + (node.x2 - node.x1) / 2}
                    y={node.y1 + (node.y2 - node.y1) / 2 + 8}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill="#0d120d"
                    fillOpacity={0.7}
                    style={{ pointerEvents: 'none' }}
                  >
                    {fmtAmt(node.amount)}
                  </text>
                </>
              ) : (
                <text
                  x={node.x2 + 4}
                  y={node.y1 + (node.y2 - node.y1) / 2 + 4}
                  textAnchor="start"
                  fontSize="9"
                  fontWeight="600"
                  fill={node.color}
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 px-1">
        {[...leftNodes, ...rightNodes].map((node) => (
          <div key={node.key} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
              style={{ background: node.color }}
            />
            <span className="text-[9px] text-zinc-500">{node.label}</span>
            <span className="text-[9px] text-zinc-600 tabular-nums">{fmtAmt(node.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
