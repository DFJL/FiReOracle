'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { ChevronDown, Pencil, Trash2, X, Loader2 } from 'lucide-react'
import { inferCategory, displayCategory, getGroupLabel, SAVINGS_EXPENSE_GROUP, isLoanPayment } from './categoryUtils'
import { classifyTransactions } from '@/app/actions/classify'
import { SankeyDiagram } from './SankeyDiagram'
import type { ExchangeRate } from '@/lib/exchange-rate'
import {
  updateTransaction, deleteTransaction, type UpdateTransactionInput,
  getLeafEnvelopes, getTransactionEnvelopeLink, updateTransactionEnvelopeLink,
} from '@/app/actions/transactions'

// ── types ─────────────────────────────────────────────────────────────────────

export interface TxClient {
  id: string
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
  notes?: string | null
  investment_bucket_id?: string | null
  created_at?: string | null
}

type Category = {
  code: string; name: string; parent_code: string | null
  category_type: string; group_gasto: string | null
  is_passive_income: boolean; is_survival_expense: boolean; is_settlement: boolean
}

export interface AccountSummary {
  liquidBalance: number   // checking + cash accounts
  savingsBalance: number  // savings + investment accounts
}

type TabKey        = 'gastos' | 'ingresos'
type IncomeSubtab  = 'activo' | 'pasivo'
type EgresosSubtab = 'gastos' | 'ahorros' | 'inversiones'
type PeriodKey     = 'all' | 'ytd' | 'mtd' | '1y' | '6m' | '3m' | '1m' | '2y' | '5y'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function periodCutoff(p: PeriodKey): string | null {
  const now = new Date()
  if (p === 'mtd') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  if (p === '1m')  { const d = new Date(now); d.setMonth(d.getMonth() - 1);       return d.toISOString().slice(0, 10) }
  if (p === '3m')  { const d = new Date(now); d.setMonth(d.getMonth() - 3);       return d.toISOString().slice(0, 10) }
  if (p === '6m')  { const d = new Date(now); d.setMonth(d.getMonth() - 6);       return d.toISOString().slice(0, 10) }
  if (p === 'ytd') return `${now.getFullYear()}-01-01`
  if (p === '1y')  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) }
  if (p === '2y')  { const d = new Date(now); d.setFullYear(d.getFullYear() - 2); return d.toISOString().slice(0, 10) }
  if (p === '5y')  { const d = new Date(now); d.setFullYear(d.getFullYear() - 5); return d.toISOString().slice(0, 10) }
  return null
}

const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  income:          { label: 'Ingreso',  cls: 'bg-emerald-500/10 text-emerald-400' },
  expense:         { label: 'Gasto',    cls: 'bg-rose-500/10 text-rose-400' },
  cash_withdrawal: { label: 'Efectivo', cls: 'bg-amber-500/10 text-amber-400' },
}
const AMT_COLOR: Record<string, string> = {
  income: 'text-emerald-400', expense: 'text-rose-400', cash_withdrawal: 'text-amber-400',
}

// ── vendor / concept learning ─────────────────────────────────────────────────

type CatMap = Record<string, string>

function buildVendorCatMap(txs: TxClient[]): CatMap {
  const votes: Record<string, Record<string, number>> = {}
  for (const tx of txs) {
    if (!tx.category_code || GENERIC_CODES.has(tx.category_code) || !tx.vendor) continue
    const k = tx.vendor.toLowerCase().trim()
    if (!k || k === 'na') continue
    if (!votes[k]) votes[k] = {}
    votes[k][tx.category_code] = (votes[k][tx.category_code] ?? 0) + 1
  }
  const map: CatMap = {}
  for (const [v, counts] of Object.entries(votes)) {
    const w = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (w) map[v] = w[0]
  }
  return map
}

function buildConceptCatMap(txs: TxClient[]): CatMap {
  const votes: Record<string, Record<string, number>> = {}
  for (const tx of txs) {
    if (!tx.category_code || GENERIC_CODES.has(tx.category_code) || !tx.concept) continue
    const vendor = (tx.vendor ?? '').toLowerCase().trim()
    if (vendor && vendor !== 'na') continue
    const k = tx.concept.toLowerCase().trim()
    if (!k) continue
    if (!votes[k]) votes[k] = {}
    votes[k][tx.category_code] = (votes[k][tx.category_code] ?? 0) + 1
  }
  const map: CatMap = {}
  for (const [c, counts] of Object.entries(votes)) {
    const w = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (w && w[1] >= 2) map[c] = w[0]
  }
  return map
}

// Category hierarchy: GRUPO (expense_group) → CONCEPTO (category_code) → DETALLE (vendor/concept inference)
//
// Generic "bucket" codes (SAVINGS, MISC, TRANSFER, etc.) are container tags that describe
// the account/bucket destination, not the economic nature of the transaction.
// These always fall through to inferCategory so concept/vendor patterns can give a
// more specific code (e.g. SAVINGS_FUND, MARIAM, CAR, etc.).
// Returns a canonical category CODE. Callers wrap with displayCategory() (L2) or getGroupLabel() (L1).

// Codes that are too generic to use as-is — always fall through to inferCategory
const GENERIC_CODES = new Set([
  'SAVINGS', 'INCOME', 'SAVINGS_INVESTMENT', 'PASSIVE_INCOME',
  'MISC', 'MISC_EXPENSE', 'TRANSFER', 'CASH_WITHDRAWAL', 'DEPOSIT_DEBIT',
])

function resolveCategory(tx: TxClient, vMap: CatMap, cMap: CatMap): string {
  const ck = (tx.concept ?? '').toLowerCase().trim()
  const vk = (tx.vendor ?? '').toLowerCase().trim()

  // Use category_code when it carries specific meaning (not a generic bucket tag)
  if (tx.category_code && !GENERIC_CODES.has(tx.category_code)) {
    return tx.category_code
  }

  // Concept-level pattern overrides → codes
  if (/^abarrotes/i.test(ck)) return 'FOOD_SUPER'
  if (/^impresion/i.test(ck)) return 'HOUSEHOLD'

  // vMap is unreliable for expense transactions: the same vendor (e.g. TRANSCOMER)
  // appears in both passive income context (rendimientos) and savings context (apertura fondo).
  // The map learns the majority class (income) and misclassifies savings outflows.
  const isExpenseTx = tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal'
  if (!isExpenseTx && vk && vk !== 'na' && vMap[vk] && !GENERIC_CODES.has(vMap[vk])) return vMap[vk]
  if (!isExpenseTx && ck && (!vk || vk === 'na') && cMap[ck] && !GENERIC_CODES.has(cMap[ck])) return cMap[ck]
  return inferCategory(tx.vendor, tx.concept, null)
}

// ── classifiers ───────────────────────────────────────────────────────────────

// Pérdidas contables patrimoniales — espejo de rendimientos pasivos, no afectan liquidez
function isPatrimonialLoss(tx: TxClient) {
  if (tx.movement_type !== 'expense') return false
  // expense_group='na' con category_code null = ajuste de valoración (crypto, fondos)
  return tx.expense_group === 'na' && !tx.category_code
}

