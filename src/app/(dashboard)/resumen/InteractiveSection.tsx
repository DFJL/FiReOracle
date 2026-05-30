'use client'

import { useState, useMemo } from 'react'
import { inferCategory, displayCategory, SAVINGS_EXPENSE_GROUP, isLoanPayment } from './categoryUtils'

// ── types ─────────────────────────────────────────────────────────────────────

export interface TxClient {
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

export interface AccountSummary {
  liquidBalance: number   // checking + cash accounts
  savingsBalance: number  // savings + investment accounts
}

type TabKey        = 'gastos' | 'ingresos' | 'objetivos'
type IncomeSubtab  = 'activo' | 'pasivo'
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
    if (!tx.category_code || !tx.vendor) continue
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
    if (!tx.category_code || !tx.concept) continue
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
// Exception: passive income (is_passive_income=true) skips category_code.
// For passive income, category_code reflects the savings bucket destination (SAVINGS, INCOME),
// not the economic nature of the transaction. The concept/vendor is always more informative
// ("Rendimientos Fondo X", "Farming Y", etc.) and is used instead.
function resolveCategory(tx: TxClient, vMap: CatMap, cMap: CatMap): string {
  const ck = (tx.concept ?? '').toLowerCase().trim()
  const vk = (tx.vendor ?? '').toLowerCase().trim()

  // category_code is authoritative except for passive income entries where it
  // records the bucket destination (SAVINGS, INCOME) rather than the economic type.
  // Specific passive income categories (RENTAL_INCOME, INVESTMENT_RETURN, etc.)
  // are always meaningful and should be displayed directly.
  const BUCKET_ONLY_CATS = new Set(['SAVINGS', 'INCOME', 'SAVINGS_INVESTMENT', 'PASSIVE_INCOME'])
  if (tx.category_code && (!tx.is_passive_income || !BUCKET_ONLY_CATS.has(tx.category_code))) {
    return displayCategory(tx.category_code)
  }

  // Concept-level pattern overrides
  if (/^abarrotes/i.test(ck)) return 'Abarrotes'
  if (/^impresion/i.test(ck)) return 'Hogar'

  if (vk && vk !== 'na' && vMap[vk]) return displayCategory(vMap[vk])
  if (ck && (!vk || vk === 'na') && cMap[ck]) return displayCategory(cMap[ck])
  // Pass null as categoryCode for passive income so inferCategory uses concept/vendor only
  return displayCategory(inferCategory(tx.vendor, tx.concept, tx.is_passive_income ? null : tx.category_code))
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
  return !isLoanPayment(tx.vendor, tx.concept, tx.category_code)
}

const TAB_FILTER: Record<TabKey, (tx: TxClient) => boolean> = {
  gastos:    isOutflow,
  ingresos:  (tx) => isLiquidIncome(tx) || isPatrimonialIncome(tx),
  objetivos: (tx) => isSavings(tx) || isPatrimonialLoss(tx) || (tx.movement_type === 'income' && !!tx.is_settlement),
}

function getTxConcept(tx: TxClient): string {
  const c = tx.concept?.trim()
  if (c && c.toLowerCase() !== 'na') return c
  return tx.vendor?.trim() || '—'
}

// ── SVG trend chart — 3 series with hover tooltip ────────────────────────────

interface SeriesPoint { month: string; income: number; expenses: number; balance: number }

function MultiTrendChart({ points }: { points: SeriesPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (points.length < 2) return null
  const W = 800, H = 160, px = 4, pt = 8, pb = 24
  const chartH = H - pt - pb
  const chartW = W - px * 2

  // Shared scale across all series so they're visually comparable
  const allVals = points.flatMap(p => [p.income, p.expenses, p.balance])
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
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#a3e635]/70">Ingresos</span>
                <span className="font-black text-[#a3e635] tabular-nums">{fmt(points[hi].income)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-rose-400/70">Gastos</span>
                <span className="font-black text-rose-400 tabular-nums">{fmt(points[hi].expenses)}</span>
              </div>
              <div className="border-t border-white/[0.06] mt-1 pt-1 flex items-center justify-between gap-4">
                <span className="text-blue-400/70">Balance</span>
                <span className={`font-black tabular-nums ${points[hi].balance >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>{fmt(points[hi].balance)}</span>
              </div>
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
        <path d={inc.d + ` L${inc.xs[inc.xs.length-1].toFixed(1)},${(pt+chartH).toFixed(1)} L${inc.xs[0].toFixed(1)},${(pt+chartH).toFixed(1)} Z`}
          fill="url(#grad-inc)" />
        {/* Lines */}
        <path d={exp.d} fill="none" stroke="rgb(251 113 133)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        <path d={bal.d} fill="none" stroke="rgb(96 165 250)"  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" strokeDasharray="5 3" />
        <path d={inc.d} fill="none" stroke="#a3e635"           strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round" />
        {/* Hover crosshair + dots */}
        {hi !== null && hx !== null && <>
          <line x1={hx} y1={pt} x2={hx} y2={pt + chartH} stroke="white" strokeWidth="1" strokeDasharray="3 2" opacity="0.15" />
          <circle cx={hx} cy={inc.ys[hi]} r="3.5" fill="#a3e635"          stroke="#0d120d" strokeWidth="2" />
          <circle cx={hx} cy={exp.ys[hi]} r="3.5" fill="rgb(251 113 133)" stroke="#0d120d" strokeWidth="2" />
          <circle cx={hx} cy={bal.ys[hi]} r="3.5" fill="rgb(96 165 250)"  stroke="#0d120d" strokeWidth="2" />
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
      {/* Legend */}
      <div className="flex gap-4 mt-1 px-1">
        {[
          { color: '#a3e635',          label: 'Ingresos' },
          { color: 'rgb(251 113 133)', label: 'Gastos' },
          { color: 'rgb(96 165 250)',  label: 'Balance', dashed: true },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 2' : undefined} /></svg>
            <span className="text-[9px] text-zinc-500">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── subcategory panel (L2) ────────────────────────────────────────────────────

function SubcategoryPanel({ rows, catName, total, selected, onSelect }: {
  rows: { name: string; amount: number; count: number }[]
  catName: string; total: number
  selected: string | null; onSelect: (s: string | null) => void
}) {
  const max = rows[0]?.amount ?? 1
  return (
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#a3e635]/[0.10] flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-300">{catName} <span className="text-zinc-600 font-normal ml-1">{fmtCRC(total)}</span></p>
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
                  <span className="text-zinc-400 tabular-nums">{fmtCRC(amount)}</span>
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
  gastos:    { bar: 'bg-rose-500/50',        active: 'bg-rose-400',        bg: 'bg-rose-500/10',        border: 'border-rose-500/30',        text: 'text-rose-400' },
  ingresos:  { bar: 'bg-[#a3e635]/40',       active: 'bg-[#a3e635]',       bg: 'bg-[#a3e635]/10',       border: 'border-[#a3e635]/30',       text: 'text-[#a3e635]' },
  objetivos: { bar: 'bg-amber-400/40',        active: 'bg-amber-400',       bg: 'bg-amber-400/10',       border: 'border-amber-400/30',       text: 'text-amber-400' },
}

function CategoryBar({ cats, tab, selected, onSelect }: {
  cats: { category: string; amount: number; count: number }[]
  tab: TabKey; selected: string | null; onSelect: (c: string | null) => void
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
          <span className={`text-xs font-semibold tabular-nums ${col.text}`}>{fmtCRC(total)}</span>
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
                  <span className={`font-medium tabular-nums ${active ? col.text : 'text-zinc-400'}`}>{fmtCRC(amount)}</span>
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

// ── transaction table (L3) ────────────────────────────────────────────────────

function TxTable({ rows, title, vMap, cMap }: {
  rows: TxClient[]; title: string; vMap: CatMap; cMap: CatMap
}) {
  const [search, setSearch] = useState('')
  const getCat = (tx: TxClient) => resolveCategory(tx, vMap, cMap)
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return rows
    return rows.filter(tx =>
      tx.vendor?.toLowerCase().includes(q) ||
      tx.concept?.toLowerCase().includes(q) ||
      getCat(tx).toLowerCase().includes(q)
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search])

  return (
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#a3e635]/[0.10] flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-zinc-300">{title} <span className="text-zinc-600 font-normal">({filtered.length})</span></h3>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
          className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none w-full sm:w-40" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[440px]">
          <thead>
            <tr className="border-b border-white/[0.04]">
              {['Fecha','Descripción','Concepto','Categoría','Monto'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-zinc-500 uppercase tracking-wider font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {filtered.slice(0, 300).map((tx, i) => {
              const badge = TYPE_BADGE[tx.movement_type ?? '']
              const color = AMT_COLOR[tx.movement_type ?? ''] ?? 'text-zinc-400'
              const sign  = tx.movement_type === 'expense' ? '−' : tx.movement_type === 'income' ? '+' : ''
              return (
                <tr key={i} className="hover:bg-white/[0.015] transition-colors">
                  <td className="px-4 py-2.5 text-zinc-500 tabular-nums whitespace-nowrap">{tx.date ? fmtDate(tx.date) : '—'}</td>
                  <td className="px-4 py-2.5 text-zinc-200 max-w-[160px] truncate">{tx.vendor ?? '—'}</td>
                  <td className="px-4 py-2.5 text-zinc-400 max-w-[140px] truncate">{tx.concept ?? '—'}</td>
                  <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">
                    {badge && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>}
                  </td>
                  <td className={`px-4 py-2.5 font-medium tabular-nums whitespace-nowrap text-right ${color}`}>
                    {sign}{fmtCRC(Number(tx.amount))}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-600">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
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
  { key: 'gastos',    label: 'Gastos',    color: 'rgb(251 113 133)' },
  { key: 'ingresos',  label: 'Ingresos',  color: '#a3e635'           },
  { key: 'objetivos', label: 'Ahorros',   color: 'rgb(251 191 36)'  },
]

export function InteractiveSection({ transactions, accounts }: { transactions: TxClient[]; accounts?: AccountSummary }) {
  const [period, setPeriod]         = useState<PeriodKey>('all')
  const [tab, setTab]               = useState<TabKey>('gastos')
  const [incomeSubtab, setIncomeSub] = useState<IncomeSubtab>('activo')
  const [selCat, setSelCat]         = useState<string | null>(null)
  const [selSub, setSelSub]         = useState<string | null>(null)

  function selectTab(t: TabKey)        { setTab(t); setSelCat(null); setSelSub(null) }
  function selectIncomeSub(s: IncomeSubtab) { setIncomeSub(s); setSelCat(null); setSelSub(null) }
  function selectCat(c: string | null) { setSelCat(c); setSelSub(null) }

  // Build learning maps from ALL transactions (full history, not period-filtered)
  const vMap = useMemo(() => buildVendorCatMap(transactions), [transactions])
  const cMap = useMemo(() => buildConceptCatMap(transactions), [transactions])
  const getCat = (tx: TxClient) => resolveCategory(tx, vMap, cMap)

  // Period filter — client-side, no page reload
  const cutoff = useMemo(() => periodCutoff(period), [period])
  const periodTxs = useMemo(() =>
    cutoff ? transactions.filter(tx => tx.date && tx.date >= cutoff) : transactions,
  [transactions, cutoff])

  // Tab filter — ingresos further split by subtab
  const tabFilter = TAB_FILTER[tab]
  const tabTxs = useMemo(() => {
    const base = periodTxs.filter(tabFilter)
    if (tab !== 'ingresos') return base
    return incomeSubtab === 'activo'
      ? base.filter(tx => isLiquidIncome(tx) && !tx.is_passive_income)
      : base.filter(tx => (tx.movement_type === 'income' && !!tx.is_passive_income && !tx.is_settlement) || isPatrimonialIncome(tx))
  }, [periodTxs, tab, incomeSubtab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Monthly trend — all 3 series from periodTxs, independent of tab
  const trendPoints = useMemo((): SeriesPoint[] => {
    const inc: Record<string, number> = {}
    const exp: Record<string, number> = {}
    for (const tx of periodTxs) {
      if (!tx.date) continue
      const k = tx.date.slice(0, 7)
      const amt = Number(tx.amount ?? 0)
      if (isLiquidIncome(tx)) inc[k] = (inc[k] ?? 0) + amt
      if (isOutflow(tx))      exp[k] = (exp[k] ?? 0) + amt
    }
    const months = Array.from(new Set([...Object.keys(inc), ...Object.keys(exp)])).sort()
    return months.map(month => {
      const income   = inc[month] ?? 0
      const expenses = exp[month] ?? 0
      return { month, income, expenses, balance: income - expenses }
    })
  }, [periodTxs])

  // Resolves display category with overrides for edge cases
  const getDisplayCat = (tx: TxClient) => {
    if (tx.is_settlement) return 'Liquidaciones'
    // Loan payments always → Préstamos, regardless of bucket/category_code
    if (isLoanPayment(tx.vendor, tx.concept, tx.category_code)) return 'Préstamos'
    return getCat(tx)
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

  const tableTitle = selSub || selCat || TABS.find(t => t.key === tab)!.label

  // KPIs for current period
  const kpis = useMemo(() => {
    let income = 0, rendimientos = 0, expenses = 0, invested = 0
    for (const tx of periodTxs) {
      const amt = Number(tx.amount ?? 0)
      if (isLiquidIncome(tx))       income += amt
      else if (isPatrimonialIncome(tx)) rendimientos += amt
      else if (isOutflow(tx))       expenses += amt
      else if (isSavings(tx))       invested += amt
    }
    const net = income - expenses
    // Tasa de ahorro FIRE: lo que realmente fue a ahorros/inversión vs ingresos activos
    const savingsRate = income > 0 ? (invested / income) * 100 : 0
    // Margen neto: lo que sobra después de gastos (puede ser negativo)
    const netMargin   = income > 0 ? (net / income) * 100 : 0
    return { income, rendimientos, expenses, invested, net, savingsRate, netMargin }
  }, [periodTxs])

  const now = new Date()
  const monthLabel = now.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }).toUpperCase()
  const savingsRate = Math.round(kpis.savingsRate)
  const netMargin   = Math.round(kpis.netMargin)

  return (
    <div className="space-y-0">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="pb-5">
        <p className="text-[9px] font-black text-[#a3e635]/60 tracking-[0.22em] uppercase mb-1">
          Fire Oracle · {monthLabel}
        </p>
        <p className="text-3xl font-black text-white tracking-tight leading-none mb-5">Felipe</p>

        {/* KPI row — like the health metrics strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#a3e635]/[0.06] rounded-2xl overflow-hidden border border-[#a3e635]/[0.08]">
          {[
            { label: 'Ingresos',       value: kpis.income,       fmt: 'K', color: 'text-[#a3e635]',  sub: null },
            { label: 'Gastos',         value: kpis.expenses,     fmt: 'K', color: 'text-rose-400',   sub: null },
            { label: 'Valor. pasivo',  value: kpis.rendimientos, fmt: 'K', color: 'text-blue-400',   sub: 'no realizado' },
            { label: 'Tasa ahorro',  value: savingsRate,       fmt: '%',
              color: savingsRate >= 30 ? 'text-[#a3e635]' : savingsRate >= 20 ? 'text-amber-400' : 'text-rose-400',
              sub: `margen ${netMargin >= 0 ? '+' : ''}${netMargin}%` },
          ].map(k => {
            const display = k.fmt === '%'
              ? `${k.value}%`
              : k.value >= 1_000_000
                ? `${(k.value / 1_000_000).toFixed(1)}M`
                : k.value >= 1_000
                  ? `${Math.round(k.value / 1_000)}K`
                  : String(Math.round(k.value))
            return (
              <div key={k.label} className="bg-[#0d120d] px-4 py-4 flex flex-col gap-1.5">
                <p className={`text-2xl font-black tabular-nums leading-none ${k.color}`}>{display}</p>
                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.16em]">{k.label}</p>
                {k.sub && <p className="text-[9px] text-zinc-600 tabular-nums">{k.sub}</p>}
              </div>
            )
          })}
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

      {/* ── Content tabs ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => selectTab(t.key)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-[0.14em] uppercase transition-all border ${
              tab === t.key
                ? t.key === 'gastos'    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : t.key === 'ingresos'  ? 'bg-[#a3e635]/10 border-[#a3e635]/30 text-[#a3e635]'
                :                         'bg-amber-400/10 border-amber-400/30 text-amber-400'
                : 'border-transparent text-zinc-600 hover:text-zinc-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

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

      {/* ── Trend chart ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-4 mb-4">
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-3">
          Tendencia
          <span className="text-zinc-700 font-normal ml-2">{trendPoints.length} meses</span>
        </p>
        {trendPoints.length > 1
          ? <MultiTrendChart points={trendPoints} />
          : <p className="text-center text-xs text-zinc-600 py-6">Sin datos para este período</p>
        }
      </div>

      {/* L1 + L2 side by side on desktop */}
      <div className="flex gap-4 items-start">
        <div className={selCat ? 'w-full md:w-1/2 shrink-0' : 'w-full'}>
          <CategoryBar cats={cats} tab={tab} selected={selCat} onSelect={selectCat} />
        </div>
        {selCat && (
          <div className="hidden md:block flex-1 min-w-0">
            <SubcategoryPanel rows={subcats} catName={selCat} total={catTotal} selected={selSub} onSelect={setSelSub} />
          </div>
        )}
      </div>

      {/* L2 mobile — below L1 */}
      {selCat && (
        <div className="md:hidden">
          <SubcategoryPanel rows={subcats} catName={selCat} total={catTotal} selected={selSub} onSelect={setSelSub} />
        </div>
      )}

      {/* L3 — full width */}
      <TxTable rows={tableTxs} title={tableTitle} vMap={vMap} cMap={cMap} />
    </div>
  )
}
