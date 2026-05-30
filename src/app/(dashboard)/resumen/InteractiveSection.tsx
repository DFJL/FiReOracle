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

type TabKey    = 'gastos' | 'ingresos' | 'objetivos'
type PeriodKey = 'all' | 'ytd' | '1y' | '3m'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function periodCutoff(p: PeriodKey): string | null {
  const now = new Date()
  if (p === '3m')  { const d = new Date(now); d.setMonth(d.getMonth() - 3);     return d.toISOString().slice(0, 10) }
  if (p === 'ytd') return `${now.getFullYear()}-01-01`
  if (p === '1y')  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) }
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

function resolveCategory(tx: TxClient, vMap: CatMap, cMap: CatMap): string {
  if (tx.category_code) return displayCategory(tx.category_code)
  const vk = (tx.vendor ?? '').toLowerCase().trim()
  if (vk && vk !== 'na' && vMap[vk]) return displayCategory(vMap[vk])
  const ck = (tx.concept ?? '').toLowerCase().trim()
  if (ck && (!vk || vk === 'na') && cMap[ck]) return displayCategory(cMap[ck])
  return displayCategory(inferCategory(tx.vendor, tx.concept, tx.category_code))
}

// ── classifiers ───────────────────────────────────────────────────────────────

function isOutflow(tx: TxClient) {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (tx.expense_group !== SAVINGS_EXPENSE_GROUP) return true
  return isLoanPayment(tx.vendor, tx.concept, tx.category_code)
}

// Ingresos que tocan liquidez (saldo débito): salario, alquiler, misc activo
function isLiquidIncome(tx: TxClient) {
  return tx.movement_type === 'income' && !tx.is_passive_income && !tx.is_settlement
}

// Rendimientos que viven en cuentas de ahorro/inversión — no tocan liquidez
function isPatrimonialIncome(tx: TxClient) {
  return (tx.movement_type === 'income' && !!tx.is_passive_income) ||
         (!tx.movement_type && tx.amount != null && Number(tx.amount) > 0)
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
  objetivos: (tx) => isSavings(tx) || (tx.movement_type === 'income' && !!tx.is_settlement),
}

function getTxConcept(tx: TxClient): string {
  const c = tx.concept?.trim()
  if (c && c.toLowerCase() !== 'na') return c
  return tx.vendor?.trim() || '—'
}

// ── simple SVG trend chart ────────────────────────────────────────────────────

