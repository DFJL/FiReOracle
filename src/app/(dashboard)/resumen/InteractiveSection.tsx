'use client'

import { useState, useMemo } from 'react'

// ── shared types (exported for page.tsx) ──────────────────────────────────────

export interface TxClient {
  date: string | null
  vendor: string | null
  concept: string | null
  category_code: string | null
  movement_type: string | null
  amount: number | null
}

export interface CatSummary {
  category: string
  amount: number
  count: number
}

export interface InteractiveSectionProps {
  incomeCategories: CatSummary[]
  expenseCategories: CatSummary[]
  transactions: TxClient[]
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  income: { label: 'Ingreso', cls: 'bg-emerald-500/10 text-emerald-400' },
  expense: { label: 'Gasto', cls: 'bg-rose-500/10 text-rose-400' },
  cash_withdrawal: { label: 'Efectivo', cls: 'bg-amber-500/10 text-amber-400' },
}

const AMT_COLOR: Record<string, string> = {
  income: 'text-emerald-400',
  expense: 'text-rose-400',
  cash_withdrawal: 'text-amber-400',
}

type SortKey = 'date' | 'vendor' | 'category_code' | 'amount'
type SortDir = 'asc' | 'desc'

// ── transactions table ────────────────────────────────────────────────────────

function TransactionsTable({
  rows,
  title,
}: {
  rows: TxClient[]
  title: string
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return rows
    return rows.filter(
      (tx) =>
        tx.vendor?.toLowerCase().includes(q) ||
        tx.concept?.toLowerCase().includes(q) ||
        tx.category_code?.toLowerCase().includes(q)
    )
  }, [rows, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'date') cmp = (a.date ?? '').localeCompare(b.date ?? '')
      else if (sortKey === 'vendor')
        cmp = (a.vendor ?? a.concept ?? '').localeCompare(b.vendor ?? b.concept ?? '')
      else if (sortKey === 'category_code')
        cmp = (a.category_code ?? '').localeCompare(b.category_code ?? '')
      else if (sortKey === 'amount') cmp = Number(a.amount) - Number(b.amount)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const COLS: { key: SortKey | null; label: string; align?: string }[] = [
    { key: 'date', label: 'Fecha' },
    { key: 'vendor', label: 'Descripción' },
    { key: 'category_code', label: 'Categoría' },
    { key: null, label: 'Tipo' },
    { key: 'amount', label: 'Monto', align: 'text-right' },
  ]

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-200 tracking-tight">
          {title}{' '}
          <span className="text-zinc-600 font-normal text-xs">({sorted.length})</span>
        </h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-white/[0.14] w-44"
        />
      </div>

      <div className="overflow-auto max-h-[480px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#0e0e11] z-10">
            <tr className="border-b border-white/[0.06]">
              {COLS.map(({ key, label, align }) => (
                <th
                  key={label}
                  onClick={() => key && toggleSort(key)}
                  className={`px-5 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap select-none ${
                    key ? 'cursor-pointer hover:text-zinc-300 transition-colors' : ''
                  } ${align ?? ''}`}
                >
                  {label}
                  {key && (
                    <span className="ml-1 opacity-50">
                      {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {sorted.slice(0, 500).map((tx, i) => {
              const badge = TYPE_BADGE[tx.movement_type ?? '']
              const color = AMT_COLOR[tx.movement_type ?? ''] ?? 'text-zinc-400'
              const sign =
                tx.movement_type === 'expense'
                  ? '−'
                  : tx.movement_type === 'income'
                    ? '+'
                    : ''
              return (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                    {tx.date ? fmtDate(tx.date) : '—'}
                  </td>
                  <td className="px-5 py-3 max-w-[200px]">
                    <p className="text-zinc-200 truncate text-sm">
                      {tx.vendor ?? tx.concept ?? '—'}
                    </p>
                    {tx.vendor && tx.concept && tx.concept !== tx.vendor && (
                      <p className="text-xs text-zinc-600 truncate">{tx.concept}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="text-xs text-zinc-500">
                      {tx.category_code ?? <span className="text-zinc-700">—</span>}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {badge && (
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                  </td>
                  <td className={`px-5 py-3 font-medium tabular-nums whitespace-nowrap text-right ${color}`}>
                    {sign}
                    {fmtCRC(Number(tx.amount))}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-xs text-zinc-600">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── category breakdown ────────────────────────────────────────────────────────

function CategoryBreakdown({
  incomeCategories,
  expenseCategories,
  onSelect,
  selected,
}: {
  incomeCategories: CatSummary[]
  expenseCategories: CatSummary[]
  onSelect: (cat: string | null, type: 'income' | 'expense') => void
  selected: string | null
}) {
  const [tab, setTab] = useState<'expense' | 'income'>('expense')
  const cats = tab === 'expense' ? expenseCategories : incomeCategories
  const maxAmt = cats[0]?.amount ?? 1

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-zinc-200 tracking-tight">Categorías</p>
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
          {(['expense', 'income'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                onSelect(null, t)
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                tab === t ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'expense' ? 'Gastos' : 'Ingresos'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 overflow-auto">
        {/* "All" row */}
        <button
          onClick={() => onSelect(null, tab)}
          className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-xs ${
            selected === null
              ? 'bg-white/[0.06] text-zinc-200'
              : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
          }`}
        >
          Todos
        </button>

        {cats.length === 0 && (
          <p className="text-xs text-zinc-600 px-3">Sin datos</p>
        )}

        {cats.map(({ category, amount, count }) => {
          const pct = Math.round((amount / maxAmt) * 100)
          const isActive = selected === category
          return (
            <button
              key={category}
              onClick={() => onSelect(isActive ? null : category, tab)}
              className={`w-full text-left rounded-lg p-2.5 transition-colors ${
                isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex justify-between text-xs mb-1.5">
                <span className={`truncate max-w-[120px] ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`}>
                  {category}
                </span>
                <span className="text-zinc-300 tabular-nums shrink-0 ml-2">{fmtCRC(amount)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      tab === 'expense' ? 'bg-rose-500/50' : 'bg-emerald-500/50'
                    } ${isActive ? 'opacity-100' : 'opacity-60'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-zinc-700 text-xs tabular-nums shrink-0">{count}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── main export ───────────────────────────────────────────────────────────────

export function InteractiveSection({
  incomeCategories,
  expenseCategories,
  transactions,
}: InteractiveSectionProps) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'income' | 'expense'>('expense')

  function handleSelect(cat: string | null, type: 'income' | 'expense') {
    setSelectedCat(cat)
    setSelectedType(type)
  }

  const tableRows = useMemo(() => {
    if (selectedCat) {
      return transactions.filter((t) => t.category_code === selectedCat)
    }
    // No category selected: filter by type tab
    return transactions
      .filter((t) => t.movement_type === selectedType || (selectedType === 'expense' && t.movement_type === 'cash_withdrawal'))
      .slice(0, 200)
  }, [transactions, selectedCat, selectedType])

  const tableTitle = selectedCat
    ? selectedCat
    : selectedType === 'expense'
      ? 'Gastos recientes'
      : 'Ingresos recientes'

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* Category breakdown — 2 cols */}
      <div className="col-span-2">
        <CategoryBreakdown
          incomeCategories={incomeCategories}
          expenseCategories={expenseCategories}
          onSelect={handleSelect}
          selected={selectedCat}
        />
      </div>

      {/* Transactions table — 3 cols */}
      <div className="col-span-3">
        <TransactionsTable rows={tableRows} title={tableTitle} />
      </div>
    </div>
  )
}
