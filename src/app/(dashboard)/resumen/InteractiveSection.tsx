'use client'

import { useState, useMemo } from 'react'
import { inferCategory, displayCategory, SAVINGS_EXPENSE_GROUP, isLoanPayment } from './categoryUtils'
import { MetricChart, MonthPoint } from './MetricChart'

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

export interface InteractiveSectionProps {
  transactions: TxClient[]
}

type TabKey = 'gastos' | 'ingresos' | 'objetivos'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: '2-digit' })
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  income:          { label: 'Ingreso',  cls: 'bg-emerald-500/10 text-emerald-400' },
  expense:         { label: 'Gasto',    cls: 'bg-rose-500/10 text-rose-400' },
  cash_withdrawal: { label: 'Efectivo', cls: 'bg-amber-500/10 text-amber-400' },
}
const AMT_COLOR: Record<string, string> = {
  income: 'text-emerald-400', expense: 'text-rose-400', cash_withdrawal: 'text-amber-400',
}

// ── vendor learning ───────────────────────────────────────────────────────────
// Builds a map of normalized vendor → category from transactions that already
// have a category_code. This lets the system learn per-user vendor patterns:
// if "XYZ" is categorized 15 times as FOOD_SUPER, transactions from "XYZ"
// with null category_code will inherit that classification automatically.

type VendorCatMap = Record<string, string>  // vendor_normalized → category_code

function buildVendorCatMap(transactions: TxClient[]): VendorCatMap {
  // Count votes: vendor → { category_code → count }
  const votes: Record<string, Record<string, number>> = {}
  for (const tx of transactions) {
    if (!tx.category_code || !tx.vendor) continue
    const key = tx.vendor.toLowerCase().trim()
    if (!key || key === 'na') continue
    if (!votes[key]) votes[key] = {}
    votes[key][tx.category_code] = (votes[key][tx.category_code] ?? 0) + 1
  }
  // Pick the most-voted category per vendor (majority wins)
  const map: VendorCatMap = {}
  for (const [vendor, counts] of Object.entries(votes)) {
    const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (winner) map[vendor] = winner[0]
  }
  return map
}

// Also learn concept → category from transactions where concept is the only
// identifier (vendor is null/na). Less reliable, so only use when vendor unknown.
function buildConceptCatMap(transactions: TxClient[]): VendorCatMap {
  const votes: Record<string, Record<string, number>> = {}
  for (const tx of transactions) {
    if (!tx.category_code || !tx.concept) continue
    const vendor = (tx.vendor ?? '').toLowerCase().trim()
    if (vendor && vendor !== 'na') continue  // only for vendor-less rows
    const key = tx.concept.toLowerCase().trim()
    if (!key) continue
    if (!votes[key]) votes[key] = {}
    votes[key][tx.category_code] = (votes[key][tx.category_code] ?? 0) + 1
  }
  const map: VendorCatMap = {}
  for (const [concept, counts] of Object.entries(votes)) {
    const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (winner && winner[1] >= 2) map[concept] = winner[0]  // min 2 occurrences
  }
  return map
}

// Resolve category using: explicit code → vendor map → concept map → regex inference
function resolveCategory(
  tx: TxClient,
  vendorMap: VendorCatMap,
  conceptMap: VendorCatMap,
): string {
  if (tx.category_code) return displayCategory(tx.category_code)

  const vKey = (tx.vendor ?? '').toLowerCase().trim()
  if (vKey && vKey !== 'na' && vendorMap[vKey]) return displayCategory(vendorMap[vKey])

  const cKey = (tx.concept ?? '').toLowerCase().trim()
  if (cKey && (!vKey || vKey === 'na') && conceptMap[cKey]) return displayCategory(conceptMap[cKey])

  return displayCategory(inferCategory(tx.vendor, tx.concept, tx.category_code))
}

// ── classifiers ───────────────────────────────────────────────────────────────