function TrendChart({ points, color }: { points: { month: string; amount: number }[]; color: string }) {
  if (points.length < 2) return null
  const W = 800, H = 120, px = 4, pt = 8, pb = 20
  const vals = points.map(p => p.amount)
  const minV = Math.min(...vals, 0)
  const maxV = Math.max(...vals, 1)
  const range = maxV - minV || 1
  const chartH = H - pt - pb
  const chartW = W - px * 2
  const xs = points.map((_, i) => px + (i / Math.max(points.length - 1, 1)) * chartW)
  const ys = vals.map(v => pt + chartH - ((v - minV) / range) * chartH)

  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`
  for (let i = 1; i < xs.length; i++) {
    const cpX = ((xs[i-1] + xs[i]) / 2).toFixed(1)
    d += ` C${cpX},${ys[i-1].toFixed(1)} ${cpX},${ys[i].toFixed(1)} ${xs[i].toFixed(1)},${ys[i].toFixed(1)}`
  }
  const area = d + ` L${xs[xs.length-1].toFixed(1)},${(pt+chartH).toFixed(1)} L${xs[0].toFixed(1)},${(pt+chartH).toFixed(1)} Z`

  const zeroY = minV < 0 ? pt + chartH - ((0 - minV) / range) * chartH : null

  const step = points.length > 24 ? 3 : points.length > 12 ? 2 : 1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="cursor-crosshair">
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {zeroY !== null && <line x1={px} y1={zeroY} x2={W-px} y2={zeroY} stroke="rgb(113 113 122/0.3)" strokeDasharray="4 3" strokeWidth="1" />}
      <path d={area} fill="url(#tg)" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => {
        if (i % step !== 0) return null
        const mi = parseInt(p.month.slice(5, 7)) - 1
        return (
          <text key={p.month} x={xs[i]} y={H - 3} textAnchor="middle" fontSize="8" fill="rgb(82 82 91)">
            {MONTH_LABELS[mi]}{p.month.slice(2, 4)}
          </text>
        )
      })}
    </svg>
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
  const max = cats[0]?.amount ?? 1
  const total = cats.reduce((s, c) => s + c.amount, 0)
  const col = TAB_COLORS[tab]
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
        {cats.map(({ category, amount, count }) => {
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
  { key: 'ytd', label: 'Este año' },
  { key: '1y',  label: '12 meses' },
  { key: '3m',  label: '3 meses' },
]

const TABS: { key: TabKey; label: string; color: string }[] = [
  { key: 'gastos',    label: 'Gastos',    color: 'rgb(251 113 133)' },
  { key: 'ingresos',  label: 'Ingresos',  color: '#a3e635'           },
  { key: 'objetivos', label: 'Ahorros',   color: 'rgb(251 191 36)'  },
]

export function InteractiveSection({ transactions }: { transactions: TxClient[] }) {
  const [period, setPeriod] = useState<PeriodKey>('all')
  const [tab, setTab]       = useState<TabKey>('gastos')
  const [selCat, setSelCat] = useState<string | null>(null)
  const [selSub, setSelSub] = useState<string | null>(null)

  function selectTab(t: TabKey)       { setTab(t); setSelCat(null); setSelSub(null) }
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

  // Tab filter
  const tabFilter = TAB_FILTER[tab]
  const tabTxs = useMemo(() => periodTxs.filter(tabFilter), [periodTxs, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Monthly trend for current tab+period (no separate metric selector)
  const trendPoints = useMemo(() => {
    const map: Record<string, number> = {}
    for (const tx of tabTxs) {
      if (!tx.date) continue
      const k = tx.date.slice(0, 7)
      map[k] = (map[k] ?? 0) + Number(tx.amount ?? 0)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }))
  }, [tabTxs])

  // Resolves display category, prefixing patrimonial income with ★ to distinguish
  const getDisplayCat = (tx: TxClient) => {
    if (tx.is_settlement) return 'Liquidaciones'
    if (isPatrimonialIncome(tx)) return `★ ${getCat(tx)}`
    return getCat(tx)
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

  // Subcategories (L2) — grouped by concept
  const subcats = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {}
    for (const tx of catTxs) {
      const k = getTxConcept(tx)
      if (!map[k]) map[k] = { amount: 0, count: 0 }
      map[k].amount += Number(tx.amount ?? 0)
      map[k].count++
    }
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount).slice(0, 30)
  }, [catTxs])

  // Final transaction list (L3)
  const tableTxs = useMemo(() =>
    selSub ? catTxs.filter(tx => getTxConcept(tx) === selSub) : catTxs,
  [catTxs, selSub])

  const catTotal = selCat
    ? (cats.find(c => c.category === selCat)?.amount ?? 0)
    : cats.reduce((s, c) => s + c.amount, 0)

  const tabColor = TABS.find(t => t.key === tab)!.color
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
    // Savings rate sobre ingresos activos únicamente
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0
    return { income, rendimientos, expenses, invested, net, savingsRate }
  }, [periodTxs])

  const now = new Date()
  const monthLabel = now.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }).toUpperCase()
  const savingsRate = kpis.income > 0 ? Math.round(((kpis.income - kpis.expenses) / kpis.income) * 100) : 0

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
            { label: 'Ingresos',      value: kpis.income,       fmt: 'K', color: 'text-[#a3e635]' },
            { label: 'Gastos',        value: kpis.expenses,     fmt: 'K', color: 'text-rose-400' },
            { label: 'Ahorro %',      value: savingsRate,       fmt: '%', color: savingsRate >= 20 ? 'text-[#a3e635]' : savingsRate >= 10 ? 'text-amber-400' : 'text-rose-400' },
            { label: 'Rendimientos',  value: kpis.rendimientos, fmt: 'K', color: 'text-blue-400' },
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

      {/* ── Trend chart ───────────────────────────────────────────────────── */}
      {trendPoints.length > 1 && (
        <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-4 mb-4">
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-3">
            Tendencia · {TABS.find(t => t.key === tab)!.label}
            <span className="text-zinc-700 font-normal ml-2">{trendPoints.length} meses</span>
          </p>
          <TrendChart points={trendPoints} color={tabColor} />
        </div>
      )}

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
