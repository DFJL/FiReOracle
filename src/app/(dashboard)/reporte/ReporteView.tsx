'use client'

import { useRouter } from 'next/navigation'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtPct(n: number, decimals = 1) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
}

type Props = {
  month: string
  cur: { income: number; expenses: number; net: number; netMargin: number }
  prev: { income: number; expenses: number; net: number; netMargin: number }
  yearAgo: { income: number; expenses: number; net: number; netMargin: number }
  topCategories: Array<{ code: string; name: string; amount: number; pct: number }>
  expenseByGroup: Record<string, number>
  nwStart: number | null
  nwEnd: number | null
  nwDelta: number | null
  nwDeltaPct: number | null
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-')
  return `${MONTH_NAMES[parseInt(m) - 1]} ${year}`
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function MoMBadge({ cur, prev, label }: { cur: number; prev: number; label: string }) {
  if (prev === 0) return null
  const pct = ((cur - prev) / prev) * 100
  const up = pct >= 0
  return (
    <p className={`text-xs mt-1 ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs {label}
    </p>
  )
}

export function ReporteView({
  month,
  cur,
  prev,
  yearAgo,
  topCategories,
  nwStart,
  nwEnd,
  nwDelta,
  nwDeltaPct,
}: Props) {
  const router = useRouter()
  const curYM = currentYearMonth()
  const isCurrentOrFuture = month >= curYM

  const prevM = prevMonth(month)
  const nextM = nextMonth(month)

  // Prev month label (for MoM badge)
  const prevMonthLabel = monthLabel(prevM).split(' ')[0].toLowerCase()

  // Insights
  const insights: string[] = []
  if (cur.netMargin > 40) insights.push('Excelente margen neto este mes 🌟')
  else if (cur.netMargin > 30) insights.push('Margen neto saludable')
  else if (cur.netMargin < 0) insights.push('Mes con déficit de flujo')

  if (prev.expenses > 0 && cur.expenses > prev.expenses * 1.1)
    insights.push('Tus gastos subieron más de 10% vs el mes pasado')
  if (prev.income > 0 && cur.income > prev.income * 1.05)
    insights.push('Ingresos más altos que el mes pasado')
  if (nwDelta !== null && nwDelta > 0)
    insights.push('Tu patrimonio creció este mes')

  // Ratio bar
  const totalFlow = cur.income + cur.expenses
  const incomeBarPct = totalFlow > 0 ? (cur.income / totalFlow) * 100 : 50
  const expenseBarPct = totalFlow > 0 ? (cur.expenses / totalFlow) * 100 : 50

  // Top categories bar scale
  const maxCatAmt = topCategories.length > 0 ? topCategories[0].amount : 1

  // YoY changes
  const yoyIncomePct =
    yearAgo.income > 0 ? ((cur.income - yearAgo.income) / yearAgo.income) * 100 : null
  const yoyExpensesPct =
    yearAgo.expenses > 0 ? ((cur.expenses - yearAgo.expenses) / yearAgo.expenses) * 100 : null

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">

      {/* Section 1: Header + Month Nav */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/reporte?month=${prevM}`)}
            className="text-zinc-500 hover:text-white p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
            aria-label="Mes anterior"
          >
            ←
          </button>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">
            {monthLabel(month)}
          </h1>
          <button
            onClick={() => router.push(`/reporte?month=${nextM}`)}
            disabled={isCurrentOrFuture}
            className="text-zinc-500 hover:text-white p-2 rounded-lg hover:bg-white/[0.04] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Mes siguiente"
          >
            →
          </button>
        </div>
        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.18em]">
          Tu resumen mensual
        </p>
      </div>

      {/* Section 2: Income vs Expenses */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] mb-2">
            Ingresos
          </p>
          <p className="text-3xl font-black text-emerald-400 tabular-nums">
            {fmtCRC(cur.income)}
          </p>
          <MoMBadge cur={cur.income} prev={prev.income} label={prevMonthLabel} />
        </div>

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] mb-2">
            Gastos
          </p>
          <p className="text-3xl font-black text-rose-400 tabular-nums">
            {fmtCRC(cur.expenses)}
          </p>
          <MoMBadge cur={cur.expenses} prev={prev.expenses} label={prevMonthLabel} />
        </div>
      </div>

      {/* Section 3: Net + Savings Rate */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] mb-2">
              Flujo neto
            </p>
            <p
              className={`text-4xl font-black tabular-nums ${
                cur.net >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {fmtCRC(cur.net)}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] mb-2">
              Margen
            </p>
            <p className="text-4xl font-black text-[#a3e635] tabular-nums">
              {cur.netMargin.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Ratio bar */}
        <div className="mt-5">
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            <div
              className="h-full bg-emerald-500/60 rounded-l-full transition-all"
              style={{ width: `${incomeBarPct.toFixed(1)}%` }}
            />
            <div
              className="h-full bg-rose-500/60 rounded-r-full transition-all"
              style={{ width: `${expenseBarPct.toFixed(1)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[9px] text-zinc-600">
            <span>Ingresos {incomeBarPct.toFixed(0)}%</span>
            <span>Gastos {expenseBarPct.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Section 4: Top gastos */}
      {topCategories.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] mb-4">
            En qué gastaste
          </p>
          <div className="space-y-3">
            {topCategories.map((cat) => {
              const barWidth = (cat.amount / maxCatAmt) * 100
              return (
                <div key={cat.code}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-300">{cat.name}</span>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span className="text-xs text-zinc-400">{fmtCRC(cat.amount)}</span>
                      <span className="text-[10px] text-zinc-600 w-10 text-right">
                        {cat.pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-[#a3e635]/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#a3e635] rounded-full transition-all"
                      style={{ width: `${barWidth.toFixed(1)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Section 5: 2-column grid — NW + YoY */}
      <div className="grid grid-cols-2 gap-4">
        {/* NW card */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] mb-3">
            Patrimonio este mes
          </p>
          {nwDelta !== null ? (
            <>
              <p
                className={`text-3xl font-black tabular-nums ${
                  nwDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {nwDelta >= 0 ? '+' : ''}{fmtCRC(nwDelta)}
              </p>
              {nwDeltaPct !== null && (
                <p
                  className={`text-sm font-bold mt-1 tabular-nums ${
                    nwDeltaPct >= 0 ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {fmtPct(nwDeltaPct)}
                </p>
              )}
              {nwStart !== null && nwEnd !== null && (
                <p className="text-[9px] text-zinc-600 mt-2 tabular-nums">
                  {fmtCRC(nwStart)} → {fmtCRC(nwEnd)}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-600 mt-2">— Sin datos de snapshot</p>
          )}
        </div>

        {/* YoY card */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] mb-3">
            Vs hace un año
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Ingresos</span>
              {yoyIncomePct !== null ? (
                <span
                  className={`text-xs font-bold tabular-nums ${
                    yoyIncomePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {fmtPct(yoyIncomePct)}
                </span>
              ) : (
                <span className="text-xs text-zinc-600">—</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Gastos</span>
              {yoyExpensesPct !== null ? (
                <span
                  className={`text-xs font-bold tabular-nums ${
                    yoyExpensesPct >= 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {fmtPct(yoyExpensesPct)}
                </span>
              ) : (
                <span className="text-xs text-zinc-600">—</span>
              )}
            </div>
            <div className="pt-1 border-t border-white/[0.04]">
              <p className="text-[9px] text-zinc-600 mb-1">Margen</p>
              {yearAgo.income > 0 ? (
                <p className="text-xs text-zinc-400 tabular-nums">
                  <span className="text-white font-bold">{cur.netMargin.toFixed(1)}%</span>
                  {' '}→ hace 1a:{' '}
                  <span className="text-zinc-500">{yearAgo.netMargin.toFixed(1)}%</span>
                </p>
              ) : (
                <p className="text-xs text-zinc-600">— Sin datos</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 6: Insights */}
      {insights.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] mb-4">
            Tu mes en perspectiva
          </p>
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-[#a3e635] mt-px shrink-0">•</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}