function isLiquidityOutflow(tx: TxClient): boolean {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (tx.expense_group !== SAVINGS_EXPENSE_GROUP) return true
  return isLoanPayment(tx.vendor, tx.concept, tx.category_code)
}

function isLiquidityInflow(tx: TxClient): boolean {
  return tx.movement_type === 'income' && !tx.is_settlement
}

function isSavingsOrInvestment(tx: TxClient): boolean {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (tx.expense_group !== SAVINGS_EXPENSE_GROUP) return false
  return !isLoanPayment(tx.vendor, tx.concept, tx.category_code)
}

function isCryptoValuation(tx: TxClient): boolean {
  // movement_type=null entries are non-cash accounting entries (unrealized gains/losses)
  if (tx.movement_type !== null) return false
  const c = (tx.concept ?? '').toLowerCase()
  return /p[eé]rdida\s*valor|aumento\s*valor|valorizaci[oó]n|rendimiento\s*fondo/i.test(c)
}

const TAB_FILTER: Record<TabKey, (tx: TxClient) => boolean> = {
  gastos:    isLiquidityOutflow,
  ingresos:  isLiquidityInflow,
  // Objetivos: savings deposits, settlements, AND crypto valuations (they're bucket movements)
  objetivos: (tx) => isSavingsOrInvestment(tx)
    || (tx.movement_type === 'income' && tx.is_settlement)
    || isCryptoValuation(tx),
}

function getTxSubcategory(tx: TxClient): string {
  return tx.vendor?.trim() || tx.concept?.trim() || '—'
}

// ── transaction table ─────────────────────────────────────────────────────────

type SortKey = 'date' | 'vendor' | 'category' | 'amount'
type SortDir = 'asc' | 'desc'