function isOutflow(tx: TxClient) {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (isPatrimonialLoss(tx)) return false  // pérdidas contables no son gastos reales
  if (tx.expense_group !== SAVINGS_EXPENSE_GROUP) return true
  return isLoanPayment(tx.vendor, tx.concept, tx.category_code)
}

// movement_type es el árbitro de liquidez — si tiene 'income' tocó una cuenta real.
// Los registros con movement_type=NULL (Mov=#N/A en el sheet) son solo valorización
// contable (rendimientos reinvertidos, mark-to-market) y nunca tocan cuentas.
// is_passive_income solo describe naturaleza económica (activo vs pasivo), no liquidez.
function isLiquidIncome(tx: TxClient) {
  return tx.movement_type === 'income' && !tx.is_settlement
}

// Valorización pura: registros sin movement_type — ganancia/pérdida no realizada
function isPatrimonialIncome(tx: TxClient) {
  return !tx.movement_type && tx.amount != null && Number(tx.amount) > 0
}

// Mantener isInflow como alias de isLiquidIncome para compatibilidad interna
const isInflow = isLiquidIncome

function isSavings(tx: TxClient) {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (tx.expense_group !== SAVINGS_EXPENSE_GROUP) return false
  if (isLoanPayment(tx.vendor, tx.concept, tx.category_code)) return false
  // If a specific (non-generic) category code is present, it must be SAVINGS_*
  // This excludes RENTAL_EXPENSE, MISC_EXPENSE non-valuation items, etc.
  if (tx.category_code && !GENERIC_CODES.has(tx.category_code) && !tx.category_code.startsWith('SAVINGS_')) return false
  // Exclude valuation/accounting entries (pérdida/aumento valor) — not real cash savings
  if ((!tx.category_code || GENERIC_CODES.has(tx.category_code)) && /p[eé]rdida\s*valor|aumento\s*valor|valorizaci[oó]n/i.test(tx.concept ?? '')) return false
  return true
}

const INVEST_CODES = new Set(['SAVINGS_FUND', 'SAVINGS_CRYPTO', 'SAVINGS_PENSION', 'INVESTMENT', 'REAL_ESTATE', 'SAVINGS_INVESTMENT'])
const isInvestment = (tx: TxClient) => {
  // Use same GENERIC_CODES logic as resolveCategory to avoid inconsistency
  const code = (tx.category_code && !GENERIC_CODES.has(tx.category_code))
    ? tx.category_code
    : inferCategory(tx.vendor, tx.concept, null)
  return INVEST_CODES.has(code)
}

const TAB_FILTER: Record<TabKey, (tx: TxClient) => boolean> = {
  gastos:   isOutflow,
  ingresos: (tx) => isLiquidIncome(tx) || isPatrimonialIncome(tx),
}

function getTxConcept(tx: TxClient): string {
  const c = tx.concept?.trim()
  if (c && c.toLowerCase() !== 'na') return c
  return tx.vendor?.trim() || '—'
}

// ── SVG trend chart — 3 series with hover tooltip ────────────────────────────

interface SeriesPoint { month: string; income: number; passive: number; expenses: number; balance: number }

const TREND_SERIES = [
  { key: 'income',   color: '#a3e635',         label: 'Ingresos',    dashed: false },
  { key: 'passive',  color: 'rgb(34 211 238)',  label: 'Ing. pasivo', dashed: true  },
  { key: 'expenses', color: 'rgb(251 113 133)', label: 'Gastos',      dashed: false },
  { key: 'balance',  color: 'rgb(96 165 250)',  label: 'Balance',     dashed: true  },
] as const

