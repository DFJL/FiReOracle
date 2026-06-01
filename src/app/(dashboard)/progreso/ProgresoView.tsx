'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import type { ExchangeRate } from '@/lib/exchange-rate'

type Props = {
  activosInvertibles: number
  liquidBalance: number
  totalInvested: number
  fireNumber: number
  leanFireNumber: number
  fireProgress: number
  runway: number
  avgMonthlyExpenses: number
  avgMonthlySurvivalExpenses: number
  avgMonthlyIncome: number
  avgMonthlyDeposits: number
  passiveIncome12m: number
  realizedReturnRate: number | null
  forecastYears: { year: number; balance: number }[]
  snapshots: { snapshot_date: string; net_worth_crc: number; invested_crc: number; liquid_crc: number }[]
  exchangeRate: ExchangeRate
  fireConfig: { swr: number; targetExp: number; expReturn: number; inflation: number }
  runwayGreen: number
  runwayYellow: number
}

function fmtAmt(v: number, curr: 'CRC' | 'USD', rate: number) {
  const val = curr === 'CRC' ? v : v / rate
  const sym = curr === 'CRC' ? '₡' : '$'
  const abs = Math.abs(val)
  if (abs >= 1_000_000) return `${sym}${(val / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sym}${Math.round(val / 1_000)}K`
  return `${sym}${Math.round(val).toLocaleString()}`
}