function TransactionsTable({
  rows,
  title,
  vendorMap,
  conceptMap,
}: {
  rows: TxClient[]
  title: string
  vendorMap: VendorCatMap
  conceptMap: VendorCatMap
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const getCat = (tx: TxClient) => resolveCategory(tx, vendorMap, conceptMap)

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

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'date')     cmp = (a.date ?? '').localeCompare(b.date ?? '')
    if (sortKey === 'vendor')   cmp = getTxSubcategory(a).localeCompare(getTxSubcategory(b))
    if (sortKey === 'category') cmp = getCat(a).localeCompare(getCat(b))
    if (sortKey === 'amount')   cmp = Number(a.amount) - Number(b.amount)
    return sortDir === 'asc' ? cmp : -cmp
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtered, sortKey, sortDir])

  const SortArrow = ({ col }: { col: SortKey }) => (
    <span className={`ml-1 ${sortKey === col ? 'opacity-100' : 'opacity-25'}`}>
      {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-zinc-300 tracking-tight">
          {title} <span className="text-zinc-600 font-normal">({sorted.length})</span>
        </h3>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-white/[0.14] w-full sm:w-40"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="border-b border-white/[0.04]">
              {([['date','Fecha'],['vendor','Descripción'],['category','Categoría'],['','Tipo'],['amount','Monto']] as [SortKey|'',string][]).map(([k, label]) => (
                <th key={label}
                  onClick={() => k && toggleSort(k as SortKey)}
                  className={`px-4 py-2.5 text-left text-zinc-500 uppercase tracking-wider whitespace-nowrap font-semibold select-none ${k ? 'cursor-pointer hover:text-zinc-300 transition-colors' : ''}`}
                >
                  {label}{k && <SortArrow col={k as SortKey} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {sorted.slice(0, 300).map((tx, i) => {
              const badge = TYPE_BADGE[tx.movement_type ?? '']
              const color = AMT_COLOR[tx.movement_type ?? ''] ?? 'text-zinc-400'
              const sign  = tx.movement_type === 'expense' ? '−' : tx.movement_type === 'income' ? '+' : ''
              const isPassive = tx.is_passive_income
              return (
                <tr key={i} className="hover:bg-white/[0.015] transition-colors">
                  <td className="px-4 py-2.5 text-zinc-500 tabular-nums whitespace-nowrap">{tx.date ? fmtDate(tx.date) : '—'}</td>
                  <td className="px-4 py-2.5 max-w-[180px]">
                    <p className="text-zinc-200 truncate">{tx.vendor ?? tx.concept ?? '—'}</p>
                    {tx.vendor && tx.concept && tx.concept !== tx.vendor && (
                      <p className="text-zinc-600 truncate">{tx.concept}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{getCat(tx)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex flex-col gap-0.5">
                      {badge && <span className={`px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>{badge.label}</span>}
                      {isPassive && <span className="px-1.5 py-0.5 rounded font-medium bg-violet-500/10 text-violet-400 text-[10px]">Pasivo</span>}
                      {tx.is_settlement && <span className="px-1.5 py-0.5 rounded font-medium bg-zinc-500/10 text-zinc-400 text-[10px]">Liquidación</span>}
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 font-medium tabular-nums whitespace-nowrap text-right ${color}`}>
                    {sign}{fmtCRC(Number(tx.amount))}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-600">Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── subcategory panel ─────────────────────────────────────────────────────────

interface SubRow { name: string; amount: number; count: number }

function SubcategoryPanel({
  rows, catName, total, selectedSub, onSelect,
}: {
  rows: SubRow[]
  catName: string
  total: number
  selectedSub: string | null
  onSelect: (s: string | null) => void
}) {
  const maxAmt = rows[0]?.amount ?? 1
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-300 tracking-tight">
          {catName}
          <span className="text-zinc-600 font-normal ml-2">{fmtCRC(total)}</span>
        </p>
        {selectedSub && (
          <button onClick={() => onSelect(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            ✕ limpiar
          </button>
        )}
      </div>
      <div className="p-2">
        {rows.map(({ name, amount, count }) => {
          const pct = Math.round((amount / maxAmt) * 100)
          const totalPct = total > 0 ? Math.round((amount / total) * 100) : 0
          const isActive = selectedSub === name
          return (
            <button
              key={name}
              onClick={() => onSelect(isActive ? null : name)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors mb-0.5 ${isActive ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={`truncate max-w-[55%] ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>{name}</span>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <span className="text-zinc-600">{count} tx</span>
                  <span className="text-zinc-400 tabular-nums">{fmtCRC(amount)}</span>
                  <span className={`text-xs font-medium w-8 text-right tabular-nums ${isActive ? 'text-blue-400' : 'text-zinc-500'}`}>{totalPct}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isActive ? 'bg-blue-400/80' : 'bg-zinc-500/40'}`} style={{ width: `${pct}%` }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── category bar chart (L1) ───────────────────────────────────────────────────

interface CatRow { category: string; amount: number; count: number; txs: TxClient[]; learnedCount: number }

const TAB_COLORS = {
  gastos:    { bar: 'bg-rose-500/60',    activeBar: 'bg-rose-400',    activeBg: 'bg-rose-500/10',    activeBorder: 'border-rose-500/30',    text: 'text-rose-400' },
  ingresos:  { bar: 'bg-emerald-500/60', activeBar: 'bg-emerald-400', activeBg: 'bg-emerald-500/10', activeBorder: 'border-emerald-500/30', text: 'text-emerald-400' },
  objetivos: { bar: 'bg-violet-500/60',  activeBar: 'bg-violet-400',  activeBg: 'bg-violet-500/10',  activeBorder: 'border-violet-500/30',  text: 'text-violet-400' },
}

function CategoryBarChart({
  cats, tab, selectedCat, onSelect, totalLearned,
}: {
  cats: CatRow[]
  tab: TabKey
  selectedCat: string | null
  onSelect: (c: string | null) => void
  totalLearned: number
}) {
  const maxAmt = cats[0]?.amount ?? 1
  const totalAmt = cats.reduce((s, c) => s + c.amount, 0)
  const colors = TAB_COLORS[tab]

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Categorías</p>
          {totalLearned > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
              {totalLearned} aprendidas
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold tabular-nums ${colors.text}`}>{fmtCRC(totalAmt)}</span>
          {selectedCat && (
            <button onClick={() => onSelect(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
              Ver todas
            </button>
          )}
        </div>
      </div>

      <div className="p-2">
        {cats.map(({ category, amount, count, learnedCount }) => {
          const pct = Math.round((amount / maxAmt) * 100)
          const sharePct = totalAmt > 0 ? Math.round((amount / totalAmt) * 100) : 0
          const isActive = selectedCat === category
          return (
            <button
              key={category}
              onClick={() => onSelect(isActive ? null : category)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all mb-0.5 border ${
                isActive ? `${colors.activeBg} ${colors.activeBorder}` : 'border-transparent hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-1.5 truncate max-w-[55%]">
                  <span className={`font-medium ${isActive ? 'text-white' : 'text-zinc-300'}`}>{category}</span>
                  {learnedCount > 0 && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 shrink-0">aprendida</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <span className="text-zinc-600 tabular-nums">{count} tx</span>
                  <span className={`font-medium tabular-nums ${isActive ? colors.text : 'text-zinc-400'}`}>{fmtCRC(amount)}</span>
                  <span className={`w-8 text-right tabular-nums ${isActive ? colors.text : 'text-zinc-600'}`}>{sharePct}%</span>
                </div>
              </div>
              <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isActive ? colors.activeBar : colors.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </button>
          )
        })}
        {cats.length === 0 && (
          <p className="text-center text-xs text-zinc-600 py-6">Sin movimientos</p>
        )}
      </div>
    </div>
  )
}

// ── main export ───────────────────────────────────────────────────────────────

export function InteractiveSection({ transactions }: InteractiveSectionProps) {
  const [tab, setTab]            = useState<TabKey>('gastos')
  const [selectedCat, setSelCat] = useState<string | null>(null)
  const [selectedSub, setSelSub] = useState<string | null>(null)

  function selectCat(c: string | null) { setSelCat(c); setSelSub(null) }
  function selectTab(t: TabKey)        { setTab(t); setSelCat(null); setSelSub(null) }

  // Build vendor/concept → category maps from the user's own data
  const vendorMap  = useMemo(() => buildVendorCatMap(transactions), [transactions])
  const conceptMap = useMemo(() => buildConceptCatMap(transactions), [transactions])

  const getCat = (tx: TxClient) => resolveCategory(tx, vendorMap, conceptMap)

  // Was this tx categorized via learning (not explicit code or regex)?
  function wasLearned(tx: TxClient): boolean {
    if (tx.category_code) return false
    const vKey = (tx.vendor ?? '').toLowerCase().trim()
    if (vKey && vKey !== 'na' && vendorMap[vKey]) return true
    const cKey = (tx.concept ?? '').toLowerCase().trim()
    if (cKey && (!vKey || vKey === 'na') && conceptMap[cKey]) return true
    return false
  }

  const cats: CatRow[] = useMemo(() => {
    const filter = TAB_FILTER[tab]
    const map: Record<string, CatRow> = {}
    for (const tx of transactions) {
      if (!filter(tx)) continue
      let cat: string
      if (tx.is_settlement) cat = 'Liquidaciones'
      else if (isCryptoValuation(tx)) cat = 'Valorización crypto'
      else cat = getCat(tx)
      if (!map[cat]) map[cat] = { category: cat, amount: 0, count: 0, txs: [], learnedCount: 0 }
      map[cat].amount += Number(tx.amount)
      map[cat].count++
      map[cat].txs.push(tx)
      if (wasLearned(tx)) map[cat].learnedCount++
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, tab, vendorMap, conceptMap])

  const totalLearned = useMemo(
    () => cats.reduce((s, c) => s + c.learnedCount, 0),
    [cats]
  )

  const catTxs: TxClient[] = useMemo(() => {
    if (!selectedCat) return cats.flatMap(c => c.txs)
    return cats.find(c => c.category === selectedCat)?.txs ?? []
  }, [cats, selectedCat])

  const subcats: SubRow[] = useMemo(() => {
    const map: Record<string, SubRow> = {}
    for (const tx of catTxs) {
      const key = getTxSubcategory(tx)
      if (!map[key]) map[key] = { name: key, amount: 0, count: 0 }
      map[key].amount += Number(tx.amount)
      map[key].count++
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount).slice(0, 25)
  }, [catTxs])

  const tableTxs: TxClient[] = useMemo(() => {
    if (!selectedSub) return catTxs
    return catTxs.filter(tx => getTxSubcategory(tx) === selectedSub)
  }, [catTxs, selectedSub])

  const catTotal = useMemo(
    () => selectedCat
      ? (cats.find(c => c.category === selectedCat)?.amount ?? 0)
      : cats.reduce((s, c) => s + c.amount, 0),
    [cats, selectedCat]
  )

  const TAB_LABELS: Record<TabKey, string> = {
    gastos:    'Gastos',
    ingresos:  'Ingresos',
    objetivos: 'Ahorros e Inversiones',
  }

  // ── Monthly trend chart — recomputed whenever tab or selected category changes ──
  // This is what makes the chart stay in sync with the drilldown selection.
  const chartData: MonthPoint[] = useMemo(() => {
    const filter = TAB_FILTER[tab]
    const monthMap: Record<string, { amount: number }> = {}

    for (const tx of transactions) {
      if (!tx.date || !tx.movement_type) continue
      if (!filter(tx)) continue
      // If a category is selected, only include transactions for that category
      if (selectedCat) {
        let cat: string
        if (tx.is_settlement) cat = 'Liquidaciones'
        else if (!tx.movement_type) cat = 'Valorización crypto'
        else cat = getCat(tx)
        if (cat !== selectedCat) continue
      }
      const key = tx.date.slice(0, 7)
      if (!monthMap[key]) monthMap[key] = { amount: 0 }
      monthMap[key].amount += Number(tx.amount ?? 0)
    }

    const sorted = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b))
    let cumulative = 0
    return sorted.map(([month, { amount }]) => {
      cumulative += amount
      const income   = tab === 'ingresos' ? amount : 0
      const expenses = tab === 'gastos'   ? amount : 0
      const net = tab === 'objetivos' ? amount : income - expenses
      return {
        month,
        income,
        expenses,
        net,
        savings_rate: income > 0 ? ((income - expenses) / income) * 100 : 0,
        cumulative,
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, tab, selectedCat, vendorMap, conceptMap])

  const tableTitle = selectedSub || selectedCat || TAB_LABELS[tab]

  return (
    <div className="space-y-4">
      {/* Tab selector */}
      <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 w-fit">
        {(['gastos', 'ingresos', 'objetivos'] as TabKey[]).map(t => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Trend chart — synced with active tab and selected category */}
      <MetricChart data={chartData} defaultMetric={tab === 'ingresos' ? 'income' : tab === 'gastos' ? 'expenses' : 'net'} />

      {/* L1 — category bar chart */}
      <CategoryBarChart
        cats={cats}
        tab={tab}
        selectedCat={selectedCat}
        onSelect={selectCat}
        totalLearned={totalLearned}
      />

      {/* L2 — subcategory breakdown */}
      {selectedCat && (
        <SubcategoryPanel
          rows={subcats}
          catName={selectedCat}
          total={catTotal}
          selectedSub={selectedSub}
          onSelect={setSelSub}
        />
      )}

      {/* L3 — transaction detail */}
      <TransactionsTable rows={tableTxs} title={tableTitle} vendorMap={vendorMap} conceptMap={conceptMap} />
    </div>
  )
}
