'use client'

import { useState, useMemo, useCallback } from 'react'
import { MonthlyBarsChart, SavingsHeatmap, MonthData } from './CashFlowChart'
import { isLoanPayment, SAVINGS_EXPENSE_GROUP } from '../resumen/categoryUtils'

// ── types ─────────────────────────────────────────────────────────────────────

export interface TxRow {
  movement_type: string | null
  amount: number | null
  date: string | null
  expense_group: string | null
  concept: string | null
  vendor: string | null
  category_code: string | null
  is_settlement: boolean | null
  is_passive_income: boolean | null
}

type PeriodKey = 'mtd' | 'ytd' | '1a' | '2a' | 'all'

// ── helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const PERIODS: { key: PeriodKey; label: string; full: string }[] = [
  { key: 'mtd', label: 'MTD',  full: 'Mes en curso' },
  { key: 'ytd', label: 'YTD',  full: 'Año en curso' },
  { key: '1a',  label: '1A',   full: 'Últimos 12 meses' },
  { key: '2a',  label: '2A',   full: 'Últimos 24 meses' },
  { key: 'all', label: 'Todo', full: 'Histórico completo' },
]

function periodCutoff(p: PeriodKey): string | null {
  const now = new Date()
  if (p === 'mtd') return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
  if (p === 'ytd') return `${now.getFullYear()}-01-01`
  if (p === '1a')  { const d = new Date(now); d.setFullYear(d.getFullYear()-1); return d.toISOString().slice(0,10) }
  if (p === '2a')  { const d = new Date(now); d.setFullYear(d.getFullYear()-2); return d.toISOString().slice(0,10) }
  return null
}

function isValuationEntry(concept: string | null) {
  return /p[eé]rdida\s*valor|aumento\s*valor/i.test(concept ?? '')
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

function monthlyAggregates(txs: TxRow[]): (MonthData & { hasData: boolean })[] {
  const map: Record<string, { income: number; expenses: number; withdrawals: number }> = {}
  for (const tx of txs) {
    if (!tx.date) continue
    const key = tx.date.slice(0, 7)
    if (!map[key]) map[key] = { income: 0, expenses: 0, withdrawals: 0 }
    const amt = Number(tx.amount ?? 0)
    if (tx.movement_type === 'income' && !tx.is_settlement) {
      map[key].income += amt
    } else if (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal') {
      const isSavings = tx.expense_group === SAVINGS_EXPENSE_GROUP
        && !isLoanPayment(tx.vendor, tx.concept, tx.category_code)
      if (!isSavings && !isValuationEntry(tx.concept)) {
        if (tx.movement_type === 'cash_withdrawal') map[key].withdrawals += amt
        else map[key].expenses += amt
      }
    }
  }
  let cumulative = 0
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { income, expenses, withdrawals }]) => {
      const net = income - expenses - withdrawals
      cumulative += net
      const rate = income > 0 ? ((income - expenses) / income) * 100 : null
      return { month, income, expenses, withdrawals, net, cumulative, rate, hasData: income > 0 || expenses > 0 || withdrawals > 0 }
    })
}

// ── component ─────────────────────────────────────────────────────────────────

type SortKey = 'month' | 'income' | 'expenses' | 'withdrawals' | 'net' | 'cumulative' | 'rate'

