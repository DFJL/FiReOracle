'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import type { ExchangeRate } from '@/lib/exchange-rate'

type Props = {
  activosInvertibles: number
  liquidBalance: number
  totalInvested: number
  fireNumber: number
  fireProgress: number
  runway: number
  avgMonthlyExpenses: number
  avgMonthlySurvivalExpenses: number
  avgMonthlyIncome: number
  passiveIncome12m: number
  realizedReturnRate: number | null
  forecastYears: { year: number; balance: number }[]
  snapshots: { snapshot_date: string; net_worth_crc: number; invested_crc: number }[]
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
  fireNumber, fireProgress, runway,
  avgMonthlyExpenses, avgMonthlySurvivalExpenses, avgMonthlyIncome,
  passiveIncome12m, realizedReturnRate,
  forecastYears, snapshots, exchangeRate,
  fireConfig, runwayGreen, runwayYellow,
}: Props) {
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('USD')
  const rate = exchangeRate.sell
  const fmt  = (v: number) => fmtAmt(v, currency, rate)

  const savingsRate   = avgMonthlyIncome > 0
    ? Math.max(0, (avgMonthlyIncome - avgMonthlyExpenses) / avgMonthlyIncome)
    : 0
  const monthlySavings = Math.max(0, avgMonthlyIncome - avgMonthlyExpenses)

  const passiveMonthlyAvg = passiveIncome12m / 12
  // Financial Independence: passive covers what % of total expenses
  const fiRatio = avgMonthlyExpenses > 0 ? passiveMonthlyAvg / avgMonthlyExpenses : 0
  // Financial Security: passive covers what % of survival-only expenses
  const fsRatio = avgMonthlySurvivalExpenses > 0 ? passiveMonthlyAvg / avgMonthlySurvivalExpenses : 0

  const runwayColor =
    runway >= runwayGreen  ? '#a3e635' :
    runway >= runwayYellow ? '#f59e0b' : '#f43f5e'

  const yearsToFire = forecastYears.length > 1
    ? forecastYears.find(p => p.balance >= fireNumber)?.year ?? null
    : null

  // No FIRE number set yet
  if (fireNumber === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">FIRE</p>
        <p className="text-zinc-400 text-sm max-w-xs">
          Configurá tu gasto mensual objetivo en retiro para calcular tu número FIRE y ver el progreso.
        </p>
        <Link href="/configuracion"
          className="px-5 py-2.5 rounded-xl bg-[#a3e635] text-black text-sm font-black">
          Configurar parámetros FIRE
        </Link>
      </div>
    )
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

      {/* Hero card: radial progress + numbers */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 sm:p-7">
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
      </div>

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
          sub={`${(fireConfig.expReturn * 100).toFixed(0)}% esperado`}
          color={
            realizedReturnRate === null ? '#71717a' :
            realizedReturnRate >= fireConfig.expReturn ? '#a3e635' : '#f59e0b'
          }
        />

        <KpiCard
          label="Tasa de ahorro"
          value={`${(savingsRate * 100).toFixed(0)}%`}
          unit="últimos 12m"
          sub={`${fmt(monthlySavings)}/mes`}
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
          sub={avgMonthlySurvivalExpenses > 0 ? `básico: ${fmt(avgMonthlySurvivalExpenses)}/mes` : 'sin gastos básicos'}
          color={fsRatio >= 1 ? '#a3e635' : fsRatio >= 0.75 ? '#f59e0b' : '#71717a'}
        />
      </div>

      {/* Forecast chart */}
      {forecastYears.length >= 2 && (
        <ForecastChart
          forecast={forecastYears}
          fireNumber={fireNumber}
          snapshots={snapshots}
          currency={currency}
          rate={rate}
        />
      )}

      {/* Footer hint */}
      <p className="text-[10px] text-zinc-700 text-center pb-2">
        Proyección: {(fireConfig.expReturn * 100).toFixed(0)}% retorno anual ·{' '}
        {fmt(monthlySavings)}/mes aporte ·{' '}
        <Link href="/configuracion" className="underline hover:text-zinc-500 transition-colors">
          ajustar parámetros
        </Link>
      </p>
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

function ForecastChart({
  forecast, fireNumber, snapshots, currency, rate,
}: {
  forecast: { year: number; balance: number }[]
  fireNumber: number
  snapshots: { snapshot_date: string; net_worth_crc: number; invested_crc: number }[]
  currency: 'CRC' | 'USD'
  rate: number
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const W = 800, H = 220
  const padL = 56, padR = 16, padT = 14, padB = 36
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const convert = (v: number) => currency === 'CRC' ? v : v / rate
  const sym = currency === 'CRC' ? '₡' : '$'

  const fmtY = (v: number) => {
    const val = convert(v)
    if (Math.abs(val) >= 1_000_000) return `${sym}${(val / 1_000_000).toFixed(0)}M`
    if (Math.abs(val) >= 1_000)     return `${sym}${(val / 1_000).toFixed(0)}K`
    return `${sym}${Math.round(val)}`
  }

  const maxY   = Math.max(...forecast.map(p => p.balance), fireNumber) * 1.08
  const maxYear = forecast[forecast.length - 1].year

  const xOf = (year: number) => padL + (year / Math.max(maxYear, 1)) * chartW
  const yOf = (val: number)  => padT + chartH - (Math.max(val, 0) / maxY) * chartH

  const linePath = forecast
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.year).toFixed(1)},${yOf(p.balance).toFixed(1)}`)
    .join(' ')

  const fireY  = yOf(fireNumber)
  const fireHitIdx = forecast.findIndex(p => p.balance >= fireNumber)
  const fireHitX   = fireHitIdx > 0 ? xOf(forecast[fireHitIdx].year) : null

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => t * maxY)

  // X labels: year 0, every 5 years, last point
  const xLabels = forecast.filter((p, i) =>
    i === 0 || p.year % 5 === 0 || i === forecast.length - 1
  )

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    let closest = 0, minDist = Infinity
    forecast.forEach((p, i) => {
      const dist = Math.abs(xOf(p.year) - svgX)
      if (dist < minDist) { minDist = dist; closest = i }
    })
    setHoverIdx(closest)
  }

  const hovered = hoverIdx !== null ? forecast[hoverIdx] : null

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Proyección a FIRE</p>
        {hovered && (
          <p className="text-[10px] text-zinc-400">
            Año {hovered.year}: <span className="font-bold text-[#a3e635]">{fmtY(hovered.balance)}</span>
          </p>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 220 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Grid + Y labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
            <text x={padL - 5} y={yOf(v) + 4} textAnchor="end" fontSize={9} fill="#52525b">
              {fmtY(v)}
            </text>
          </g>
        ))}

        {/* FIRE target line */}
        <line x1={padL} x2={W - padR} y1={fireY} y2={fireY}
          stroke="#a3e635" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.45} />
        <text x={W - padR - 2} y={fireY - 5} textAnchor="end" fontSize={9} fill="#a3e635" opacity={0.7}>
          FIRE {fmtY(fireNumber)}
        </text>

        {/* Area fill under forecast line */}
        <defs>
          <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#84cc16" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#84cc16" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${linePath} L${xOf(maxYear)},${padT + chartH} L${padL},${padT + chartH} Z`}
          fill="url(#fg)"
        />

        {/* Forecast line */}
        <path d={linePath} fill="none" stroke="#84cc16" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" />

        {/* FIRE hit dot */}
        {fireHitX !== null && fireHitIdx > 0 && (
          <g>
            <circle cx={fireHitX} cy={fireY} r={6} fill="#080c08" stroke="#a3e635" strokeWidth={2.5} />
            <text x={fireHitX} y={fireY - 12} textAnchor="middle" fontSize={9} fill="#a3e635" fontWeight="bold">
              Año {forecast[fireHitIdx].year} 🎯
            </text>
          </g>
        )}

        {/* Hover crosshair */}
        {hovered && (
          <g>
            <line x1={xOf(hovered.year)} x2={xOf(hovered.year)} y1={padT} y2={padT + chartH}
              stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            <circle cx={xOf(hovered.year)} cy={yOf(hovered.balance)} r={4}
              fill="#a3e635" stroke="#080c08" strokeWidth={2} />
          </g>
        )}

        {/* X labels */}
        {xLabels.map(p => (
          <text key={p.year} x={xOf(p.year)} y={H - padB + 20} textAnchor="middle" fontSize={9} fill="#52525b">
            {p.year === 0 ? 'Hoy' : `Año ${p.year}`}
          </text>
        ))}
      </svg>
    </div>
  )
}