function MultiTrendChart({ points }: { points: SeriesPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [visible, setVisible] = useState<Set<string>>(() => new Set(['income', 'passive', 'expenses', 'balance']))

  function toggle(key: string) {
    setVisible(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  if (points.length < 2) return null
  const W = 800, H = 160, px = 4, pt = 8, pb = 24
  const chartH = H - pt - pb
  const chartW = W - px * 2

  // Shared scale across all series so toggling doesn't rescale
  const allVals = points.flatMap(p => [p.income, p.passive, p.expenses, p.balance])
  const minV = Math.min(...allVals, 0)
  const maxV = Math.max(...allVals, 1)
  const range = maxV - minV || 1

  const toY = (v: number) => pt + chartH - ((v - minV) / range) * chartH
  const toX = (i: number) => px + (i / Math.max(points.length - 1, 1)) * chartW

  function makePath(vals: number[]) {
    const xs = vals.map((_, i) => toX(i))
    const ys = vals.map(v => toY(v))
    let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`
    for (let i = 1; i < xs.length; i++) {
      const cpX = ((xs[i-1] + xs[i]) / 2).toFixed(1)
      d += ` C${cpX},${ys[i-1].toFixed(1)} ${cpX},${ys[i].toFixed(1)} ${xs[i].toFixed(1)},${ys[i].toFixed(1)}`
    }
    return { d, xs, ys }
  }

  const inc  = makePath(points.map(p => p.income))
  const pas  = makePath(points.map(p => p.passive))
  const exp  = makePath(points.map(p => p.expenses))
  const bal  = makePath(points.map(p => p.balance))
  const zeroY = minV < 0 ? toY(0) : null
  const step = points.length > 36 ? 6 : points.length > 24 ? 3 : points.length > 12 ? 2 : 1

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    let closest = 0, minDist = Infinity
    points.forEach((_, i) => { const dist = Math.abs(toX(i) - svgX); if (dist < minDist) { minDist = dist; closest = i } })
    setHoverIdx(closest)
  }

  const hi = hoverIdx
  const fmt = (n: number) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
  const hx = hi !== null ? toX(hi) : null

  return (
    <div className="relative">
      {hi !== null && hx !== null && (
        <div className="absolute z-10 pointer-events-none"
          style={{ left: `${(hx / W) * 100}%`, top: 0, transform: 'translateX(-50%)' }}>
          <div className="bg-[#111811] border border-[#a3e635]/20 rounded-xl px-3 py-2.5 shadow-xl whitespace-nowrap text-[11px]">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 text-center">
              {MONTH_LABELS[parseInt(points[hi].month.slice(5,7))-1]} {points[hi].month.slice(0,4)}
            </p>
            <div className="flex flex-col gap-1">
              {visible.has('income') && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#a3e635]/70">Ingresos</span>
                  <span className="font-black text-[#a3e635] tabular-nums">{fmt(points[hi].income)}</span>
                </div>
              )}
              {visible.has('passive') && points[hi].passive > 0 && (
                <div className="flex items-center justify-between gap-4 pl-3">
                  <span className="text-[9px] text-cyan-400/60">↳ Pasivo</span>
                  <span className="font-black text-cyan-400 tabular-nums text-[9px]">{fmt(points[hi].passive)}</span>
                </div>
              )}
              {visible.has('expenses') && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-rose-400/70">Gastos</span>
                  <span className="font-black text-rose-400 tabular-nums">{fmt(points[hi].expenses)}</span>
                </div>
              )}
              {visible.has('balance') && (
                <div className="border-t border-white/[0.06] mt-1 pt-1 flex items-center justify-between gap-4">
                  <span className="text-blue-400/70">Balance</span>
                  <span className={`font-black tabular-nums ${points[hi].balance >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>{fmt(points[hi].balance)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="cursor-crosshair"
        onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          <linearGradient id="grad-inc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e635" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#a3e635" stopOpacity="0" />
          </linearGradient>
        </defs>
        {zeroY !== null && <line x1={px} y1={zeroY} x2={W-px} y2={zeroY} stroke="rgb(113 113 122/0.25)" strokeDasharray="4 3" strokeWidth="1" />}
        {/* Income fill */}
        {visible.has('income') && (
          <path d={inc.d + ` L${inc.xs[inc.xs.length-1].toFixed(1)},${(pt+chartH).toFixed(1)} L${inc.xs[0].toFixed(1)},${(pt+chartH).toFixed(1)} Z`}
            fill="url(#grad-inc)" />
        )}
        {/* Lines */}
        {visible.has('expenses') && <path d={exp.d} fill="none" stroke="rgb(251 113 133)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />}
        {visible.has('passive')  && <path d={pas.d} fill="none" stroke="rgb(34 211 238)"  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" strokeDasharray="5 3" />}
        {visible.has('balance')  && <path d={bal.d} fill="none" stroke="rgb(96 165 250)"  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" strokeDasharray="5 3" />}
        {visible.has('income')   && <path d={inc.d} fill="none" stroke="#a3e635"          strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round" />}
        {/* Hover crosshair + dots */}
        {hi !== null && hx !== null && <>
          <line x1={hx} y1={pt} x2={hx} y2={pt + chartH} stroke="white" strokeWidth="1" strokeDasharray="3 2" opacity="0.15" />
          {visible.has('income')   && <circle cx={hx} cy={inc.ys[hi]} r="3.5" fill="#a3e635"          stroke="#0d120d" strokeWidth="2" />}
          {visible.has('passive')  && <circle cx={hx} cy={pas.ys[hi]} r="3"   fill="rgb(34 211 238)"  stroke="#0d120d" strokeWidth="2" />}
          {visible.has('expenses') && <circle cx={hx} cy={exp.ys[hi]} r="3.5" fill="rgb(251 113 133)" stroke="#0d120d" strokeWidth="2" />}
          {visible.has('balance')  && <circle cx={hx} cy={bal.ys[hi]} r="3.5" fill="rgb(96 165 250)"  stroke="#0d120d" strokeWidth="2" />}
        </>}
        {points.map((p, i) => {
          if (i % step !== 0) return null
          return (
            <text key={p.month} x={toX(i)} y={H - 3} textAnchor="middle" fontSize="8" fill="rgb(82 82 91)">
              {MONTH_LABELS[parseInt(p.month.slice(5,7))-1]}{p.month.slice(2,4)}
            </text>
          )
        })}
      </svg>
      {/* Legend with toggles */}
      <div className="flex gap-2 mt-1 px-1 flex-wrap">
        {TREND_SERIES.map(s => {
          const on = visible.has(s.key)
          return (
            <button key={s.key} onClick={() => toggle(s.key)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-all border ${
                on ? 'border-white/[0.06] bg-white/[0.03]' : 'border-transparent opacity-40'
              }`}>
              <svg width="16" height="8">
                <line x1="0" y1="4" x2="16" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 2' : undefined} />
              </svg>
              <span className="text-[9px]" style={{ color: on ? s.color : 'rgb(113 113 122)' }}>{s.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── subcategory panel (L2) ────────────────────────────────────────────────────

function SubcategoryPanel({ rows, catName, total, selected, onSelect, fmt }: {
  rows: { name: string; amount: number; count: number }[]
  catName: string; total: number
  selected: string | null; onSelect: (s: string | null) => void
  fmt: (crc: number) => string
}) {
  const max = rows[0]?.amount ?? 1
  return (
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#a3e635]/[0.10] flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-300">{catName} <span className="text-zinc-600 font-normal ml-1">{fmt(total)}</span></p>
        {selected && <button onClick={() => onSelect(null)} className="text-xs text-zinc-600 hover:text-zinc-400">✕ limpiar</button>}
      </div>
      <div className="p-2">
        {rows.map(({ name, amount, count }) => {
          const pct = Math.round((amount / max) * 100)
          const sharePct = total > 0 ? Math.round((amount / total) * 100) : 0
          const active = selected === name
          return (
            <button key={name} onClick={() => onSelect(active ? null : name)}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-colors ${active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={`truncate max-w-[55%] ${active ? 'text-zinc-100' : 'text-zinc-300'}`}>{name}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-zinc-600">{count} tx</span>
                  <span className="text-zinc-400 tabular-nums">{fmt(amount)}</span>
                  <span className={`w-8 text-right tabular-nums ${active ? 'text-blue-400' : 'text-zinc-500'}`}>{sharePct}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${active ? 'bg-blue-400/80' : 'bg-zinc-500/40'}`} style={{ width: `${pct}%` }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── category bar chart (L1) ───────────────────────────────────────────────────

const TAB_COLORS = {
  gastos:   { bar: 'bg-rose-500/50',  active: 'bg-rose-400',  bg: 'bg-rose-500/10',  border: 'border-rose-500/30',  text: 'text-rose-400'  },
  ingresos: { bar: 'bg-[#a3e635]/40', active: 'bg-[#a3e635]', bg: 'bg-[#a3e635]/10', border: 'border-[#a3e635]/30', text: 'text-[#a3e635]' },
}

function CategoryBar({ cats, tab, selected, onSelect, fmt }: {
  cats: { category: string; amount: number; count: number }[]
  tab: TabKey; selected: string | null; onSelect: (c: string | null) => void
  fmt: (crc: number) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const max = cats[0]?.amount ?? 1
  const total = cats.reduce((s, c) => s + c.amount, 0)
  const col = TAB_COLORS[tab]

  // Show categories that are ≥2% of total; collapse the rest unless expanded
  const THRESHOLD = 2
  const visible = cats.filter(c => total > 0 && (c.amount / total) * 100 >= THRESHOLD)
  const hidden  = cats.filter(c => total > 0 && (c.amount / total) * 100 < THRESHOLD)
  const displayed = expanded ? cats : visible

  return (
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#a3e635]/[0.10] flex items-center justify-between">
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Categorías</p>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold tabular-nums ${col.text}`}>{fmt(total)}</span>
          {selected && <button onClick={() => onSelect(null)} className="text-xs text-zinc-600 hover:text-zinc-400">Ver todas</button>}
        </div>
      </div>
      <div className="p-2">
        {displayed.map(({ category, amount, count }) => {
          const pct = Math.round((amount / max) * 100)
          const sharePct = total > 0 ? Math.round((amount / total) * 100) : 0
          const active = selected === category
          return (
            <button key={category} onClick={() => onSelect(active ? null : category)}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-0.5 border transition-all ${active ? `${col.bg} ${col.border}` : 'border-transparent hover:bg-white/[0.03]'}`}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={`font-medium truncate max-w-[55%] ${active ? 'text-white' : 'text-zinc-300'}`}>{category}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-zinc-600 tabular-nums">{count} tx</span>
                  <span className={`font-medium tabular-nums ${active ? col.text : 'text-zinc-400'}`}>{fmt(amount)}</span>
                  <span className={`w-8 text-right tabular-nums ${active ? col.text : 'text-zinc-600'}`}>{sharePct}%</span>
                </div>
              </div>
              <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${active ? col.active : col.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </button>
          )
        })}
        {cats.length === 0 && <p className="text-center text-xs text-zinc-600 py-6">Sin movimientos</p>}
        {hidden.length > 0 && (
          <button onClick={() => setExpanded(e => !e)}
            className="w-full mt-1 py-2 text-[10px] font-semibold text-zinc-600 hover:text-zinc-400 transition-colors">
            {expanded
              ? '▲ Mostrar menos'
              : `▼ ${hidden.length} categoría${hidden.length > 1 ? 's' : ''} con <${THRESHOLD}% — ver más`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── edit modal ────────────────────────────────────────────────────────────────

function EditTransactionModal({ tx, categories, onClose }: {
  tx: TxClient; categories: Category[]; onClose: () => void
}) {
  const [date, setDate]               = useState(tx.date ?? '')
  const [amount, setAmount]           = useState(String(tx.amount ?? ''))
  const [vendor, setVendor]           = useState(tx.vendor ?? '')
  const [concept, setConcept]         = useState(tx.concept ?? '')
  const [categoryCode, setCategoryCode] = useState(tx.category_code ?? '')
  const [expenseGroup, setExpenseGroup] = useState(tx.expense_group ?? 'personal')
  const [notes, setNotes]             = useState(tx.notes ?? '')
  const [isPassive, setIsPassive]     = useState(tx.is_passive_income ?? false)
  const [isSettlement, setIsSettlement] = useState(tx.is_settlement ?? false)
  const [isSurvival, setIsSurvival]   = useState(tx.is_survival_expense ?? false)
  const [error, setError]             = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  // Envelope linkage
  type Envelope = { id: string; name: string; custodio: string | null }
  const [envelopes, setEnvelopes]           = useState<Envelope[]>([])
  const [envelopeId, setEnvelopeId]         = useState('')
  const [initialEnvelopeId, setInitialEnvelopeId] = useState('')
  const [envelopesReady, setEnvelopesReady] = useState(false)

  useEffect(() => {
    Promise.all([getLeafEnvelopes(), getTransactionEnvelopeLink(tx.id)]).then(([envs, link]) => {
      setEnvelopes(envs)
      const cur = link?.envelope_id ?? ''
      setEnvelopeId(cur)
      setInitialEnvelopeId(cur)
      setEnvelopesReady(true)
    })
  }, [tx.id])

  useEffect(() => {
    if (!categoryCode) return
    const cat = categories.find(c => c.code === categoryCode)
    if (!cat) return
    if (cat.group_gasto && cat.group_gasto !== 'na') setExpenseGroup(cat.group_gasto)
    setIsPassive(cat.is_passive_income)
    setIsSettlement(cat.is_settlement)
    setIsSurvival(cat.is_survival_expense)
  }, [categoryCode, categories])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Monto inválido'); return }
    startTransition(async () => {
      const result = await updateTransaction(tx.id, {
        date: date || undefined,
        amount: amt,
        vendor: vendor.trim() || null,
        concept: concept.trim() || null,
        category_code: categoryCode || null,
        expense_group: expenseGroup,
        notes: notes.trim() || null,
        is_passive_income: isPassive,
        is_settlement: isSettlement,
        is_survival_expense: isSurvival,
      } satisfies UpdateTransactionInput)
      if (result?.error) { setError(result.error); return }

      // Update envelope linkage only if it changed
      if (envelopeId !== initialEnvelopeId) {
        const envResult = await updateTransactionEnvelopeLink(
          tx.id, envelopeId || null, date, amt,
          concept.trim() || null, vendor.trim() || null,
        )
        if (envResult?.error) { setError(envResult.error); return }
        setInitialEnvelopeId(envelopeId)
      }

      onClose()
    })
  }

  const isExpense = tx.movement_type !== 'income'
  const typeFilter = tx.movement_type === 'income' ? 'income' : 'expense'
  const parents  = categories.filter(c => !c.parent_code && c.category_type === typeFilter)
  const children = categories.filter(c =>  c.parent_code && c.category_type === typeFilter)

  const inputCls = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40'
  const lbl = 'block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1'

  const envChanged  = envelopeId !== initialEnvelopeId
  const envAdded    = envChanged && !!envelopeId && !initialEnvelopeId
  const envRemoved  = envChanged && !envelopeId && !!initialEnvelopeId
  const envSwapped  = envChanged && !!envelopeId && !!initialEnvelopeId
  const currentEnv  = envelopes.find(e => e.id === envelopeId)
  const initialEnv  = envelopes.find(e => e.id === initialEnvelopeId)

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-[#0d120d] border border-[#a3e635]/[0.12] rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Editar transacción</p>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className={lbl}>Monto (₡ CRC)</label>
              <input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{tx.movement_type === 'income' ? 'Fuente / Pagador' : 'Comercio / Vendor'}</label>
              <input type="text" value={vendor} onChange={e => setVendor(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={lbl}>Concepto</label>
              <input type="text" value={concept} onChange={e => setConcept(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={lbl}>Categoría</label>
            <select value={categoryCode} onChange={e => setCategoryCode(e.target.value)} className={inputCls}>
              <option value="">Sin categoría</option>
              {parents.map(p => {
                const kids = children.filter(c => c.parent_code === p.code)
                return kids.length > 0 ? (
                  <optgroup key={p.code} label={p.name}>
                    {kids.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </optgroup>
                ) : (
                  <option key={p.code} value={p.code}>{p.name}</option>
                )
              })}
            </select>
          </div>
          {tx.movement_type !== 'income' && !categoryCode && (
            <div>
              <label className={lbl}>Grupo de gasto</label>
              <select value={expenseGroup} onChange={e => setExpenseGroup(e.target.value)} className={inputCls}>
                <option value="personal">Personal / Discrecional</option>
                <option value="necesario">Necesario / Esencial</option>
                <option value="objetivos_financieros">Ahorro / Inversión</option>
                <option value="na">Sin categoría</option>
              </select>
            </div>
          )}

          {/* Envelope section — expenses only */}
          {isExpense && envelopesReady && envelopes.length > 0 && (
            <div>
              <label className={lbl}>
                Débito de sobre
                <span className="text-zinc-700 normal-case tracking-normal ml-1">(opcional)</span>
              </label>
              <select value={envelopeId} onChange={e => setEnvelopeId(e.target.value)} className={inputCls}>
                <option value="">Sin afectación de sobre</option>
                {envelopes.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.custodio ? `${e.custodio} › ${e.name}` : e.name}
                  </option>
                ))}
              </select>
              {/* Status indicators */}
              {!envChanged && initialEnvelopeId && initialEnv && (
                <p className="text-[9px] text-amber-400/80 mt-1">
                  ⚡ Actualmente debita &quot;{initialEnv.custodio ? `${initialEnv.custodio} › ` : ''}{initialEnv.name}&quot;
                </p>
              )}
              {!envChanged && !initialEnvelopeId && (
                <p className="text-[9px] text-zinc-600 mt-1">Sin afectación de sobre</p>
              )}
              {envAdded && currentEnv && (
                <p className="text-[9px] text-[#a3e635]/80 mt-1">
                  + Agrega retiro de &quot;{currentEnv.custodio ? `${currentEnv.custodio} › ` : ''}{currentEnv.name}&quot;
                </p>
              )}
              {envRemoved && initialEnv && (
                <p className="text-[9px] text-rose-400/80 mt-1">
                  − Elimina retiro de &quot;{initialEnv.custodio ? `${initialEnv.custodio} › ` : ''}{initialEnv.name}&quot;
                </p>
              )}
              {envSwapped && currentEnv && initialEnv && (
                <p className="text-[9px] text-cyan-400/80 mt-1">
                  ↔ Cambia de &quot;{initialEnv.name}&quot; a &quot;{currentEnv.name}&quot;
                </p>
              )}
            </div>
          )}

          <div>
            <label className={lbl}>Notas <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Nota libre…" className={inputCls} />
          </div>
          {error && <p className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose}
              className="py-3 rounded-xl bg-white/[0.06] border border-white/[0.10] text-white text-sm font-black hover:bg-white/[0.10] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="py-3 rounded-xl bg-[#a3e635] text-black text-sm font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors">
              {isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── transaction table (L3) ────────────────────────────────────────────────────

type TxSortKey = 'date' | 'amount' | 'vendor' | 'category' | 'created_at'

function TxTable({ rows, title, vMap, cMap, currency, tcSell, categories }: {
  rows: TxClient[]; title: string; vMap: CatMap; cMap: CatMap
  currency: 'CRC' | 'USD'; tcSell: number; categories: Category[]
}) {
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState<TxSortKey>('date')
  const [sortAsc, setSortAsc]       = useState(false)
  const [editingTx, setEditingTx]   = useState<TxClient | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)  // tx.id being confirmed
  const [delPending, startDelTrans] = useTransition()

  function cycleSort(key: TxSortKey) {
    if (sortKey === key) { setSortAsc(a => !a) } else { setSortKey(key); setSortAsc(false) }
  }

  function handleDelete(id: string) {
    startDelTrans(async () => {
      await deleteTransaction(id)
      setConfirmDel(null)
    })
  }

  const getCat = (tx: TxClient) => displayCategory(resolveCategory(tx, vMap, cMap))
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const base = !q ? rows : rows.filter(tx =>
      tx.vendor?.toLowerCase().includes(q) ||
      tx.concept?.toLowerCase().includes(q) ||
      getCat(tx).toLowerCase().includes(q)
    )
    return [...base].sort((a, b) => {
      let va: string | number = 0, vb: string | number = 0
      if (sortKey === 'date')       { va = a.date ?? ''; vb = b.date ?? '' }
      if (sortKey === 'amount')     { va = Number(a.amount ?? 0); vb = Number(b.amount ?? 0) }
      if (sortKey === 'vendor')     { va = (a.vendor ?? '').toLowerCase(); vb = (b.vendor ?? '').toLowerCase() }
      if (sortKey === 'category')   { va = getCat(a).toLowerCase(); vb = getCat(b).toLowerCase() }
      if (sortKey === 'created_at') { va = a.created_at ?? ''; vb = b.created_at ?? '' }
      if (va < vb) return sortAsc ? -1 : 1
      if (va > vb) return sortAsc ? 1 : -1
      return 0
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, sortKey, sortAsc])

  function fmtTx(crc: number) {
    if (currency === 'USD') {
      const usd = crc / tcSell
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(usd)
    }
    return fmtCRC(crc)
  }

  return (
    <>
    {editingTx && (
      <EditTransactionModal tx={editingTx} categories={categories} onClose={() => setEditingTx(null)} />
    )}
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#a3e635]/[0.10] flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-zinc-300">{title} <span className="text-zinc-600 font-normal">({filtered.length})</span></h3>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
          className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none w-full sm:w-40" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-white/[0.04]">
              {([
                { label: 'Fecha',      key: 'date',       cls: '' },
                { label: 'Descripción',key: 'vendor',     cls: '' },
                { label: 'Concepto',   key: null,         cls: '' },
                { label: 'Tipo',       key: 'category',   cls: '' },
                { label: 'Grupo',      key: null,         cls: 'hidden lg:table-cell' },
                { label: 'Monto',      key: 'amount',     cls: 'text-right' },
                { label: 'Ingresado',  key: 'created_at', cls: 'hidden md:table-cell' },
                { label: '',           key: null,         cls: '' },
              ] as { label: string; key: TxSortKey | null; cls: string }[]).map(({ label, key, cls }, i) => (
                <th key={i}
                  onClick={key ? () => cycleSort(key) : undefined}
                  className={`px-4 py-2.5 text-left text-[9px] text-zinc-500 uppercase tracking-wider font-black whitespace-nowrap ${cls} ${key ? 'cursor-pointer hover:text-zinc-300 select-none transition-colors' : ''}`}>
                  {label}
                  {key && sortKey === key && <span className="ml-1 opacity-60">{sortAsc ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {filtered.slice(0, 300).map((tx) => {
              const badge = TYPE_BADGE[tx.movement_type ?? '']
              const color = AMT_COLOR[tx.movement_type ?? ''] ?? 'text-zinc-400'
              const sign  = tx.movement_type === 'expense' ? '−' : tx.movement_type === 'income' ? '+' : ''
              const isConfirming = confirmDel === tx.id

              const expGrpLabel: Record<string, string> = {
                personal: 'Personal', necesario: 'Necesario', objetivos_financieros: 'Ahorro',
              }
              const expGrpCls: Record<string, string> = {
                personal: 'bg-zinc-500/15 text-zinc-400',
                necesario: 'bg-blue-500/15 text-blue-400',
                objetivos_financieros: 'bg-lime-500/15 text-lime-400',
              }

              const createdAt = tx.created_at
                ? new Date(tx.created_at).toLocaleString('es-CR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '—'

              return (
                <tr key={tx.id} className="hover:bg-white/[0.015] transition-colors group">
                  <td className="px-4 py-2.5 text-zinc-500 tabular-nums whitespace-nowrap">{tx.date ? fmtDate(tx.date) : '—'}</td>
                  <td className="px-4 py-2.5 text-zinc-200 max-w-[160px] truncate">{tx.vendor ?? '—'}</td>
                  <td className="px-4 py-2 max-w-[150px]">
                    <p className="text-zinc-400 truncate">{tx.concept ?? '—'}</p>
                    {tx.notes && <p className="text-[10px] text-zinc-600 truncate italic mt-0.5">{tx.notes}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {badge && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>}
                      {tx.is_settlement && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400">Liquid.</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap hidden lg:table-cell">
                    {tx.expense_group && tx.expense_group !== 'na' && expGrpLabel[tx.expense_group] && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${expGrpCls[tx.expense_group]}`}>
                        {expGrpLabel[tx.expense_group]}
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 font-medium tabular-nums whitespace-nowrap text-right ${color}`}>
                    {sign}{fmtTx(Number(tx.amount))}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600 tabular-nums whitespace-nowrap text-[10px] hidden md:table-cell">{createdAt}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    {isConfirming ? (
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[10px] text-zinc-500 mr-1">¿Eliminar?</span>
                        <button onClick={() => handleDelete(tx.id)} disabled={delPending}
                          className="p-1 rounded text-rose-400 hover:bg-rose-400/10 transition-colors disabled:opacity-50">
                          {delPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        </button>
                        <button onClick={() => setConfirmDel(null)}
                          className="p-1 rounded text-zinc-500 hover:bg-white/[0.05] transition-colors">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingTx(tx)}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition-colors">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => setConfirmDel(tx.id)}
                          className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-400/10 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-600">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    </>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: '5y',  label: '5A' },
  { key: '2y',  label: '2A' },
  { key: 'ytd', label: 'YTD' },
  { key: '1y',  label: '12M' },
  { key: '6m',  label: '6M' },
  { key: '3m',  label: '3M' },
  { key: '1m',  label: '1M' },
  { key: 'mtd', label: 'MTD' },
]

const TABS: { key: TabKey; label: string; color: string }[] = [
  { key: 'gastos',   label: 'Egresos',  color: 'rgb(251 113 133)' },
  { key: 'ingresos', label: 'Ingresos', color: '#a3e635'           },
]

export function InteractiveSection({ transactions, categories, accounts, exchangeRate, defaultCurrency }: {
  transactions: TxClient[]
  categories: Category[]
  accounts?: AccountSummary
  exchangeRate?: ExchangeRate
  defaultCurrency?: 'CRC' | 'USD'
}) {
  const [period, setPeriod]         = useState<PeriodKey>('all')
  const [tab, setTab]               = useState<TabKey>('gastos')
  const [incomeSubtab, setIncomeSub]     = useState<IncomeSubtab>('activo')
  const [egresosSubtab, setEgresosSub]   = useState<EgresosSubtab>('gastos')
  const [selCat, setSelCat]         = useState<string | null>(null)
  const [selSub, setSelSub]         = useState<string | null>(null)
  const [currency, setCurrency]     = useState<'CRC' | 'USD'>(defaultCurrency ?? 'USD')
  const [showTrend, setShowTrend]   = useState(true)
  const [showSankey, setShowSankey] = useState(false)
  const [showDetail, setShowDetail] = useState(true)

  const tcSell = exchangeRate?.sell ?? 515
  const toUSD  = (crc: number) => crc / tcSell
  function fmtAmt(crc: number, compact = true) {
    if (currency === 'USD') {
      const usd = toUSD(crc)
      if (!compact) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(usd)
      if (Math.abs(usd) >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
      if (Math.abs(usd) >= 1_000)     return `$${(usd / 1_000).toFixed(1)}K`
      return `$${Math.round(usd)}`
    }
    if (!compact) return fmtCRC(crc)
    if (Math.abs(crc) >= 1_000_000) return `₡${(crc / 1_000_000).toFixed(1)}M`
    if (Math.abs(crc) >= 1_000)     return `₡${Math.round(crc / 1_000)}K`
    return `₡${Math.round(crc)}`
  }

  function selectTab(t: TabKey)        { setTab(t); setSelCat(null); setSelSub(null) }
  function selectIncomeSub(s: IncomeSubtab)    { setIncomeSub(s); setSelCat(null); setSelSub(null) }
  function selectEgresosSub(s: EgresosSubtab)  { setEgresosSub(s); setSelCat(null); setSelSub(null) }
  function selectCat(c: string | null) { setSelCat(c); setSelSub(null) }

  // AI-classified overrides for MISC transactions (populated asynchronously)
  const [aiCodes, setAiCodes] = useState<Record<string, string>>({})

  // Build learning maps from ALL transactions (full history, not period-filtered)
  const vMap = useMemo(() => buildVendorCatMap(transactions), [transactions])
  const cMap = useMemo(() => buildConceptCatMap(transactions), [transactions])
  const getCat = (tx: TxClient) => {
    const code = resolveCategory(tx, vMap, cMap)
    if (code === 'MISC' && aiCodes[tx.id]) return aiCodes[tx.id]
    return code
  }

  // Classify MISC transactions with Claude Haiku on mount
  useEffect(() => {
    const miscTxs = transactions.filter(tx => resolveCategory(tx, vMap, cMap) === 'MISC')
    if (!miscTxs.length) return
    classifyTransactions(miscTxs.map(tx => ({
      id: tx.id,
      vendor: tx.vendor,
      concept: tx.concept,
      movement_type: tx.movement_type,
      expense_group: tx.expense_group,
    }))).then(result => {
      if (Object.keys(result).length) setAiCodes(prev => ({ ...prev, ...result }))
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions])

  // Period filter — client-side, no page reload
  const cutoff = useMemo(() => periodCutoff(period), [period])
  const periodTxs = useMemo(() =>
    cutoff ? transactions.filter(tx => tx.date && tx.date >= cutoff) : transactions,
  [transactions, cutoff])

  // Tab filter — egresos split into gastos/ahorros/inversiones; ingresos split activo/pasivo
  const tabTxs = useMemo(() => {
    if (tab === 'gastos') {
      if (egresosSubtab === 'gastos')     return periodTxs.filter(isOutflow)
      const savTxs = periodTxs.filter(isSavings)
      if (egresosSubtab === 'inversiones') return savTxs.filter(isInvestment)
      return savTxs.filter(tx => !isInvestment(tx))  // ahorros
    }
    const base = periodTxs.filter(TAB_FILTER['ingresos'])
    return incomeSubtab === 'activo'
      ? base.filter(tx => isLiquidIncome(tx) && !tx.is_passive_income)
      : base.filter(tx => (tx.movement_type === 'income' && !!tx.is_passive_income && !tx.is_settlement) || isPatrimonialIncome(tx))
  }, [periodTxs, tab, egresosSubtab, incomeSubtab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Monthly trend — all series from periodTxs, independent of tab
  const trendPoints = useMemo((): SeriesPoint[] => {
    const inc: Record<string, number> = {}
    const pas: Record<string, number> = {}
    const exp: Record<string, number> = {}
    for (const tx of periodTxs) {
      if (!tx.date) continue
      const k = tx.date.slice(0, 7)
      const amt = Number(tx.amount ?? 0)
      if (isLiquidIncome(tx)) {
        inc[k] = (inc[k] ?? 0) + amt
        if (tx.is_passive_income) pas[k] = (pas[k] ?? 0) + amt
      }
      if (isOutflow(tx)) exp[k] = (exp[k] ?? 0) + amt
    }
    const months = Array.from(new Set([...Object.keys(inc), ...Object.keys(exp)])).sort()
    return months.map(month => {
      const income   = inc[month] ?? 0
      const passive  = pas[month] ?? 0
      const expenses = exp[month] ?? 0
      return { month, income, passive, expenses, balance: income - expenses }
    })
  }, [periodTxs])

  // Resolves L1 display group for category breakdown.
  // getCat returns a code; getGroupLabel maps it to the L1 non-overlapping group.
  const INCOME_GROUPS = new Set(['Ingreso pasivo', 'Valorización', 'Salario y trabajo', 'Otros ingresos'])
  const getDisplayCat = (tx: TxClient) => {
    if (tx.is_settlement) return 'Liquidaciones'
    // Loan payments always → Préstamos, regardless of bucket/category_code
    if (isLoanPayment(tx.vendor, tx.concept, tx.category_code)) return 'Préstamos'
    const group = getGroupLabel(getCat(tx))
    // Expense with income group = data mismatch (wrong category_code in DB) → re-infer from text
    if ((tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal') && INCOME_GROUPS.has(group)) {
      return getGroupLabel(inferCategory(tx.vendor, tx.concept, null))
    }
    return group
  }

  // Normalize concept label for grouping: trim + collapse spaces + title case
  // Groups "préstamo hipotecario" and "Préstamo Hipotecario" together
  function normalizeConcept(s: string): string {
    return s.trim().replace(/\s+/g, ' ')
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  // Category breakdown (L1)
  const cats = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {}
    for (const tx of tabTxs) {
      const cat = getDisplayCat(tx)
      if (!map[cat]) map[cat] = { amount: 0, count: 0 }
      map[cat].amount += Number(tx.amount ?? 0)
      map[cat].count++
    }
    return Object.entries(map).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.amount - a.amount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabTxs])

  // Filtered by selected category
  const catTxs = useMemo(() =>
    selCat ? tabTxs.filter(tx => getDisplayCat(tx) === selCat) : tabTxs,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [tabTxs, selCat])

  // Subcategories (L2) — grouped by normalized concept (case-insensitive)
  const subcats = useMemo(() => {
    const map: Record<string, { amount: number; count: number; display: string }> = {}
    for (const tx of catTxs) {
      const raw = getTxConcept(tx)
      const k = raw.toLowerCase().trim().replace(/\s+/g, ' ')
      const display = normalizeConcept(raw)
      if (!map[k]) map[k] = { amount: 0, count: 0, display }
      map[k].amount += Number(tx.amount ?? 0)
      map[k].count++
    }
    return Object.entries(map).map(([, v]) => ({ name: v.display, ...v })).sort((a, b) => b.amount - a.amount).slice(0, 30)
  }, [catTxs])

  // Final transaction list (L3) — match by normalized concept
  const tableTxs = useMemo(() =>
    selSub ? catTxs.filter(tx => normalizeConcept(getTxConcept(tx)) === selSub) : catTxs,
  [catTxs, selSub])

  const catTotal = selCat
    ? (cats.find(c => c.category === selCat)?.amount ?? 0)
    : cats.reduce((s, c) => s + c.amount, 0)

  const egresosSubtabLabel: Record<EgresosSubtab, string> = { gastos: 'Gastos', ahorros: 'Ahorros', inversiones: 'Inversiones' }
  const tableTitle = selSub || selCat || (tab === 'gastos' ? egresosSubtabLabel[egresosSubtab] : 'Ingresos')

  // KPIs for current period
  const kpis = useMemo(() => {
    let income = 0, passiveIncome = 0, rendimientos = 0, expenses = 0, invested = 0
    for (const tx of periodTxs) {
      const amt = Number(tx.amount ?? 0)
      if (isLiquidIncome(tx)) {
        income += amt
        if (tx.is_passive_income) passiveIncome += amt
      } else if (isPatrimonialIncome(tx)) rendimientos += amt
      else if (isOutflow(tx))       expenses += amt
      else if (isSavings(tx))       invested += amt
    }
    const net = income - expenses
    // Tasa de ahorro FIRE: lo que realmente fue a ahorros/inversión vs ingresos activos
    const savingsRate    = income > 0 ? (invested / income) * 100 : 0
    // Margen neto: lo que sobra después de gastos (puede ser negativo)
    const netMargin      = income > 0 ? (net / income) * 100 : 0
    const coverage       = expenses > 0 ? (passiveIncome / expenses) * 100 : 0
    return { income, passiveIncome, rendimientos, expenses, invested, net, savingsRate, netMargin, coverage }
  }, [periodTxs])

  const now = new Date()
  const monthLabel = now.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }).toUpperCase()
  const savingsRate = Math.round(kpis.savingsRate)

  return (
    <div className="space-y-0">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="pb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <p className="text-[9px] font-black text-[#a3e635]/60 tracking-[0.22em] uppercase mb-1">
              Fire Oracle · {monthLabel}
            </p>
            <p className="text-3xl font-black text-white tracking-tight leading-none">Felipe</p>
          </div>
          {/* Currency toggle */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
              {(['CRC', 'USD'] as const).map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-3 py-1 rounded-md text-[10px] font-black tracking-wider transition-all ${
                    currency === c ? 'bg-[#a3e635] text-black' : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {c === 'CRC' ? '₡ CRC' : '$ USD'}
                </button>
              ))}
            </div>
            {exchangeRate && (
              <p className="text-[9px] text-zinc-600">
                TC ₡{tcSell.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {' · '}{exchangeRate.source} · {exchangeRate.date}
              </p>
            )}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#a3e635]/[0.06] rounded-2xl overflow-hidden border border-[#a3e635]/[0.08]">
          {[
            {
              label: 'Ingresos',
              display: fmtAmt(kpis.income),
              color: 'text-[#a3e635]',
              secondary: currency === 'CRC' ? `$${Math.round(toUSD(kpis.income)).toLocaleString('en-US')}` : null as string | null,
              sub: kpis.rendimientos > 0 ? `+${fmtAmt(kpis.rendimientos)} val. pasiva` : null as string | null,
            },
            {
              label: 'Gastos',
              display: fmtAmt(kpis.expenses),
              color: 'text-rose-400',
              secondary: currency === 'CRC' ? `$${Math.round(toUSD(kpis.expenses)).toLocaleString('en-US')}` : null,
              sub: null,
            },
            {
              label: 'Tasa de ahorro',
              display: `${savingsRate}%`,
              color: savingsRate >= 30 ? 'text-[#a3e635]' : savingsRate >= 20 ? 'text-amber-400' : 'text-rose-400',
              secondary: null,
              sub: kpis.invested > 0 ? `${fmtAmt(kpis.invested)} invertido` : null,
            },
            {
              label: 'Margen neto',
              display: `${Math.round(kpis.netMargin)}%`,
              color: kpis.netMargin >= 30 ? 'text-[#a3e635]' : kpis.netMargin >= 10 ? 'text-amber-400' : 'text-rose-400',
              secondary: kpis.net !== 0 ? fmtAmt(kpis.net) : null as string | null,
              sub: kpis.net >= 0 ? 'sobrante del período' : 'déficit del período',
            },
          ].map(k => (
            <div key={k.label} className="bg-[#0d120d] px-4 py-4 flex flex-col gap-1">
              <p className={`text-2xl font-black tabular-nums leading-none ${k.color}`}>{k.display}</p>
              {k.secondary && <p className="text-[10px] tabular-nums text-zinc-600">{k.secondary}</p>}
              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.16em] mt-0.5">{k.label}</p>
              {k.sub && <p className="text-[9px] text-zinc-600 tabular-nums">{k.sub}</p>}
            </div>
          ))}
        </div>

      </div>

      {/* ── Period tabs — underline style ─────────────────────────────────── */}
      <div className="flex border-b border-[#a3e635]/[0.08] mb-5">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`px-4 py-2.5 text-[10px] font-black tracking-[0.16em] uppercase transition-colors relative ${
              period === p.key ? 'text-[#a3e635]' : 'text-zinc-600 hover:text-zinc-400'
            }`}>
            {p.label}
            {period === p.key && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#a3e635] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Trend chart ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4 overflow-hidden">
        <button onClick={() => setShowTrend(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] text-left">Tendencia mensual</p>
            {showTrend && <p className="text-[9px] text-zinc-600 mt-0.5 text-left">Ingresos, gastos y balance por mes · {trendPoints.length} meses</p>}
          </div>
          <ChevronDown size={14} className={`text-zinc-600 transition-transform ${showTrend ? 'rotate-180' : ''}`} />
        </button>
        {showTrend && (
          <div className="px-4 pb-4">
            {trendPoints.length > 1
              ? <MultiTrendChart points={trendPoints} />
              : <p className="text-center text-xs text-zinc-600 py-6">Sin datos para este período</p>
            }
          </div>
        )}
      </div>

      {/* ── Sankey — income flow ─────────────────────────────────────────── */}
      <div className="mb-4">
        {showSankey
          ? <SankeyDiagram transactions={periodTxs} fmtAmt={(n) => fmtAmt(n)} onCollapse={() => setShowSankey(false)} />
          : (
            <button onClick={() => setShowSankey(true)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.02] transition-colors">
              <div>
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] text-left">Flujo de ingresos</p>
                <p className="text-[9px] text-zinc-600 mt-0.5 text-left">Cómo se distribuyen tus ingresos en el período</p>
              </div>
              <ChevronDown size={14} className="text-zinc-600" />
            </button>
          )
        }
      </div>

      {/* ── Content tabs ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { selectTab(t.key); setShowDetail(true) }}
            className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-[0.14em] uppercase transition-all border ${
              tab === t.key
                ? t.key === 'gastos'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : 'bg-[#a3e635]/10 border-[#a3e635]/30 text-[#a3e635]'
                : 'border-transparent text-zinc-600 hover:text-zinc-400'
            }`}>
            {t.label}
          </button>
        ))}
        <button onClick={() => setShowDetail(v => !v)}
          className="ml-auto flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.03] transition-colors">
          <span className="text-[9px] font-black uppercase tracking-wider">{showDetail ? 'Ocultar' : 'Ver detalle'}</span>
          <ChevronDown size={12} className={`transition-transform ${showDetail ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showDetail && (<>
        {/* ── Egresos subtabs ──────────────────────────────────────────────── */}
        {tab === 'gastos' && (
          <div className="flex gap-1 mb-4 ml-1">
            {([
              { key: 'gastos'     as EgresosSubtab, label: 'Gastos',     desc: 'Consumo · compras · servicios' },
              { key: 'ahorros'    as EgresosSubtab, label: 'Ahorros',    desc: 'Pensión · fondo emergencia' },
              { key: 'inversiones' as EgresosSubtab, label: 'Inversiones', desc: 'Fondos · acciones · crypto' },
            ]).map(s => (
              <button key={s.key} onClick={() => selectEgresosSub(s.key)}
                className={`flex flex-col px-4 py-2 rounded-xl text-left transition-all border ${
                  egresosSubtab === s.key
                    ? 'bg-rose-500/10 border-rose-500/30'
                    : 'border-transparent hover:bg-white/[0.03]'
                }`}>
                <span className={`text-[10px] font-black tracking-[0.12em] uppercase ${egresosSubtab === s.key ? 'text-rose-400' : 'text-zinc-500'}`}>{s.label}</span>
                <span className="text-[9px] text-zinc-600 mt-0.5 hidden sm:block">{s.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Income subtabs — only visible when Ingresos is active ─────────── */}
        {tab === 'ingresos' && (
          <div className="flex gap-1 mb-4 ml-1">
            {([
              { key: 'activo' as IncomeSubtab, label: 'Activo', desc: 'Salario · freelance · trabajo' },
              { key: 'pasivo' as IncomeSubtab, label: 'Pasivo',  desc: 'Alquiler · rendimientos · crypto' },
            ]).map(s => (
              <button key={s.key} onClick={() => selectIncomeSub(s.key)}
                className={`flex flex-col px-4 py-2 rounded-xl text-left transition-all border ${
                  incomeSubtab === s.key
                    ? 'bg-[#a3e635]/10 border-[#a3e635]/30'
                    : 'border-transparent hover:bg-white/[0.03]'
                }`}>
                <span className={`text-[10px] font-black tracking-[0.12em] uppercase ${incomeSubtab === s.key ? 'text-[#a3e635]' : 'text-zinc-500'}`}>{s.label}</span>
                <span className="text-[9px] text-zinc-600 mt-0.5 hidden sm:block">{s.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* L1 + L2 side by side on desktop */}
        <div className="flex gap-4 items-start">
          <div className={selCat ? 'w-full md:w-1/2 shrink-0' : 'w-full'}>
            <CategoryBar cats={cats} tab={tab} selected={selCat} onSelect={selectCat} fmt={fmtAmt} />
          </div>
          {selCat && (
            <div className="hidden md:block flex-1 min-w-0">
              <SubcategoryPanel rows={subcats} catName={selCat} total={catTotal} selected={selSub} onSelect={setSelSub} fmt={fmtAmt} />
            </div>
          )}
        </div>

        {/* L2 mobile — below L1 */}
        {selCat && (
          <div className="md:hidden">
            <SubcategoryPanel rows={subcats} catName={selCat} total={catTotal} selected={selSub} onSelect={setSelSub} fmt={fmtAmt} />
          </div>
        )}

        {/* L3 — full width */}
        <TxTable rows={tableTxs} title={tableTitle} vMap={vMap} cMap={cMap} currency={currency} tcSell={tcSell} categories={categories} />
      </>)}
    </div>
  )
}
