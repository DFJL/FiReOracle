import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
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
  })
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

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
  if (code === 'ytd') {
    return `${now.getFullYear()}-01-01`
  }
  if (code === '1y') {
    const d = new Date(now)
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().slice(0, 10)
  }
  return null
}

// ── types ─────────────────────────────────────────────────────────────────────

interface TxRow {
  movement_type: string | null
  amount: number | null
  date: string | null
}

interface RecentRow {
  date: string | null
  vendor: string | null
  concept: string | null
  category_code: string | null
  movement_type: string | null
  amount: number | null
}

interface CatRow {
  category_code: string | null
  amount: number | null
}

interface MonthBucket {
  month: string // "2024-03"
  income: number
  expenses: number
}

// ── SVG bar chart ─────────────────────────────────────────────────────────────

function MonthlyChart({ data }: { data: MonthBucket[] }) {
  if (data.length === 0) return null

  const maxVal = Math.max(...data.flatMap((d) => [d.income, d.expenses]), 1)
  const chartH = 140
  const baseY = 160
  const barW = 14
  const barGap = 3
  const groupGap = 10
  const startX = 10

  const svgWidth = startX * 2 + data.length * (barW * 2 + barGap + groupGap)

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
      <p className="text-sm font-semibold text-zinc-200 mb-4 tracking-tight">Flujo mensual</p>
      <div className="flex gap-4 text-xs text-zinc-500 mb-3">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/70 inline-block" />
          Ingresos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-400/70 inline-block" />
          Gastos
        </span>
      </div>
      <svg
        viewBox={`0 0 ${svgWidth} 180`}
        width="100%"
        aria-label="Gráfico de ingresos y gastos por mes"
      >
        {data.map((d, i) => {
          const gx = startX + i * (barW * 2 + barGap + groupGap)
          const incH = Math.max(2, (d.income / maxVal) * chartH)
          const expH = Math.max(2, (d.expenses / maxVal) * chartH)
          const monthParts = d.month.split('-')
          const monthIdx = parseInt(monthParts[1] ?? '1') - 1
          const label = MONTH_LABELS[monthIdx] ?? d.month

          return (
            <g key={d.month}>
              {/* income bar */}
              <rect
                x={gx}
                y={baseY - incH}
                width={barW}
                height={incH}
                rx={2}
                fill="rgb(52 211 153 / 0.65)"
              />
              {/* expense bar */}
              <rect
                x={gx + barW + barGap}
                y={baseY - expH}
                width={barW}
                height={expH}
                rx={2}
                fill="rgb(251 113 133 / 0.65)"
              />
              {/* month label */}
              <text
                x={gx + barW}
                y={baseY + 14}
                textAnchor="middle"
                fontSize="9"
                fill="rgb(113 113 122)"
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
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
  const period = ['3m', 'ytd', '1y', 'all'].includes(params.period ?? '') ? (params.period ?? 'all') : 'all'
  const start = periodStart(period)

  // ── parallel queries ────────────────────────────────────────────────────────
  function applyDateFilter<T extends { gte: (col: string, val: string) => T }>(q: T): T {
    if (start) return q.gte('date', start)
    return q
  }

  const statsQueryBase = supabase
    .from('transactions')
    .select('movement_type, amount, date')
    .not('amount', 'is', null)

  const monthlyQueryBase = supabase
    .from('transactions')
    .select('movement_type, amount, date')
    .not('amount', 'is', null)
    .not('date', 'is', null)

  const recentQueryBase = supabase
    .from('transactions')
    .select('date, vendor, concept, category_code, movement_type, amount')
    .not('amount', 'is', null)
    .order('date', { ascending: false })
    .limit(6)

  const catQueryBase = supabase
    .from('transactions')
    .select('category_code, amount')
    .eq('movement_type', 'expense')
    .not('amount', 'is', null)
    .not('category_code', 'is', null)

  const [statsRes, monthlyRes, recentRes, catRes] = await Promise.all([
    start ? statsQueryBase.gte('date', start) : statsQueryBase,
    start ? monthlyQueryBase.gte('date', start) : monthlyQueryBase,
    start ? recentQueryBase.gte('date', start) : recentQueryBase,
    start ? catQueryBase.gte('date', start) : catQueryBase,
  ])

  // ── stats ───────────────────────────────────────────────────────────────────
  const raw: TxRow[] = (statsRes.data ?? []) as TxRow[]
  const income = raw.filter((r) => r.movement_type === 'income').reduce((s, r) => s + Number(r.amount), 0)
  const expenses = raw.filter((r) => r.movement_type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
  const net = income - expenses
  const savingsRate = income > 0 ? (net / income) * 100 : 0
  const txCount = raw.length

  // ── monthly buckets ─────────────────────────────────────────────────────────
  const monthMap: Record<string, MonthBucket> = {}
  for (const r of (monthlyRes.data ?? []) as TxRow[]) {
    if (!r.date) continue
    const key = r.date.slice(0, 7) // "2024-03"
    if (!monthMap[key]) monthMap[key] = { month: key, income: 0, expenses: 0 }
    if (r.movement_type === 'income') monthMap[key].income += Number(r.amount)
    if (r.movement_type === 'expense') monthMap[key].expenses += Number(r.amount)
  }
  const monthly = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))
  // show last 18 months max to keep chart readable
  const chartData = monthly.slice(-18)

  // ── categories ──────────────────────────────────────────────────────────────
  const catMap: Record<string, number> = {}
  for (const r of (catRes.data ?? []) as CatRow[]) {
    const k = r.category_code ?? 'Sin categoría'
    catMap[k] = (catMap[k] ?? 0) + Number(r.amount)
  }
  const topCategories = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const catMax = topCategories[0]?.[1] ?? 1

  // ── recent ──────────────────────────────────────────────────────────────────
  const recent = (recentRes.data ?? []) as RecentRow[]

  const movBadge: Record<string, { label: string; cls: string }> = {
    income: { label: 'Ingreso', cls: 'bg-emerald-500/10 text-emerald-400' },
    expense: { label: 'Gasto', cls: 'bg-rose-500/10 text-rose-400' },
    cash_withdrawal: { label: 'Efectivo', cls: 'bg-amber-500/10 text-amber-400' },
  }

  const amtColor: Record<string, string> = {
    income: 'text-emerald-400',
    expense: 'text-rose-400',
    cash_withdrawal: 'text-amber-400',
  }

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

        {/* Period pill group */}
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Ingresos */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ingresos</p>
          <p className="text-xl font-semibold text-emerald-400 tabular-nums">{fmt(income)}</p>
        </div>

        {/* Gastos */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Gastos</p>
          <p className="text-xl font-semibold text-rose-400 tabular-nums">{fmt(expenses)}</p>
        </div>

        {/* Balance neto */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Balance neto</p>
          <p className={`text-xl font-semibold tabular-nums ${net >= 0 ? 'text-blue-400' : 'text-amber-400'}`}>
            {fmt(net)}
          </p>
        </div>

        {/* Tasa de ahorro */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tasa de ahorro</p>
          <p className="text-xl font-semibold text-violet-400 tabular-nums">
            {savingsRate.toFixed(1)}%
          </p>
          <p className="text-xs text-zinc-600 -mt-1">{txCount.toLocaleString('es-CR')} movimientos</p>
        </div>
      </div>

      {/* Middle row: chart + categories */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {/* Monthly chart — col 3 */}
        <div className="col-span-3">
          <MonthlyChart data={chartData} />
        </div>

        {/* Top categories — col 2 */}
        <div className="col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
          <p className="text-sm font-semibold text-zinc-200 mb-4 tracking-tight">Top categorías</p>
          <div className="flex flex-col gap-3">
            {topCategories.length === 0 && (
              <p className="text-xs text-zinc-600">Sin datos</p>
            )}
            {topCategories.map(([cat, amount]) => {
              const pct = Math.round((amount / catMax) * 100)
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-zinc-400 truncate max-w-[110px]">{cat}</span>
                    <span className="text-zinc-300 tabular-nums shrink-0 ml-2">{fmt(amount)}</span>
                  </div>
                  <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500/40 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-zinc-200 tracking-tight">Movimientos recientes</h2>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {recent.length === 0 && (
            <p className="px-5 py-4 text-xs text-zinc-600">Sin movimientos</p>
          )}
          {recent.map((tx, i) => {
            const badge = movBadge[tx.movement_type ?? '']
            const color = amtColor[tx.movement_type ?? ''] ?? 'text-zinc-400'
            const sign = tx.movement_type === 'expense' ? '−' : tx.movement_type === 'income' ? '+' : ''
            return (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex items-center gap-3">
                  <span className="text-xs text-zinc-600 tabular-nums shrink-0 w-16">
                    {tx.date ? fmtDate(tx.date) : '—'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{tx.vendor ?? tx.concept ?? '—'}</p>
                    {tx.category_code && (
                      <p className="text-xs text-zinc-600 truncate">{tx.category_code}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {badge && (
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  )}
                  <p className={`text-sm font-medium tabular-nums ${color}`}>
                    {sign}{fmt(Number(tx.amount))}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
