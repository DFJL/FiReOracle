import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MonthlyBarsChart, SavingsHeatmap, MonthData } from './CashFlowChart'
import { isLoanPayment, SAVINGS_EXPENSE_GROUP } from '../resumen/categoryUtils'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtPct(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// ── page ──────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ year?: string }>
}

export default async function FlujoPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams

  // RPC bypasses PostgREST max_rows; movement_type filter applied below
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawTx } = await (supabase as any).rpc('get_user_transactions', { p_user_id: user.id, p_start_date: null })

  interface TxRow {
    movement_type: string | null
    amount: number | null
    date: string | null
    expense_group: string | null
    category_code: string | null
    vendor: string | null
    concept: string | null
    is_settlement: boolean | null
    is_passive_income: boolean | null
  }
  const allTx = (rawTx ?? []) as TxRow[]

  // Available years
  const yearSet = new Set<number>()
  for (const r of allTx) {
    if (r.date) yearSet.add(parseInt(r.date.slice(0, 4)))
  }
  const years = [...yearSet].sort((a, b) => b - a)

  const selectedYear = params.year && yearSet.has(parseInt(params.year))
    ? parseInt(params.year)
    : (years[0] ?? new Date().getFullYear())

  // Monthly buckets for selected year
  const monthMap: Record<string, { income: number; expenses: number; withdrawals: number }> = {}
  for (let m = 1; m <= 12; m++) {
    const key = `${selectedYear}-${String(m).padStart(2, '0')}`
    monthMap[key] = { income: 0, expenses: 0, withdrawals: 0 }
  }
  for (const r of allTx) {
    if (!r.date) continue
    if (parseInt(r.date.slice(0, 4)) !== selectedYear) continue
    const key = r.date.slice(0, 7)
    if (!monthMap[key]) continue
    const amt = Number(r.amount ?? 0)
    if (r.movement_type === 'income' && !r.is_settlement) {
      monthMap[key].income += amt
    } else if (r.movement_type === 'expense' || r.movement_type === 'cash_withdrawal') {
      if (r.expense_group !== SAVINGS_EXPENSE_GROUP || isLoanPayment(r.vendor, r.concept, r.category_code)) {
        if (r.movement_type === 'cash_withdrawal') monthMap[key].withdrawals += amt
        else monthMap[key].expenses += amt
      }
    }
  }

  let cumulative = 0
  const tableRows: (MonthData & { hasData: boolean })[] = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { income, expenses, withdrawals }]) => {
      const net = income - expenses - withdrawals
      cumulative += net
      const rate = income > 0 ? ((income - expenses) / income) * 100 : null
      const hasData = income > 0 || expenses > 0 || withdrawals > 0
      return { month, income, expenses, withdrawals, net, cumulative, rate, hasData }
    })

  // Year totals
  const totalIncome = tableRows.reduce((s, r) => s + r.income, 0)
  const totalExpenses = tableRows.reduce((s, r) => s + r.expenses, 0)
  const totalWithdrawals = tableRows.reduce((s, r) => s + r.withdrawals, 0)
  const totalNet = totalIncome - totalExpenses - totalWithdrawals
  const totalRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : null

  const bestMonth = [...tableRows].filter((r) => r.hasData).sort((a, b) => b.net - a.net)[0]
  const worstMonth = [...tableRows].filter((r) => r.hasData).sort((a, b) => a.net - b.net)[0]

  const chartRows: MonthData[] = tableRows.map(({ hasData: _, ...r }) => r)

  // All-years data for heatmap (heatmap shows savings rate across all time)
  const heatmapMap: Record<string, { income: number; expenses: number; withdrawals: number }> = {}
  for (const r of allTx) {
    if (!r.date) continue
    const key = r.date.slice(0, 7)
    if (!heatmapMap[key]) heatmapMap[key] = { income: 0, expenses: 0, withdrawals: 0 }
    const amt = Number(r.amount ?? 0)
    if (r.movement_type === 'income' && !r.is_settlement) {
      heatmapMap[key].income += amt
    } else if (r.movement_type === 'expense' || r.movement_type === 'cash_withdrawal') {
      if (r.expense_group !== SAVINGS_EXPENSE_GROUP || isLoanPayment(r.vendor, r.concept, r.category_code)) {
        if (r.movement_type === 'cash_withdrawal') heatmapMap[key].withdrawals += amt
        else heatmapMap[key].expenses += amt
      }
    }
  }
  let heatCumulative = 0
  const heatmapData: MonthData[] = Object.entries(heatmapMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { income, expenses, withdrawals }]) => {
      const net = income - expenses - withdrawals
      heatCumulative += net
      const rate = income > 0 ? ((income - expenses) / income) * 100 : null
      return { month, income, expenses, withdrawals, net, cumulative: heatCumulative, rate }
    })

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Flujo de Caja</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Ingresos, egresos y balance mensual</p>
        </div>
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1">
          {years.map((y) => (
            <a
              key={y}
              href={`/flujo?year=${y}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedYear === y ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {y}
            </a>
          ))}
        </div>
      </div>

      {/* Datos iniciales notice */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 mb-6 flex items-start gap-3">
        <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-amber-400 text-xs font-bold">!</span>
        </div>
        <div>
          <p className="text-sm font-medium text-amber-400">Saldo inicial no configurado</p>
          <p className="text-xs text-zinc-500 mt-1">
            El saldo acumulado y el patrimonio real requieren que registres tus saldos de cuentas al inicio del período.
            Hasta entonces, el acumulado muestra flujo relativo desde cero.{' '}
            <span className="text-amber-400/70">
              La sección &quot;Datos Iniciales&quot; está pendiente de implementación.
            </span>
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Ingresos {selectedYear}</p>
          <p className="text-xl font-semibold text-emerald-400 tabular-nums">{fmt(totalIncome)}</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Egresos {selectedYear}</p>
          <p className="text-xl font-semibold text-rose-400 tabular-nums">{fmt(totalExpenses + totalWithdrawals)}</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Flujo neto</p>
          <p className={`text-xl font-semibold tabular-nums ${totalNet >= 0 ? 'text-blue-400' : 'text-amber-400'}`}>
            {fmt(totalNet)}
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Tasa de ahorro</p>
          <p className="text-xl font-semibold text-violet-400 tabular-nums">
            {totalRate !== null ? totalRate.toFixed(1) + '%' : '—'}
          </p>
          {totalRate !== null && (
            <div className="mt-2 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500/50 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, totalRate))}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Best/worst */}
      {bestMonth && worstMonth && bestMonth.month !== worstMonth.month && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl bg-emerald-500/[0.04] border border-emerald-500/[0.12] p-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Mejor mes</p>
              <p className="text-sm font-medium text-zinc-200">
                {MONTH_LABELS[parseInt(bestMonth.month.slice(5, 7)) - 1]}
              </p>
            </div>
            <p className="text-sm font-semibold text-emerald-400 tabular-nums">{fmt(bestMonth.net)}</p>
          </div>
          <div className="rounded-xl bg-rose-500/[0.04] border border-rose-500/[0.12] p-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Peor mes</p>
              <p className="text-sm font-medium text-zinc-200">
                {MONTH_LABELS[parseInt(worstMonth.month.slice(5, 7)) - 1]}
              </p>
            </div>
            <p className="text-sm font-semibold text-rose-400 tabular-nums">{fmt(worstMonth.net)}</p>
          </div>
        </div>
      )}

      {/* Interactive bar chart */}
      <div className="mb-6">
        <MonthlyBarsChart data={chartRows} />
      </div>

      {/* Savings rate heatmap — shows all years for historical perspective */}
      <div className="mb-6">
        <SavingsHeatmap data={heatmapData} />
      </div>

      {/* Monthly table */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-zinc-200 tracking-tight">
            Detalle mensual {selectedYear}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.04]">
                {['Mes', 'Ingresos', 'Gastos', 'Retiros', 'Flujo neto', 'Acumulado*', 'Ahorro %'].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {tableRows.map((r) => {
                const monthIdx = parseInt(r.month.slice(5, 7)) - 1
                return (
                  <tr
                    key={r.month}
                    className={`hover:bg-white/[0.02] transition-colors ${!r.hasData ? 'opacity-25' : ''}`}
                  >
                    <td className="px-5 py-3 text-zinc-300 font-medium whitespace-nowrap">
                      {MONTH_LABELS[monthIdx]}
                    </td>
                    <td className="px-5 py-3 text-emerald-400 tabular-nums whitespace-nowrap">
                      {r.hasData ? fmt(r.income) : '—'}
                    </td>
                    <td className="px-5 py-3 text-rose-400 tabular-nums whitespace-nowrap">
                      {r.hasData ? fmt(r.expenses) : '—'}
                    </td>
                    <td className="px-5 py-3 text-amber-400 tabular-nums whitespace-nowrap">
                      {r.withdrawals > 0 ? fmt(r.withdrawals) : '—'}
                    </td>
                    <td
                      className={`px-5 py-3 font-medium tabular-nums whitespace-nowrap ${
                        r.net >= 0 ? 'text-blue-400' : 'text-rose-300'
                      }`}
                    >
                      {r.hasData ? fmt(r.net) : '—'}
                    </td>
                    <td className="px-5 py-3 text-zinc-400 tabular-nums whitespace-nowrap">
                      {r.hasData ? fmt(r.cumulative) : '—'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {r.rate !== null && r.hasData ? (
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                            r.rate >= 20
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : r.rate >= 0
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {fmtPct(r.rate)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/[0.08] bg-white/[0.02]">
                <td className="px-5 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Total
                </td>
                <td className="px-5 py-3 text-emerald-400 font-semibold tabular-nums">{fmt(totalIncome)}</td>
                <td className="px-5 py-3 text-rose-400 font-semibold tabular-nums">{fmt(totalExpenses)}</td>
                <td className="px-5 py-3 text-amber-400 font-semibold tabular-nums">
                  {totalWithdrawals > 0 ? fmt(totalWithdrawals) : '—'}
                </td>
                <td
                  className={`px-5 py-3 font-bold tabular-nums ${totalNet >= 0 ? 'text-blue-400' : 'text-rose-300'}`}
                >
                  {fmt(totalNet)}
                </td>
                <td className="px-5 py-3 text-zinc-300 font-semibold tabular-nums">
                  {fmt(cumulative)}
                </td>
                <td className="px-5 py-3">
                  {totalRate !== null && (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                        totalRate >= 20
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : totalRate >= 0
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {fmtPct(totalRate)}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs text-zinc-700">
        * Acumulado relativo — pendiente saldo inicial de cuentas
      </p>
    </div>
  )
}
