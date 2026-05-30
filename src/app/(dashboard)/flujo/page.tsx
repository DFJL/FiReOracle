import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

// ── types ─────────────────────────────────────────────────────────────────────

interface MonthRow {
  month: string // "2018-03"
  income: number
  expenses: number
  withdrawals: number
}

interface TxRow {
  movement_type: string | null
  amount: number | null
  date: string | null
}

// ── SVG cumulative line chart ─────────────────────────────────────────────────

function CumulativeChart({ rows }: { rows: MonthRow[] }) {
  if (rows.length === 0) return null

  let running = 0
  const points = rows.map((r) => {
    running += r.income - r.expenses - r.withdrawals
    return running
  })

  const minV = Math.min(...points)
  const maxV = Math.max(...points)
  const range = maxV - minV || 1

  const W = 800
  const H = 160
  const padX = 8
  const padY = 12
  const chartW = W - padX * 2
  const chartH = H - padY * 2

  const xs = rows.map((_, i) => padX + (i / Math.max(rows.length - 1, 1)) * chartW)
  const ys = points.map((v) => padY + chartH - ((v - minV) / range) * chartH)

  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const areaD = pathD + ` L${xs[xs.length - 1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`

  const zero = points.some((p) => p < 0)
    ? padY + chartH - ((0 - minV) / range) * chartH
    : null

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
      <p className="text-sm font-semibold text-zinc-200 mb-1 tracking-tight">Saldo acumulado</p>
      <p className="text-xs text-zinc-500 mb-4">Flujo neto acumulado en el período (sin saldo inicial)</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-label="Saldo acumulado">
        {/* zero line */}
        {zero !== null && (
          <line x1={padX} y1={zero} x2={W - padX} y2={zero} stroke="rgb(113 113 122 / 0.3)" strokeDasharray="4 3" strokeWidth="1" />
        )}
        {/* area fill */}
        <path d={areaD} fill="url(#flujoGradient)" />
        {/* line */}
        <path d={pathD} fill="none" stroke="rgb(99 102 241)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* gradient def */}
        <defs>
          <linearGradient id="flujoGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* month labels — every 3 */}
        {rows.map((r, i) => {
          if (i % 3 !== 0) return null
          const monthIdx = parseInt(r.month.slice(5, 7)) - 1
          return (
            <text key={r.month} x={xs[i]} y={H - 1} textAnchor="middle" fontSize="8" fill="rgb(82 82 91)">
              {MONTH_LABELS[monthIdx]}{r.month.slice(2, 4)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ── sparkline for savings rate ────────────────────────────────────────────────

function SavingsSparkline({ rows }: { rows: MonthRow[] }) {
  const rates = rows.map((r) => (r.income > 0 ? ((r.income - r.expenses) / r.income) * 100 : 0))
  if (rates.length < 2) return null

  const minV = Math.min(...rates)
  const maxV = Math.max(...rates)
  const range = maxV - minV || 1
  const W = 120
  const H = 32
  const xs = rates.map((_, i) => (i / (rates.length - 1)) * W)
  const ys = rates.map((v) => H - ((v - minV) / range) * H)
  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'inline-block' }}>
      <path d={pathD} fill="none" stroke="rgb(167 139 250)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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

  // Determine available years from DB
  const { data: rawTx } = await supabase
    .from('transactions')
    .select('movement_type, amount, date')
    .not('amount', 'is', null)
    .not('date', 'is', null)

  const allTx = (rawTx ?? []) as TxRow[]

  // Extract unique years
  const yearSet = new Set<number>()
  for (const r of allTx) {
    if (r.date) yearSet.add(parseInt(r.date.slice(0, 4)))
  }
  const years = [...yearSet].sort((a, b) => b - a)

  const selectedYear = params.year && yearSet.has(parseInt(params.year))
    ? parseInt(params.year)
    : (years[0] ?? new Date().getFullYear())

  // Build monthly buckets for selected year
  const monthMap: Record<string, MonthRow> = {}
  for (let m = 1; m <= 12; m++) {
    const key = `${selectedYear}-${String(m).padStart(2, '0')}`
    monthMap[key] = { month: key, income: 0, expenses: 0, withdrawals: 0 }
  }

  for (const r of allTx) {
    if (!r.date) continue
    const year = parseInt(r.date.slice(0, 4))
    if (year !== selectedYear) continue
    const key = r.date.slice(0, 7)
    if (!monthMap[key]) continue
    if (r.movement_type === 'income') monthMap[key].income += Number(r.amount)
    if (r.movement_type === 'expense') monthMap[key].expenses += Number(r.amount)
    if (r.movement_type === 'cash_withdrawal') monthMap[key].withdrawals += Number(r.amount)
  }

  const rows = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))

  // Cumulative balance (relative, no starting balance)
  let cumulative = 0
  const tableRows = rows.map((r) => {
    const net = r.income - r.expenses - r.withdrawals
    cumulative += net
    const rate = r.income > 0 ? ((r.income - r.expenses) / r.income) * 100 : null
    return { ...r, net, cumulative, rate }
  })

  // Year totals
  const totalIncome = rows.reduce((s, r) => s + r.income, 0)
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0)
  const totalWithdrawals = rows.reduce((s, r) => s + r.withdrawals, 0)
  const totalNet = totalIncome - totalExpenses - totalWithdrawals
  const totalRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : null

  // All-time data for chart (last 36 months across all years)
  const allMonthMap: Record<string, MonthRow> = {}
  for (const r of allTx) {
    if (!r.date) continue
    const key = r.date.slice(0, 7)
    if (!allMonthMap[key]) allMonthMap[key] = { month: key, income: 0, expenses: 0, withdrawals: 0 }
    if (r.movement_type === 'income') allMonthMap[key].income += Number(r.amount)
    if (r.movement_type === 'expense') allMonthMap[key].expenses += Number(r.amount)
    if (r.movement_type === 'cash_withdrawal') allMonthMap[key].withdrawals += Number(r.amount)
  }
  const allMonths = Object.values(allMonthMap).sort((a, b) => a.month.localeCompare(b.month))

  // Best/worst month
  const sortedByNet = [...tableRows].filter((r) => r.income > 0 || r.expenses > 0).sort((a, b) => b.net - a.net)
  const bestMonth = sortedByNet[0]
  const worstMonth = sortedByNet[sortedByNet.length - 1]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Flujo de Caja</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Ingresos, egresos y balance mensual</p>
        </div>

        {/* Year selector */}
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1">
          {years.map((y) => (
            <a
              key={y}
              href={`/flujo?year=${y}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedYear === y
                  ? 'bg-white/[0.08] text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {y}
            </a>
          ))}
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
          <div className="flex items-end gap-3">
            <p className="text-xl font-semibold text-violet-400 tabular-nums">
              {totalRate !== null ? totalRate.toFixed(1) + '%' : '—'}
            </p>
            <SavingsSparkline rows={rows} />
          </div>
        </div>
      </div>

      {/* Best/worst month highlights */}
      {bestMonth && worstMonth && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl bg-emerald-500/[0.04] border border-emerald-500/[0.12] p-4 flex justify-between items-start">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Mejor mes</p>
              <p className="text-sm font-medium text-zinc-200">
                {MONTH_LABELS[parseInt(bestMonth.month.slice(5, 7)) - 1]}
              </p>
            </div>
            <p className="text-sm font-semibold text-emerald-400 tabular-nums">{fmt(bestMonth.net)}</p>
          </div>
          <div className="rounded-xl bg-rose-500/[0.04] border border-rose-500/[0.12] p-4 flex justify-between items-start">
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

      {/* Cumulative chart */}
      <div className="mb-6">
        <CumulativeChart rows={allMonths} />
      </div>

      {/* Monthly table */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-zinc-200 tracking-tight">Detalle mensual {selectedYear}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.04]">
                {['Mes', 'Ingresos', 'Gastos', 'Retiros', 'Flujo neto', 'Acumulado', 'Ahorro %'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {tableRows.map((r) => {
                const hasData = r.income > 0 || r.expenses > 0 || r.withdrawals > 0
                const monthIdx = parseInt(r.month.slice(5, 7)) - 1
                return (
                  <tr key={r.month} className={`hover:bg-white/[0.02] transition-colors ${!hasData ? 'opacity-30' : ''}`}>
                    <td className="px-5 py-3 text-zinc-300 font-medium whitespace-nowrap">
                      {MONTH_LABELS[monthIdx]}
                    </td>
                    <td className="px-5 py-3 text-emerald-400 tabular-nums whitespace-nowrap">
                      {hasData ? fmt(r.income) : '—'}
                    </td>
                    <td className="px-5 py-3 text-rose-400 tabular-nums whitespace-nowrap">
                      {hasData ? fmt(r.expenses) : '—'}
                    </td>
                    <td className="px-5 py-3 text-amber-400 tabular-nums whitespace-nowrap">
                      {r.withdrawals > 0 ? fmt(r.withdrawals) : '—'}
                    </td>
                    <td className={`px-5 py-3 font-medium tabular-nums whitespace-nowrap ${r.net >= 0 ? 'text-blue-400' : 'text-rose-300'}`}>
                      {hasData ? fmt(r.net) : '—'}
                    </td>
                    <td className={`px-5 py-3 tabular-nums whitespace-nowrap text-zinc-300`}>
                      {hasData ? fmt(r.cumulative) : '—'}
                    </td>
                    <td className="px-5 py-3 tabular-nums whitespace-nowrap">
                      {r.rate !== null && hasData ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                          r.rate >= 20 ? 'bg-emerald-500/10 text-emerald-400'
                          : r.rate >= 0 ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {fmtPct(r.rate)}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="border-t border-white/[0.08] bg-white/[0.02]">
                <td className="px-5 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total</td>
                <td className="px-5 py-3 text-emerald-400 font-semibold tabular-nums">{fmt(totalIncome)}</td>
                <td className="px-5 py-3 text-rose-400 font-semibold tabular-nums">{fmt(totalExpenses)}</td>
                <td className="px-5 py-3 text-amber-400 font-semibold tabular-nums">{totalWithdrawals > 0 ? fmt(totalWithdrawals) : '—'}</td>
                <td className={`px-5 py-3 font-bold tabular-nums ${totalNet >= 0 ? 'text-blue-400' : 'text-rose-300'}`}>{fmt(totalNet)}</td>
                <td className="px-5 py-3 text-zinc-300 font-semibold tabular-nums">{fmt(cumulative)}</td>
                <td className="px-5 py-3">
                  {totalRate !== null && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                      totalRate >= 20 ? 'bg-emerald-500/10 text-emerald-400'
                      : totalRate >= 0 ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {fmtPct(totalRate)}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Note about starting balance */}
      <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/[0.10] p-4 mb-6">
        <p className="text-xs text-amber-400/80">
          <span className="font-semibold">Nota:</span> El saldo acumulado muestra el flujo neto relativo (sin saldo inicial).
          Para ver el patrimonio real necesitás registrar tus saldos de cuentas iniciales en la sección de configuración inicial.
        </p>
      </div>
    </div>
  )
}
