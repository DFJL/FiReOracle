'use client'

type LifestyleGroup = {
  group: string
  label: string
  cur: number
  prv: number
  pctChange: number | null
}

type Props = {
  inflationRate: number
  totalCur: number
  totalPrv: number
  byGroup: LifestyleGroup[]
}

function fmtCRC(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `₡${(n / 1_000).toFixed(0)}K`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

export function LifestyleInflationSection({ inflationRate, totalCur, totalPrv, byGroup }: Props) {
  const totalPct = totalPrv > 0 ? (totalCur - totalPrv) / totalPrv : null
  const delta    = totalPct !== null ? totalPct - inflationRate : null

  const isBad  = delta !== null && delta >= 0.05
  const isWarn = delta !== null && delta >= 0 && delta < 0.05
  const isGood = delta !== null && delta < 0

  const signalColor = isBad ? '#f43f5e' : isWarn ? '#f59e0b' : '#a3e635'
  const signalLabel = isBad ? 'Alerta' : isWarn ? 'Atención' : 'Óptimo'

  const maxAbsPct = byGroup.reduce((m, g) =>
    g.pctChange !== null ? Math.max(m, Math.abs(g.pctChange)) : m,
    Math.abs(inflationRate) * 1.5 + 0.01
  )

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-0.5">
            Inflación de Estilo de Vida
          </p>
          <p className="text-[9px] text-zinc-600">Gastos últimos 12m vs período anterior</p>
        </div>
        <span
          className="shrink-0 text-[9px] font-black px-2 py-1 rounded-full"
          style={{ backgroundColor: `${signalColor}22`, color: signalColor }}
        >
          {signalLabel}
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider mb-1">Crecimiento gastos</p>
          <p className={`text-2xl font-black leading-none ${
            totalPct === null ? 'text-zinc-500'
            : totalPct > inflationRate ? 'text-rose-400' : 'text-[#a3e635]'
          }`}>
            {totalPct !== null
              ? `${totalPct >= 0 ? '+' : ''}${(totalPct * 100).toFixed(1)}%`
              : '—'}
          </p>
          <p className="text-[9px] text-zinc-600 mt-0.5">{fmtCRC(totalCur)}/año</p>
        </div>

        <div className="bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider mb-1">Inflación config</p>
          <p className="text-2xl font-black leading-none text-zinc-300">
            {(inflationRate * 100).toFixed(1)}%
          </p>
          <p className="text-[9px] text-zinc-600 mt-0.5">referencia anual</p>
        </div>

        <div className="bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider mb-1">Delta</p>
          <p className="text-2xl font-black leading-none" style={{ color: signalColor }}>
            {delta !== null
              ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`
              : '—'}
          </p>
          <p className="text-[9px] text-zinc-600 mt-0.5">
            {isGood ? 'poder adquisitivo ↑' : isBad ? 'erosión de ahorro' : 'dentro del rango'}
          </p>
        </div>
      </div>

      {/* Bar chart by group */}
      {byGroup.length > 0 && (
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-3">Por grupo de gasto</p>
          <div className="space-y-3">
            {byGroup.map(g => {
              const pct = g.pctChange
              if (pct === null) return null
              const barPct     = Math.min(Math.abs(pct) / maxAbsPct, 1) * 100
              const aboveInf   = pct > inflationRate
              const barColor   = aboveInf ? '#f43f5e' : pct >= 0 ? '#f59e0b' : '#a3e635'
              const infBarPct  = Math.min(inflationRate / maxAbsPct, 1) * 100
              return (
                <div key={g.group}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-semibold text-zinc-400">{g.label}</p>
                    <div className="flex items-center gap-3">
                      <p className="text-[9px] text-zinc-600">{fmtCRC(g.cur)}/año</p>
                      <p className="text-[10px] font-black tabular-nums" style={{ color: barColor }}>
                        {pct >= 0 ? '+' : ''}{(pct * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  {/* Bar + inflation reference line */}
                  <div className="relative h-2 bg-white/[0.05] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barPct}%`, backgroundColor: barColor, opacity: 0.65 }}
                    />
                    {/* Inflation tick */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-zinc-500/60"
                      style={{ left: `${infBarPct}%` }}
                    />
                  </div>
                </div>
              )
            })}

            <div className="flex items-center gap-2 pt-1">
              <div className="w-4 h-0.5 bg-zinc-500/60 rounded" />
              <p className="text-[9px] text-zinc-600">
                Referencia inflación: {(inflationRate * 100).toFixed(0)}%
                {totalPrv > 0 && ` · Año anterior: ${fmtCRC(totalPrv)}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {totalPrv === 0 && (
        <p className="text-[10px] text-zinc-600 text-center py-2">
          Sin datos del período anterior para comparar.
        </p>
      )}
    </div>
  )
}