export function CashFlowSection({ transactions }: { transactions: TxRow[] }) {
  const [period, setPeriod]   = useState<PeriodKey>('ytd')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortAsc, setSortAsc] = useState(false)

  const cycleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev !== key) { setSortAsc(false); return key }
      setSortAsc(a => !a)
      return key
    })
  }, [])

  const cutoff     = useMemo(() => periodCutoff(period), [period])
  const filtered   = useMemo(() => cutoff ? transactions.filter(tx => tx.date && tx.date >= cutoff) : transactions, [transactions, cutoff])
  const monthly    = useMemo(() => monthlyAggregates(filtered), [filtered])
  const chartData  = useMemo(() => monthly.map(({ hasData: _, ...r }) => r), [monthly])

  const totalIncome    = monthly.reduce((s, r) => s + r.income, 0)
  const totalExpenses  = monthly.reduce((s, r) => s + r.expenses + r.withdrawals, 0)
  const totalNet       = totalIncome - totalExpenses
  const totalRate      = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : null
  const activeMonths   = monthly.filter(r => r.hasData)
  const bestMonth      = [...activeMonths].sort((a, b) => b.net - a.net)[0]
  const worstMonth     = [...activeMonths].sort((a, b) => a.net - b.net)[0]

  const sortedMonths = useMemo(() => {
    if (!sortKey) return activeMonths
    return [...activeMonths].sort((a, b) => {
      const va = a[sortKey] ?? -Infinity
      const vb = b[sortKey] ?? -Infinity
      return sortAsc ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0)
    })
  }, [activeMonths, sortKey, sortAsc])

  const now        = new Date()
  const monthLabel = now.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }).toUpperCase()
  const periodFull = PERIODS.find(p => p.key === period)?.full ?? ''

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[9px] font-black text-[#a3e635]/60 tracking-[0.22em] uppercase mb-1">
            Fire Oracle · {monthLabel}
          </p>
          <p className="text-3xl font-black text-white tracking-tight leading-none">Flujo de Caja</p>
          <p className="text-xs text-zinc-500 mt-1">Ingresos, egresos y margen neto mensual</p>
        </div>
        {/* Period selector */}
        <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black tracking-wider transition-all ${
                period === p.key ? 'bg-white/[0.10] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#a3e635]/[0.06] rounded-2xl overflow-hidden border border-[#a3e635]/[0.08]">
        {[
          { label: 'Ingresos',      value: fmt(totalIncome),                                      color: 'text-[#a3e635]'  },
          { label: 'Egresos',       value: fmt(totalExpenses),                                    color: 'text-rose-400'   },
          { label: 'Flujo neto',    value: fmt(totalNet),                                         color: totalNet >= 0 ? 'text-blue-400' : 'text-amber-400' },
          { label: 'Margen neto',   value: totalRate !== null ? totalRate.toFixed(1) + '%' : '—', color: totalRate !== null && totalRate >= 20 ? 'text-[#a3e635]' : totalRate !== null && totalRate >= 10 ? 'text-amber-400' : 'text-rose-400' },
        ].map(k => (
          <div key={k.label} className="bg-[#0d120d] px-4 py-4 flex flex-col gap-1.5">
            <p className={`text-2xl font-black tabular-nums leading-none ${k.color}`}>{k.value}</p>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.16em]">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Best / worst month */}
      {bestMonth && worstMonth && bestMonth.month !== worstMonth.month && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { title: 'Mejor mes', row: bestMonth, color: 'text-[#a3e635]', border: 'border-[#a3e635]/[0.10]' },
            { title: 'Peor mes',  row: worstMonth, color: 'text-rose-400',  border: 'border-rose-500/[0.10]' },
          ].map(({ title, row, color, border }) => (
            <div key={title} className={`rounded-2xl bg-[#0d120d] border ${border} px-4 py-3 flex justify-between items-center`}>
              <div>
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">{title}</p>
                <p className="text-sm font-black text-zinc-200 mt-0.5">
                  {MONTH_NAMES[parseInt(row.month.slice(5,7))-1]} {row.month.slice(0,4)}
                </p>
              </div>
              <p className={`text-sm font-black tabular-nums ${color}`}>{fmt(row.net)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Bar chart */}
      <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5">
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-1">
          Ingresos vs Egresos
        </p>
        <p className="text-xs text-zinc-500 mb-3">{periodFull}</p>
        <MonthlyBarsChart data={chartData} />
      </div>

      {/* Heatmap — filtered by selected period */}
      <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5">
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-1">
          Margen neto mensual
        </p>
        <p className="text-xs text-zinc-500 mb-3">{periodFull}</p>
        <SavingsHeatmap data={chartData} />
      </div>

      {/* Monthly table */}
      {activeMonths.length > 0 && (
        <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#a3e635]/[0.10]">
            <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Detalle mensual</p>
            <p className="text-sm font-black text-white mt-0.5">{periodFull}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  {([
                    { label: 'Mes',        key: 'month'       },
                    { label: 'Ingresos',   key: 'income'      },
                    { label: 'Gastos',     key: 'expenses'    },
                    { label: 'Retiros',    key: 'withdrawals' },
                    { label: 'Flujo neto', key: 'net'         },
                    { label: 'Acumulado',  key: 'cumulative'  },
                    { label: 'Margen neto',key: 'rate'        },
                  ] as { label: string; key: SortKey }[]).map(({ label, key }) => (
                    <th key={key} onClick={() => cycleSort(key)}
                      className="px-5 py-3 text-left text-[9px] font-black text-zinc-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-zinc-300 select-none transition-colors">
                      {label}
                      {sortKey === key && <span className="ml-1 opacity-60">{sortAsc ? '↑' : '↓'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {sortedMonths.map(r => (
                  <tr key={r.month} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-zinc-300 font-black whitespace-nowrap">
                      {MONTH_NAMES[parseInt(r.month.slice(5,7))-1]} {r.month.slice(0,4)}
                    </td>
                    <td className="px-5 py-3 text-[#a3e635] tabular-nums whitespace-nowrap">{fmt(r.income)}</td>
                    <td className="px-5 py-3 text-rose-400 tabular-nums whitespace-nowrap">{fmt(r.expenses)}</td>
                    <td className="px-5 py-3 text-amber-400 tabular-nums whitespace-nowrap">
                      {r.withdrawals > 0 ? fmt(r.withdrawals) : '—'}
                    </td>
                    <td className={`px-5 py-3 font-black tabular-nums whitespace-nowrap ${r.net >= 0 ? 'text-blue-400' : 'text-rose-300'}`}>
                      {fmt(r.net)}
                    </td>
                    <td className="px-5 py-3 text-zinc-400 tabular-nums whitespace-nowrap">{fmt(r.cumulative)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {r.rate !== null ? (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                          r.rate >= 20 ? 'bg-[#a3e635]/10 text-[#a3e635]' :
                          r.rate >= 0  ? 'bg-blue-500/10 text-blue-400' :
                                         'bg-rose-500/10 text-rose-400'
                        }`}>{r.rate.toFixed(1)}%</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/[0.08] bg-white/[0.02]">
                  <td className="px-5 py-3 text-[9px] font-black text-zinc-400 uppercase tracking-wider">Total</td>
                  <td className="px-5 py-3 text-[#a3e635] font-black tabular-nums">{fmt(totalIncome)}</td>
                  <td className="px-5 py-3 text-rose-400 font-black tabular-nums">{fmt(monthly.reduce((s,r)=>s+r.expenses,0))}</td>
                  <td className="px-5 py-3 text-amber-400 font-black tabular-nums">
                    {monthly.reduce((s,r)=>s+r.withdrawals,0) > 0 ? fmt(monthly.reduce((s,r)=>s+r.withdrawals,0)) : '—'}
                  </td>
                  <td className={`px-5 py-3 font-black tabular-nums ${totalNet >= 0 ? 'text-blue-400' : 'text-rose-300'}`}>{fmt(totalNet)}</td>
                  <td className="px-5 py-3 text-zinc-300 font-black tabular-nums">{fmt(monthly[monthly.length-1]?.cumulative ?? 0)}</td>
                  <td className="px-5 py-3">
                    {totalRate !== null && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                        totalRate >= 20 ? 'bg-[#a3e635]/10 text-[#a3e635]' :
                        totalRate >= 0  ? 'bg-blue-500/10 text-blue-400' :
                                          'bg-rose-500/10 text-rose-400'
                      }`}>{totalRate.toFixed(1)}%</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="text-[10px] text-zinc-700">
        Acumulado desde inicio del período seleccionado. Excluye depósitos a inversiones/ahorros y variaciones de valor no realizadas.
      </p>

    </div>
  )
}
