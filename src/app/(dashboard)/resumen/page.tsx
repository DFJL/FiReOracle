import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MetricChart, MonthPoint } from './MetricChart'
import { InteractiveSection, CatSummary, TxClient } from './InteractiveSection'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(n)
}

function periodLabel(code: string) {
  switch (code) {
    case '3m': return 'Últimos 3 meses'
    case 'ytd': return 'Este año'
    case '1y': return 'Último año'
    default: return 'Todo el tiempo'
  }
}

function periodStart(code: string): string | null {
  const now = new Date()
  if (code === '3m') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 3)
    return d.toISOString().slice(0, 10)
  }
  if (code === 'ytd') return `${now.getFullYear()}-01-01`
  if (code === '1y') {
    const d = new Date(now)
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().slice(0, 10)
  }
  return null
}

// ── page ──────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function ResumenPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const period = ['3m', 'ytd', '1y', 'all'].includes(params.period ?? '')
    ? (params.period ?? 'all')
    : 'all'
  const start = periodStart(period)

  // Single comprehensive query — limit 3000 rows for the period
  const base = supabase
    .from('transactions')
    .select('movement_type, amount, date, vendor, concept, category_code')
    .not('amount', 'is', null)
    .not('date', 'is', null)
    .order('date', { ascending: false })
    .limit(3000)

  const { data: rawTx } = await (start ? base.gte('date', start) : base)
  const transactions = (rawTx ?? []) as TxClient[]

  // ── KPI stats ──────────────────────────────────────────────────────────────
  let income = 0, expenses = 0, withdrawals = 0
  for (const t of transactions) {
    const amt = Number(t.amount)
    if (t.movement_type === 'income') income += amt
    else if (t.movement_type === 'expense') expenses += amt
    else if (t.movement_type === 'cash_withdrawal') withdrawals += amt
  }
  const net = income - expenses - withdrawals
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0

  // ── Monthly chart data ─────────────────────────────────────────────────────
  const monthMap: Record<string, MonthPoint> = {}
  for (const t of transactions) {
    if (!t.date) continue
    const key = t.date.slice(0, 7)
    if (!monthMap[key]) monthMap[key] = { month: key, income: 0, expenses: 0, net: 0, savings_rate: 0, cumulative: 0 }
    const amt = Number(t.amount)
    if (t.movement_type === 'income') monthMap[key].income += amt
    else if (t.movement_type === 'expense') monthMap[key].expenses += amt
  }
  let cumulative = 0
  const chartData: MonthPoint[] = Object.values(monthMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => {
      const n = m.income - m.expenses
      cumulative += n
      return {
        ...m,
        net: n,
        savings_rate: m.income > 0 ? ((m.income - m.expenses) / m.income) * 100 : 0,
        cumulative,
      }
    })

  // ── Category breakdown ─────────────────────────────────────────────────────
  const incCatMap: Record<string, { amount: number; count: number }> = {}
  const expCatMap: Record<string, { amount: number; count: number }> = {}

  for (const t of transactions) {
    const cat = t.category_code ?? 'Sin categoría'
    const amt = Number(t.amount)
    if (t.movement_type === 'income') {
      if (!incCatMap[cat]) incCatMap[cat] = { amount: 0, count: 0 }
      incCatMap[cat].amount += amt
      incCatMap[cat].count++
    } else if (t.movement_type === 'expense' || t.movement_type === 'cash_withdrawal') {
      if (!expCatMap[cat]) expCatMap[cat] = { amount: 0, count: 0 }
      expCatMap[cat].amount += amt
      expCatMap[cat].count++
    }
  }

  const incomeCategories: CatSummary[] = Object.entries(incCatMap)
    .map(([category, { amount, count }]) => ({ category, amount, count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20)

  const expenseCategories: CatSummary[] = Object.entries(expCatMap)
    .map(([category, { amount, count }]) => ({ category, amount, count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20)

  // ── Period pills ───────────────────────────────────────────────────────────
  const periods = [
    { code: 'all', label: 'Todo' },
    { code: 'ytd', label: 'Este año' },
    { code: '1y', label: '12 meses' },
    { code: '3m', label: '3 meses' },
  ]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Resumen</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{periodLabel(period)}</p>
        </div>
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1">
          {periods.map((p) => (
            <a
              key={p.code}
              href={`/resumen?period=${p.code}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === p.code
                  ? 'bg-white/[0.08] text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
      </div>

      {/* KPI cards — clickable → movimientos with filter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <a
          href={`/movimientos?tab=income`}
          className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3 hover:bg-white/[0.05] hover:border-emerald-500/20 transition-colors group"
        >
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition-colors">
            Ingresos
          </p>
          <p className="text-xl font-semibold text-emerald-400 tabular-nums">{fmt(income)}</p>
          <p className="text-xs text-zinc-700 group-hover:text-zinc-600 transition-colors">
            Ver detalle →
          </p>
        </a>

        <a
          href={`/movimientos?tab=expense`}
          className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3 hover:bg-white/[0.05] hover:border-rose-500/20 transition-colors group"
        >
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition-colors">
            Gastos
          </p>
          <p className="text-xl font-semibold text-rose-400 tabular-nums">{fmt(expenses)}</p>
          <p className="text-xs text-zinc-700 group-hover:text-zinc-600 transition-colors">
            Ver detalle →
          </p>
        </a>

        <a
          href={`/movimientos`}
          className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3 hover:bg-white/[0.05] hover:border-blue-500/20 transition-colors group"
        >
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition-colors">
            Balance neto
          </p>
          <p
            className={`text-xl font-semibold tabular-nums ${net >= 0 ? 'text-blue-400' : 'text-amber-400'}`}
          >
            {fmt(net)}
          </p>
          <p className="text-xs text-zinc-700 group-hover:text-zinc-600 transition-colors">
            {transactions.length.toLocaleString('es-CR')} movimientos →
          </p>
        </a>

        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Tasa de ahorro
          </p>
          <p className="text-xl font-semibold text-violet-400 tabular-nums">
            {savingsRate.toFixed(1)}%
          </p>
          <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500/50 rounded-full transition-all"
              style={{ width: `${Math.max(0, Math.min(100, savingsRate))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Multi-metric time series chart */}
      <div className="mb-6">
        <MetricChart data={chartData} />
      </div>

      {/* Category breakdown + transactions table */}
      <InteractiveSection
        incomeCategories={incomeCategories}
        expenseCategories={expenseCategories}
        transactions={transactions}
      />
    </div>
  )
}
