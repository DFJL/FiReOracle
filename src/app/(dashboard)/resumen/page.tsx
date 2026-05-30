import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InteractiveSection, TxClient } from './InteractiveSection'
import { isLoanPayment, SAVINGS_EXPENSE_GROUP } from './categoryUtils'

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
    case '3m':  return 'Últimos 3 meses'
    case 'ytd': return 'Este año'
    case '1y':  return 'Último año'
    default:    return 'Todo el tiempo'
  }
}

function periodStart(code: string): string | null {
  const now = new Date()
  if (code === '3m') {
    const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10)
  }
  if (code === 'ytd') return `${now.getFullYear()}-01-01`
  if (code === '1y') {
    const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10)
  }
  return null
}

// ── page ──────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function ResumenPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const period = ['3m', 'ytd', '1y', 'all'].includes(params.period ?? '')
    ? (params.period ?? 'all')
    : 'all'
  const start = periodStart(period)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawTx } = await (supabase as any).rpc('get_user_transactions', {
    p_user_id: user.id,
    p_start_date: start ?? null,
  })
  const transactions = (rawTx ?? []) as TxClient[]

  // ── KPI stats — liquidity only ─────────────────────────────────────────────
  let income = 0, passiveIncome = 0, expenses = 0, invested = 0
  for (const t of transactions) {
    if (!t.movement_type) continue  // skip unrealized crypto valuations
    const amt = Number(t.amount ?? 0)
    if (t.movement_type === 'income' && !t.is_settlement) {
      income += amt
      if (t.is_passive_income) passiveIncome += amt
    } else if (t.movement_type === 'expense' || t.movement_type === 'cash_withdrawal') {
      if (t.expense_group !== SAVINGS_EXPENSE_GROUP) {
        expenses += amt
      } else if (isLoanPayment(t.vendor, t.concept, t.category_code)) {
        expenses += amt
      } else {
        invested += amt
      }
    }
  }
  const net = income - expenses
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0

  const periods = [
    { code: 'all', label: 'Todo' },
    { code: 'ytd', label: 'Este año' },
    { code: '1y',  label: '12 meses' },
    { code: '3m',  label: '3 meses' },
  ]

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
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
                period === p.code ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <a href="/movimientos?tab=income"
          className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3 hover:bg-white/[0.05] hover:border-emerald-500/20 transition-colors group">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400">Ingresos</p>
          <p className="text-xl font-semibold text-emerald-400 tabular-nums">{fmt(income)}</p>
          {passiveIncome > 0 && <p className="text-xs text-zinc-600">{fmt(passiveIncome)} pasivo</p>}
          <p className="text-xs text-zinc-700 group-hover:text-zinc-600">Ver detalle →</p>
        </a>

        <a href="/movimientos?tab=expense"
          className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3 hover:bg-white/[0.05] hover:border-rose-500/20 transition-colors group">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400">Gastos</p>
          <p className="text-xl font-semibold text-rose-400 tabular-nums">{fmt(expenses)}</p>
          <p className="text-xs text-zinc-700 group-hover:text-zinc-600">Ver detalle →</p>
        </a>

        <a href="/movimientos"
          className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3 hover:bg-white/[0.05] hover:border-blue-500/20 transition-colors group">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400">Balance neto</p>
          <p className={`text-xl font-semibold tabular-nums ${net >= 0 ? 'text-blue-400' : 'text-amber-400'}`}>{fmt(net)}</p>
          <p className="text-xs text-zinc-700 group-hover:text-zinc-600">{transactions.length.toLocaleString('es-CR')} movimientos →</p>
        </a>

        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tasa de ahorro</p>
          <p className="text-xl font-semibold text-violet-400 tabular-nums">{savingsRate.toFixed(1)}%</p>
          {invested > 0 && <p className="text-xs text-zinc-600">+{fmt(invested)} a objetivos</p>}
          <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
            <div className="h-full bg-violet-500/50 rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, savingsRate))}%` }} />
          </div>
        </div>
      </div>

      {/* Interactive breakdown — chart + 3-level drilldown all in one reactive component */}
      <InteractiveSection transactions={transactions} />
    </div>
  )
}