export function ProgresoView({
  activosInvertibles, liquidBalance, totalInvested,
  fireNumber, leanFireNumber, fireProgress, runway,
  avgMonthlyExpenses, avgMonthlySurvivalExpenses, avgMonthlyIncome, avgMonthlyDeposits,
  passiveIncome12m, realizedReturnRate,
  forecastYears, snapshots, exchangeRate,
  fireConfig, runwayGreen, runwayYellow,
}: Props) {
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('USD')
  const rate = exchangeRate.sell
  const fmt  = (v: number) => fmtAmt(v, currency, rate)

  // Savings rate = investment deposits / total income
  const savingsRate    = avgMonthlyIncome > 0 ? Math.min(avgMonthlyDeposits / avgMonthlyIncome, 1) : 0
  const monthlySavings = avgMonthlyDeposits

  const passiveMonthlyAvg = passiveIncome12m / 12
  const fiRatio = avgMonthlyExpenses > 0 ? passiveMonthlyAvg / avgMonthlyExpenses : 0
  const fsRatio = avgMonthlySurvivalExpenses > 0 ? passiveMonthlyAvg / avgMonthlySurvivalExpenses : 0

  const runwayColor =
    runway >= runwayGreen  ? '#a3e635' :
    runway >= runwayYellow ? '#f59e0b' : '#f43f5e'

  const yearsToFire = forecastYears.length > 1
    ? forecastYears.find(p => p.balance >= fireNumber)?.year ?? null
    : null

  // Alert signals
  const alerts: { level: 'danger' | 'warning'; msg: string }[] = []
  if (runway < runwayYellow && avgMonthlyExpenses > 0) {
    alerts.push({ level: 'danger', msg: `Runway crítico: ${runway.toFixed(1)} meses de liquidez` })
  } else if (runway < runwayGreen && avgMonthlyExpenses > 0) {
    alerts.push({ level: 'warning', msg: `Runway bajo: ${runway.toFixed(1)} meses — meta: ${runwayGreen}m` })
  }
  if (realizedReturnRate !== null && realizedReturnRate < fireConfig.inflation) {
    alerts.push({
      level: 'warning',
      msg: `Rendimiento (${(realizedReturnRate * 100).toFixed(1)}%) por debajo de inflación (${(fireConfig.inflation * 100).toFixed(0)}%)`,
    })
  }
  if (savingsRate < 0.05 && avgMonthlyIncome > 0) {
    alerts.push({ level: 'warning', msg: `Tasa de ahorro muy baja: ${(savingsRate * 100).toFixed(0)}%` })
  }

  // Radial progress ring
  const R      = 54
  const circ   = 2 * Math.PI * R
  const pct    = Math.min(fireProgress, 1)
  const offset = circ * (1 - pct)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Independencia Financiera</p>
          <h1 className="text-xl font-black text-white">Progreso FIRE</h1>
        </div>
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-1 border border-white/[0.06]">
          {(['CRC', 'USD'] as const).map(c => (
            <button key={c} onClick={() => setCurrency(c)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                currency === c ? 'bg-[#a3e635] text-black' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              {c === 'CRC' ? '₡' : '$'}
            </button>
          ))}
        </div>
      </div>

      {/* FIRE config missing banner */}
      {fireNumber === 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-[#a3e635]/[0.06] border border-[#a3e635]/20">
          <p className="text-xs text-zinc-300">
            <span className="font-bold text-[#a3e635]">FIRE Number no configurado</span>
            {' '}— definí tu gasto mensual objetivo en retiro para ver el anillo, hitos y proyección.
          </p>
          <Link href="/configuracion"
            className="shrink-0 px-3 py-1.5 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] transition-colors">
            Configurar
          </Link>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs border ${
              a.level === 'danger'
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}>
              <span className="shrink-0">{a.level === 'danger' ? '⚠' : '⚡'}</span>
              <span>{a.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Hero card: radial progress + numbers — only when FIRE configured */}
      {fireNumber > 0 && <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">

          {/* Ring */}
          <div className="relative shrink-0">
            <svg width="148" height="148" className="-rotate-90">
              <circle cx="74" cy="74" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14" />
              <circle
                cx="74" cy="74" r={R} fill="none"
                stroke="#a3e635" strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
              <p className="text-[28px] font-black text-white leading-none">{(pct * 100).toFixed(1)}%</p>
              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">FIRE</p>
            </div>
          </div>

          {/* Right side numbers */}
          <div className="flex-1 w-full space-y-5 text-center sm:text-left">
            <div>
              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-0.5">Activos Invertibles</p>
              <p className="text-4xl font-black text-white">{fmt(activosInvertibles)}</p>
              <p className="text-[10px] text-zinc-600 mt-1">
                Líquido {fmt(liquidBalance)} · Invertido {fmt(totalInvested)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em] mb-0.5">FIRE Number</p>
                <p className="text-lg font-bold text-zinc-300">{fmt(fireNumber)}</p>
                <p className="text-[10px] text-zinc-600">
                  {fmt(fireConfig.targetExp)}/mes · {(fireConfig.swr * 100).toFixed(1)}% SWR
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em] mb-0.5">
                  {fireProgress >= 1 ? 'Alcanzado 🎯' : 'Falta'}
                </p>
                <p className={`text-lg font-bold ${fireProgress >= 1 ? 'text-[#a3e635]' : 'text-rose-400'}`}>
                  {fireProgress >= 1 ? fmt(activosInvertibles - fireNumber) : fmt(fireNumber - activosInvertibles)}
                </p>
                {yearsToFire !== null && yearsToFire > 0 && (
                  <p className="text-[10px] text-zinc-500">~{yearsToFire} {yearsToFire === 1 ? 'año' : 'años'}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>}

      {/* FIRE milestones */}
      {fireNumber > 0 && (
        <MilestoneStrip
          activosInvertibles={activosInvertibles}
          liquidBalance={liquidBalance}
          fireNumber={fireNumber}
          leanFireNumber={leanFireNumber}
          avgMonthlyExpenses={avgMonthlyExpenses}
          fmt={fmt}
        />
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

        <KpiCard
          label="Runway"
          value={runway >= 999 ? '∞' : runway.toFixed(1)}
          unit="meses"
          sub={`${fmt(avgMonthlyExpenses)}/mes`}
          color={runwayColor}
        />

        <KpiCard
          label="Rendimiento real"
          value={realizedReturnRate !== null ? `${(realizedReturnRate * 100).toFixed(1)}%` : '—'}
          unit={realizedReturnRate !== null ? '/ año' : 'sin datos'}
          sub={
            realizedReturnRate !== null
              ? `vs ${(fireConfig.inflation * 100).toFixed(0)}% inflación · ${(fireConfig.expReturn * 100).toFixed(0)}% meta`
              : `meta: ${(fireConfig.expReturn * 100).toFixed(0)}%`
          }
          color={
            realizedReturnRate === null ? '#71717a' :
            realizedReturnRate >= fireConfig.expReturn ? '#a3e635' :
            realizedReturnRate >= fireConfig.inflation ? '#f59e0b' : '#f43f5e'
          }
        />

        <KpiCard
          label="Tasa de ahorro"
          value={`${(savingsRate * 100).toFixed(0)}%`}
          unit="últimos 12m"
          sub={`${fmt(monthlySavings)}/mes aportado`}
          color="#60a5fa"
        />

        <KpiCard
          label="Ingreso pasivo"
          value={fmt(passiveMonthlyAvg)}
          unit="/mes promedio"
          sub={`${fmt(passiveIncome12m)}/año`}
          color="#84cc16"
        />

        <KpiCard
          label="Independencia (FI)"
          value={`${(fiRatio * 100).toFixed(0)}%`}
          unit="pasivo / gastos totales"
          sub={avgMonthlyExpenses > 0 ? `meta: ${fmt(avgMonthlyExpenses)}/mes` : 'sin datos'}
          color={fiRatio >= 1 ? '#a3e635' : fiRatio >= 0.5 ? '#f59e0b' : '#71717a'}
        />

        <KpiCard
          label="Seguridad (FS)"
          value={avgMonthlySurvivalExpenses > 0 ? `${(fsRatio * 100).toFixed(0)}%` : '—'}
          unit="pasivo / gastos básicos"
          sub={avgMonthlySurvivalExpenses > 0 ? `básico: ${fmt(avgMonthlySurvivalExpenses)}/mes` : 'marcá gastos básicos'}
          color={fsRatio >= 1 ? '#a3e635' : fsRatio >= 0.75 ? '#f59e0b' : '#71717a'}
        />
      </div>

      {/* Combined historical + forecast chart */}
      {/* Combined chart — show historical even without FIRE config, forecast only when configured */}
      <CombinedChart
        snapshots={snapshots}
        forecast={fireNumber > 0 ? forecastYears : []}
        fireNumber={fireNumber}
        leanFireNumber={leanFireNumber}
        currency={currency}
        rate={rate}
      />

      {/* FU Money chart */}
      <FuMoneyChart
        snapshots={snapshots}
        avgMonthlyExpenses={avgMonthlyExpenses}
        runwayGreen={runwayGreen}
        runwayYellow={runwayYellow}
        currency={currency}
        rate={rate}
      />

      {/* Footer hint */}
      {fireNumber > 0 && (
        <p className="text-[10px] text-zinc-700 text-center pb-2">
          Proyección: {(fireConfig.expReturn * 100).toFixed(0)}% retorno anual ·{' '}
          {fmt(monthlySavings)}/mes aportado ·{' '}
          <Link href="/configuracion" className="underline hover:text-zinc-500 transition-colors">
            ajustar parámetros
          </Link>
        </p>
      )}
    </div>
  )
}

function KpiCard({ label, value, unit, sub, color }: {
  label: string; value: string; unit: string; sub: string; color: string
}) {
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
      <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-2">{label}</p>
      <p className="text-2xl font-black leading-none" style={{ color }}>{value}</p>
      <p className="text-[10px] text-zinc-500 mt-1">{unit}</p>
      <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>
    </div>
  )
}

function MilestoneStrip({
  activosInvertibles, liquidBalance, fireNumber, leanFireNumber,
  avgMonthlyExpenses, fmt,
}: {
  activosInvertibles: number
  liquidBalance: number
  fireNumber: number
  leanFireNumber: number
  avgMonthlyExpenses: number
  fmt: (v: number) => string
}) {
  const fuTarget = avgMonthlyExpenses * 12

  const milestones = [
    {
      label: 'FU Money',
      desc: '12m líquido',
      target: fuTarget,
      current: liquidBalance,
      color: '#f59e0b',
    },
    leanFireNumber > 0 ? {
      label: 'Lean FI',
      desc: 'gastos básicos',
      target: leanFireNumber,
      current: activosInvertibles,
      color: '#22d3ee',
    } : null,
    {
      label: 'Half FI',
      desc: '50% del FIRE',
      target: fireNumber * 0.5,
      current: activosInvertibles,
      color: '#60a5fa',
    },
    {
      label: 'Full FI',
      desc: '100% FIRE',
      target: fireNumber,
      current: activosInvertibles,
      color: '#a3e635',
    },
  ].filter((m): m is NonNullable<typeof m> => m !== null && m.target > 0)

  return (
    <div>
      <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-3">Hitos FIRE</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {milestones.map(m => {
          const pct     = Math.min(m.current / m.target, 1)
          const achieved = pct >= 1
          return (
            <div
              key={m.label}
              className={`bg-white/[0.03] rounded-xl border p-4 ${
                achieved ? 'border-[#a3e635]/25' : 'border-white/[0.06]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.1em]">{m.label}</p>
                {achieved && (
                  <span className="text-[8px] font-bold text-[#a3e635] bg-[#a3e635]/10 px-1.5 py-0.5 rounded-full">✓</span>
                )}
              </div>
              <p className="text-[9px] text-zinc-600 mb-3">{m.desc}</p>

              {/* Progress bar */}
              <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mb-2">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct * 100}%`,
                    backgroundColor: achieved ? '#a3e635' : m.color,
                  }}
                />
              </div>

              <p className="text-sm font-black leading-none" style={{ color: achieved ? '#a3e635' : m.color }}>
                {(pct * 100).toFixed(0)}%
              </p>
              {!achieved ? (
                <p className="text-[9px] text-zinc-600 mt-0.5">falta {fmt(m.target - m.current)}</p>
              ) : (
                <p className="text-[9px] text-[#a3e635]/60 mt-0.5">alcanzado</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FuMoneyChart({
  snapshots, avgMonthlyExpenses, runwayGreen, runwayYellow, currency, rate,
}: {
  snapshots: { snapshot_date: string; net_worth_crc: number; invested_crc: number; liquid_crc: number }[]
  avgMonthlyExpenses: number
  runwayGreen: number
  runwayYellow: number
  currency: 'CRC' | 'USD'
  rate: number
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  if (avgMonthlyExpenses <= 0) return null

  const points = snapshots
    .filter(s => s.liquid_crc > 0)
    .map(s => ({
      ms: new Date(s.snapshot_date + 'T12:00:00').getTime(),
      months: s.liquid_crc / avgMonthlyExpenses,
      liquid: s.liquid_crc,
    }))
    .sort((a, b) => a.ms - b.ms)

  if (points.length < 2) return null

  const W = 800, H = 160
  const padL = 44, padR = 20, padT = 16, padB = 36
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const minMs   = points[0].ms
  const maxMs   = points[points.length - 1].ms
  const msRange = maxMs - minMs

  const maxMonths = Math.max(...points.map(p => p.months), runwayGreen + 2)
  const xOf = (ms: number)     => padL + ((ms - minMs) / msRange) * chartW
  const yOf = (v: number)      => padT + chartH - (Math.min(v, maxMonths * 1.1) / (maxMonths * 1.1)) * chartH

  const linePath = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${xOf(p.ms).toFixed(1)},${yOf(p.months).toFixed(1)}`
  ).join(' ')

  const fmtDate = (ms: number) => {
    const d = new Date(ms)
    return `${d.toLocaleString('es', { month: 'short' })} ${d.getFullYear()}`
  }

  const sym = currency === 'CRC' ? '₡' : '$'
  const fmtLiquid = (v: number) => {
    const val = currency === 'CRC' ? v : v / rate
    const abs = Math.abs(val)
    if (abs >= 1_000_000) return `${sym}${(val / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sym}${(val / 1_000).toFixed(0)}K`
    return `${sym}${Math.round(val)}`
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const targetMs = minMs + ((svgX - padL) / chartW) * msRange
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(p.ms - targetMs) < Math.abs(points[best].ms - targetMs)) best = i
    })
    setHoverIdx(best)
  }

  const startYear = new Date(minMs).getFullYear()
  const endYear   = new Date(maxMs).getFullYear()
  const xLabels: { x: number; label: string }[] = []
  for (let y = startYear + 1; y <= endYear; y++) {
    const ms = new Date(y, 0, 1).getTime()
    if (ms >= minMs && ms <= maxMs) xLabels.push({ x: xOf(ms), label: String(y) })
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Meses de FU Money</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">Liquidez / gasto mensual promedio — histórico</p>
        </div>
        {hovered && (
          <span className="text-[10px] text-zinc-300">
            {fmtDate(hovered.ms)}:{' '}
            <span className="font-bold" style={{
              color: hovered.months >= runwayGreen ? '#a3e635' :
                     hovered.months >= runwayYellow ? '#f59e0b' : '#f43f5e'
            }}>
              {hovered.months.toFixed(1)}m
            </span>
            <span className="text-zinc-600 ml-1">({fmtLiquid(hovered.liquid)})</span>
          </span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 140 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Threshold lines */}
        {[
          { v: runwayGreen,  color: '#a3e635', label: `${runwayGreen}m verde` },
          { v: runwayYellow, color: '#f59e0b', label: `${runwayYellow}m amarillo` },
        ].filter(t => t.v <= maxMonths * 1.1).map(t => (
          <g key={t.label}>
            <line x1={padL} x2={W - padR} y1={yOf(t.v)} y2={yOf(t.v)}
              stroke={t.color} strokeWidth={1} strokeDasharray="5 3" opacity={0.35} />
            <text x={W - padR - 2} y={yOf(t.v) - 3} textAnchor="end" fontSize={8} fill={t.color} opacity={0.6}>
              {t.label}
            </text>
          </g>
        ))}

        {/* Y ticks */}
        {[0, Math.round(maxMonths * 0.5), Math.round(maxMonths)].map(v => (
          <text key={v} x={padL - 5} y={yOf(v) + 4} textAnchor="end" fontSize={8} fill="#52525b">
            {v}m
          </text>
        ))}

        {/* Area fill */}
        <defs>
          <linearGradient id="fu-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${linePath} L${xOf(maxMs).toFixed(1)},${padT + chartH} L${padL},${padT + chartH} Z`}
          fill="url(#fu-grad)"
        />

        {/* Line — color by current threshold */}
        <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Hover crosshair */}
        {hovered && (
          <g>
            <line x1={xOf(hovered.ms)} x2={xOf(hovered.ms)} y1={padT} y2={padT + chartH}
              stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            <circle cx={xOf(hovered.ms)} cy={yOf(hovered.months)} r={4}
              fill={hovered.months >= runwayGreen ? '#a3e635' : hovered.months >= runwayYellow ? '#f59e0b' : '#f43f5e'}
              stroke="#080c08" strokeWidth={2} />
          </g>
        )}

        {/* X labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - padB + 20} textAnchor="middle" fontSize={9} fill="#52525b">
            {l.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

function CombinedChart({
  snapshots, forecast, fireNumber, leanFireNumber, currency, rate,
}: {
  snapshots: { snapshot_date: string; net_worth_crc: number; invested_crc: number; liquid_crc: number }[]
  forecast: { year: number; balance: number }[]
  fireNumber: number
  leanFireNumber: number
  currency: 'CRC' | 'USD'
  rate: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverMs, setHoverMs] = useState<number | null>(null)

  const W = 800, H = 260
  const padL = 60, padR = 20, padT = 16, padB = 40
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const convert  = (v: number) => currency === 'CRC' ? v : v / rate
  const sym      = currency === 'CRC' ? '₡' : '$'
  const fmtV     = (v: number) => {
    const val = convert(v)
    const abs = Math.abs(val)
    if (abs >= 1_000_000) return `${sym}${(val / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sym}${(val / 1_000).toFixed(0)}K`
    return `${sym}${Math.round(val)}`
  }

  const now = new Date()

  // Historical points — use net_worth_crc so scale matches the forecast
  const histPoints = snapshots
    .filter(s => s.net_worth_crc > 0)
    .map(s => ({ ms: new Date(s.snapshot_date + 'T12:00:00').getTime(), val: s.net_worth_crc }))
    .sort((a, b) => a.ms - b.ms)

  // Forecast points — anchor year 0 at today
  const forecastPoints = forecast.map(p => ({
    ms: new Date(now.getFullYear() + p.year, now.getMonth(), 15).getTime(),
    val: p.balance,
  }))

  const allMs = [...histPoints.map(p => p.ms), ...forecastPoints.map(p => p.ms)]
  if (allMs.length < 2) return null

  const minMs    = Math.min(...allMs)
  const maxMs    = Math.max(...allMs)
  const msRange  = maxMs - minMs

  const maxVal = Math.max(
    ...histPoints.map(p => p.val),
    ...forecastPoints.map(p => p.val),
    fireNumber,
  ) * 1.1

  const xOf = (ms: number)  => padL + ((ms - minMs) / msRange) * chartW
  const yOf = (val: number) => padT + chartH - (Math.max(val, 0) / maxVal) * chartH

  const nowX = xOf(now.getTime())

  // SVG paths
  const histPath = histPoints.length >= 2
    ? histPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.ms).toFixed(1)},${yOf(p.val).toFixed(1)}`).join(' ')
    : null

  const fcPath = forecastPoints.length >= 2
    ? forecastPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.ms).toFixed(1)},${yOf(p.val).toFixed(1)}`).join(' ')
    : null

  // Y grid ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(t * maxVal))

  // X labels: year marks in historical, +Ny marks in forecast
  const xLabels: { x: number; label: string }[] = []
  const startYear = new Date(minMs).getFullYear()
  for (let y = startYear + 1; y <= now.getFullYear(); y++) {
    const ms = new Date(y, 0, 1).getTime()
    if (ms >= minMs && ms <= now.getTime()) {
      xLabels.push({ x: xOf(ms), label: String(y) })
    }
  }
  forecast
    .filter(p => p.year > 0 && p.year % 5 === 0)
    .forEach(p => {
      const ms = new Date(now.getFullYear() + p.year, now.getMonth(), 15).getTime()
      if (ms <= maxMs) xLabels.push({ x: xOf(ms), label: `+${p.year}a` })
    })

  // Milestone horizontal lines
  const mLines = [
    leanFireNumber > 0 ? { val: leanFireNumber, label: 'Lean FI', color: '#22d3ee' } : null,
    { val: fireNumber, label: 'Full FI', color: '#a3e635' },
  ].filter((m): m is { val: number; label: string; color: string } =>
    m !== null && m.val > 0 && m.val <= maxVal * 1.02
  )

  const fireHitFc = forecastPoints.find(p => p.val >= fireNumber)

  // Hover: find closest point across hist + forecast
  const allPoints = [...histPoints, ...forecastPoints]
  const hoveredPt = hoverMs !== null
    ? allPoints.reduce((best, p) =>
        Math.abs(p.ms - hoverMs) < Math.abs(best.ms - hoverMs) ? p : best
      )
    : null

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const targetMs = minMs + ((svgX - padL) / chartW) * msRange
    setHoverMs(targetMs)
  }

  const fmtDate = (ms: number) => {
    const d = new Date(ms)
    return `${d.toLocaleString('es', { month: 'short' })} ${d.getFullYear()}`
  }

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Patrimonio histórico + Proyección FIRE</p>
        <div className="flex items-center gap-4 text-[9px] text-zinc-500">
          {histPoints.length >= 2 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 rounded bg-[#22d3ee]" />Patrimonio neto
            </span>
          )}
          {forecastPoints.length >= 2 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 border-t-2 border-dashed border-[#84cc16]" />Proyección
            </span>
          )}
          {hoveredPt && (
            <span className="text-zinc-300">
              {fmtDate(hoveredPt.ms)}: <span className="font-bold text-[#a3e635]">{fmtV(hoveredPt.val)}</span>
            </span>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 240 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverMs(null)}
      >
        {/* Grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
            <text x={padL - 5} y={yOf(v) + 4} textAnchor="end" fontSize={9} fill="#52525b">
              {fmtV(v)}
            </text>
          </g>
        ))}

        {/* Milestone lines */}
        {mLines.map(m => (
          <g key={m.label}>
            <line x1={padL} x2={W - padR} y1={yOf(m.val)} y2={yOf(m.val)}
              stroke={m.color} strokeWidth={1} strokeDasharray="6 4" opacity={0.4} />
            <text x={W - padR - 2} y={yOf(m.val) - 4} textAnchor="end" fontSize={8} fill={m.color} opacity={0.65}>
              {m.label}
            </text>
          </g>
        ))}

        {/* Defs */}
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#84cc16" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#84cc16" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Historical area + line */}
        {histPath && (
          <>
            <path
              d={`${histPath} L${xOf(histPoints[histPoints.length - 1].ms).toFixed(1)},${padT + chartH} L${padL},${padT + chartH} Z`}
              fill="url(#hg)"
            />
            <path d={histPath} fill="none" stroke="#22d3ee" strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {/* Forecast area + dashed line */}
        {fcPath && (
          <>
            <path
              d={`${fcPath} L${xOf(forecastPoints[forecastPoints.length - 1].ms).toFixed(1)},${padT + chartH} L${xOf(forecastPoints[0].ms).toFixed(1)},${padT + chartH} Z`}
              fill="url(#fg2)"
            />
            <path d={fcPath} fill="none" stroke="#84cc16" strokeWidth={2} strokeDasharray="8 4"
              strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
          </>
        )}

        {/* TODAY separator */}
        {nowX >= padL && nowX <= W - padR && (
          <>
            <line x1={nowX} x2={nowX} y1={padT} y2={padT + chartH}
              stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={nowX + 3} y={padT + 11} fontSize={8} fill="#52525b">Hoy</text>
          </>
        )}

        {/* FIRE hit marker */}
        {fireHitFc && (
          <g>
            <circle cx={xOf(fireHitFc.ms)} cy={yOf(fireHitFc.val)} r={6}
              fill="#080c08" stroke="#a3e635" strokeWidth={2.5} />
            <text x={xOf(fireHitFc.ms)} y={yOf(fireHitFc.val) - 11}
              textAnchor="middle" fontSize={8} fill="#a3e635" fontWeight="bold">
              FIRE 🎯
            </text>
          </g>
        )}

        {/* Hover crosshair */}
        {hoveredPt && (
          <g>
            <line x1={xOf(hoveredPt.ms)} x2={xOf(hoveredPt.ms)} y1={padT} y2={padT + chartH}
              stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
            <circle cx={xOf(hoveredPt.ms)} cy={yOf(hoveredPt.val)} r={4}
              fill="#a3e635" stroke="#080c08" strokeWidth={2} />
          </g>
        )}

        {/* X labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - padB + 20} textAnchor="middle" fontSize={9} fill="#52525b">
            {l.label}
          </text>
        ))}
      </svg>
    </div>
  )
}
