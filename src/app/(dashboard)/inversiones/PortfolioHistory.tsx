'use client'

import { useState } from 'react'
import type { ExchangeRate } from '@/lib/exchange-rate'

export type HistoryPoint = {
  month: string  // "YYYY-MM"
  balances: Record<string, number>  // series key → CRC balance
}

export type HistorySeries = {
  key: string
  name: string
  color: string
}

const TOTAL_KEY   = '__total__'
const TOTAL_COLOR = '#a3e635'

function fmtV(n: number, currency: 'CRC' | 'USD', rate: number) {
  const v = currency === 'CRC' ? n : n / rate
  const sym = currency === 'CRC' ? '₡' : '$'
  if (v >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${sym}${Math.round(v / 1_000)}K`
  return `${sym}${Math.round(v)}`
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(mo) - 1]} '${y.slice(2)}`
}

const RANGE_OPTIONS = [
  { label: '3M',  months: 3  },
  { label: '6M',  months: 6  },
  { label: '1A',  months: 12 },
  { label: 'Todo',months: 999},
] as const

export function PortfolioHistory({
  points,
  series,
  exchangeRate,
}: {
  points: HistoryPoint[]
  series: HistorySeries[]
  exchangeRate: ExchangeRate
}) {
  const [rangeMonths, setRangeMonths] = useState<number>(12)
  const [visible, setVisible]         = useState<Set<string>>(new Set([TOTAL_KEY]))
  const [currency, setCurrency]       = useState<'CRC' | 'USD'>('CRC')

  if (points.length < 2) return null

  const rate      = exchangeRate.sell
  const toDisplay = (v: number) => currency === 'CRC' ? v : v / rate
  const fmt       = (v: number) => fmtV(v, currency, rate)

  // Slice by time range
  const filtered = points.slice(-rangeMonths)
  if (filtered.length < 2) return null

  // Augment each point with a __total__ key
  const data: { month: string; balances: Record<string, number> }[] = filtered.map(p => {
    const total = Object.values(p.balances).reduce((s, v) => s + Math.max(v, 0), 0)
    const balances: Record<string, number> = { ...p.balances, [TOTAL_KEY]: total }
    return { month: p.month, balances }
  })

  const allSeries: HistorySeries[] = [
    { key: TOTAL_KEY, name: 'Total patrimonio', color: TOTAL_COLOR },
    ...series,
  ]

  const toggle = (key: string) => setVisible(prev => {
    const next = new Set(prev)
    if (next.has(key)) { next.delete(key) } else { next.add(key) }
    return next
  })

  // SVG dimensions
  const W = 800, H = 200
  const padL = 52, padR = 8, padT = 8, padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const N = data.length

  // Y range: 0 → maxV across visible series
  const visibleValues = data.flatMap(p =>
    allSeries.filter(s => visible.has(s.key)).map(s => toDisplay(p.balances[s.key] ?? 0))
  )
  const maxV = Math.max(...visibleValues, 1)

  const xOf = (i: number) => padL + (i / Math.max(N - 1, 1)) * chartW
  const yOf = (v: number) => padT + chartH - (toDisplay(v) / maxV) * chartH

  const labelStep = Math.ceil(N / 8)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => t * maxV)

  return (
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Evolución histórica</p>
        <div className="flex items-center gap-2">
          {/* Currency */}
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
            {(['CRC', 'USD'] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={`px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-wider transition-all ${
                  currency === c ? 'bg-[#a3e635] text-black' : 'text-zinc-500 hover:text-zinc-300'
                }`}>{c === 'CRC' ? '₡' : '$'}</button>
            ))}
          </div>
          {/* Range */}
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
            {RANGE_OPTIONS.map(r => (
              <button key={r.label} onClick={() => setRangeMonths(r.months)}
                className={`px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-wider transition-all ${
                  rangeMonths === r.months ? 'bg-white/[0.10] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}>{r.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '200px' }}>
        {/* Horizontal grid + Y labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <text x={padL - 4} y={yOf(v) + 4} textAnchor="end" fontSize="9" fill="#3f3f46">
              {fmt(v)}
            </text>
          </g>
        ))}

        {/* Series polylines */}
        {allSeries.filter(s => visible.has(s.key)).map(s => {
          const pts = data.map((p, i) =>
            `${xOf(i).toFixed(1)},${yOf(p.balances[s.key] ?? 0).toFixed(1)}`
          ).join(' ')
          const isTotal = s.key === TOTAL_KEY
          return (
            <polyline key={s.key}
              points={pts}
              fill="none"
              stroke={s.color}
              strokeWidth={isTotal ? 2.5 : 1.5}
              strokeOpacity={isTotal ? 1 : 0.65}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )
        })}

        {/* Dots at last point for visible series */}
        {allSeries.filter(s => visible.has(s.key)).map(s => {
          const last = data[data.length - 1]
          return (
            <circle key={s.key}
              cx={xOf(N - 1)} cy={yOf(last.balances[s.key] ?? 0)} r={s.key === TOTAL_KEY ? 3 : 2}
              fill={s.color} opacity={0.9}
            />
          )
        })}

        {/* X-axis month labels */}
        {data.map((p, i) => {
          if (i % labelStep !== 0 && i !== N - 1) return null
          return (
            <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#3f3f46">
              {monthLabel(p.month)}
            </text>
          )
        })}
      </svg>

      {/* Legend / toggle */}
      <div className="flex flex-wrap gap-1.5">
        {allSeries.map(s => {
          const on = visible.has(s.key)
          const last = data[data.length - 1]
          const val = last.balances[s.key] ?? 0
          return (
            <button key={s.key} onClick={() => toggle(s.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-left transition-all ${
                on ? 'border-white/[0.10] bg-white/[0.04]' : 'border-transparent opacity-40'
              }`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-[9px] font-semibold text-zinc-300">{s.name}</span>
              <span className="text-[9px] tabular-nums font-black ml-1" style={{ color: s.color }}>
                {fmt(val)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
