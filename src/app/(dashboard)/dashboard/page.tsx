import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TrendingUp, TrendingDown, ArrowLeftRight, CalendarRange } from 'lucide-react'

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
    year: 'numeric',
  })
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [statsRes, recentRes, categoryRes] = await Promise.all([
    supabase.rpc('get_dashboard_stats'),
    supabase
      .from('transactions')
      .select('date, vendor, concept, category_code, movement_type, amount, currency_code')
      .not('amount', 'is', null)
      .order('date', { ascending: false })
      .limit(8),
    supabase
      .from('transactions')
      .select('category_code, amount')
      .eq('movement_type', 'expense')
      .not('amount', 'is', null)
      .not('category_code', 'is', null),
  ])

  // Fallback: compute stats client-side if RPC doesn't exist
  type StatsRow = { total_income: number; total_expenses: number; net: number; tx_count: number; earliest: string; latest: string }
  let stats: StatsRow | null = (statsRes.data?.[0] as unknown as StatsRow) ?? null

  if (!stats) {
    const { data: raw } = await supabase
      .from('transactions')
      .select('movement_type, amount, date')
      .not('amount', 'is', null)

    if (raw) {
      const income = raw.filter((r) => r.movement_type === 'income').reduce((s, r) => s + Number(r.amount), 0)
      const expenses = raw.filter((r) => r.movement_type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
      const dates = raw.map((r) => r.date).filter(Boolean).sort()
      stats = {
        total_income: income,
        total_expenses: expenses,
        net: income - expenses,
        tx_count: raw.length,
        earliest: dates[0] ?? '',
        latest: dates[dates.length - 1] ?? '',
      }
    }
  }

  // Top expense categories
  const catMap: Record<string, number> = {}
  for (const r of categoryRes.data ?? []) {
    const k = r.category_code ?? 'Sin categoría'
    catMap[k] = (catMap[k] ?? 0) + Number(r.amount)
  }
  const topCategories = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const kpis = [
    {
      label: 'Ingresos totales',
      value: fmt(stats?.total_income ?? 0),
      icon: <TrendingUp size={18} />,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
    },
    {
      label: 'Gastos totales',
      value: fmt(stats?.total_expenses ?? 0),
      icon: <TrendingDown size={18} />,
      color: 'text-rose-400',
      bg: 'bg-rose-400/10',
    },
    {
      label: 'Balance neto',
      value: fmt((stats?.total_income ?? 0) - (stats?.total_expenses ?? 0)),
      icon: <ArrowLeftRight size={18} />,
      color: (stats?.total_income ?? 0) >= (stats?.total_expenses ?? 0) ? 'text-blue-400' : 'text-amber-400',
      bg: (stats?.total_income ?? 0) >= (stats?.total_expenses ?? 0) ? 'bg-blue-400/10' : 'bg-amber-400/10',
    },
    {
      label: 'Transacciones',
      value: (stats?.tx_count ?? 0).toLocaleString('es-CR'),
      icon: <CalendarRange size={18} />,
      color: 'text-violet-400',
      bg: 'bg-violet-400/10',
    },
  ]

  const movementLabel: Record<string, string> = {
    income: 'Ingreso',
    expense: 'Gasto',
    cash_withdrawal: 'Efectivo',
  }

  const movementColor: Record<string, string> = {
    income: 'text-emerald-400',
    expense: 'text-rose-400',
    cash_withdrawal: 'text-amber-400',
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        {stats?.earliest && stats?.latest && (
          <p className="text-sm text-gray-500 mt-1">
            Datos: {fmtDate(stats.earliest)} — {fmtDate(stats.latest)}
            <span className="ml-2 text-xs text-amber-500/80">(backfill en progreso)</span>
          </p>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl bg-gray-900 border border-white/5 p-5 flex flex-col gap-3"
          >
            <div className={`w-8 h-8 rounded-lg ${kpi.bg} ${kpi.color} flex items-center justify-center`}>
              {kpi.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-xl font-semibold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Recent transactions */}
        <div className="lg:col-span-3 rounded-xl bg-gray-900 border border-white/5">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="text-sm font-medium text-gray-200">Transacciones recientes</h2>
          </div>
          <div className="divide-y divide-white/5">
            {(recentRes.data ?? []).map((tx, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 truncate">{tx.vendor ?? tx.concept ?? '—'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{tx.date ? fmtDate(tx.date) : '—'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-medium tabular-nums ${movementColor[tx.movement_type ?? ''] ?? 'text-gray-400'}`}>
                    {tx.movement_type === 'expense' ? '−' : tx.movement_type === 'income' ? '+' : ''}
                    {fmt(Number(tx.amount))}
                  </p>
                  <p className="text-xs text-gray-600">{movementLabel[tx.movement_type ?? ''] ?? tx.movement_type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top categories */}
        <div className="lg:col-span-2 rounded-xl bg-gray-900 border border-white/5">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="text-sm font-medium text-gray-200">Top categorías de gasto</h2>
          </div>
          <div className="p-5 flex flex-col gap-3">
            {topCategories.map(([cat, amount]) => {
              const max = topCategories[0][1]
              const pct = Math.round((amount / max) * 100)
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400 truncate max-w-[120px]">{cat}</span>
                    <span className="text-gray-300 tabular-nums">{fmt(amount)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500/60 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
