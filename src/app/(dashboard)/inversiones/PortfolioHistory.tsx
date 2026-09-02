'use client'

import { useState, useRef, useCallback } from 'react'
import type { ExchangeRate } from '@/lib/exchange-rate'

export type HistoryPoint = {
  month: string  // "YYYY-MM"
  balances: Record<string, number>  // series key → CRC balance
  /** Snapshot-backed patrimonio (liquidez + invertido). Preferred over summing
   *  `balances`, which cannot know what a bucket held before it existed. */
  total?: number
  /** Snapshot-backed invested total, excluding liquidez. */
  invested?: number
}

export type HistorySeries = {
  key: string
  name: string
  color: string
}

const TOTAL_KEY   = '__total__'
const TOTAL_COLOR = '#a3e635'
// Invested total (patrimonio minus liquidez), snapshot-backed like TOTAL_KEY.
// Both are aggregates, never components — they must not be summed into anything.
const INVESTED_KEY   = '__invertido__'
const INVESTED_COLOR = '#38bdf8'

function fmtV(n: number, currency: 'CRC' | 'USD', rate: number) {
  const v = currency === 'CRC' ? n : n / rate
  const sym = currency === 'CRC' ? '₡' : '$'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(2)}M`
  return `${sym}${Math.round(v).toLocaleString('es-CR')}`
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
  const [visible, setVisible]         = useState<Set<string>>(new Set([TOTAL_KEY, INVESTED_KEY]))
  const [currency, setCurrency]       = useState<'CRC' | 'USD'>('USD')
  const [hoverIdx, setHoverIdx]       = useState<number | null>(null)
  const svgRef                        = useRef<SVGSVGElement>(null)

  if (points.length < 2) return null

  const rate      = exchangeRate.sell
  const toDisplay = (v: number) => currency === 'CRC' ? v : v / rate
  const fmt       = (v: number) => fmtV(v, currency, rate)

  // Slice by time range
  const filtered = points.slice(-rangeMonths)
  if (filtered.length < 2) return null

  // Augment each point with a __total__ key
  const data: { month: string; balances: Record<string, number> }[] = filtered.map(p => {
    // Prefer the snapshot: replaying transactions cannot know what a bucket held
    // before it existed, so the summed fallback understates the early history.
    const replayed = Object.values(p.balances).reduce((s, v) => s + Math.max(v, 0), 0)
    const balances: Record<string, number> = {
      ...p.balances,
      [TOTAL_KEY]: p.total ?? replayed,
      ...(p.invested !== undefined ? { [INVESTED_KEY]: p.invested } : {}),
    }
    return { month: p.month, balances }
  })

  const hasInvested = data.some(p => p.balances[INVESTED_KEY] !== undefined)

  const allSeries: HistorySeries[] = [
    { key: TOTAL_KEY, name: 'Total patrimonio', color: TOTAL_COLOR },
    ...(hasInvested ? [{ key: INVESTED_KEY, name: 'Invertido', color: INVESTED_COLOR }] : []),
    ...series,
  ]

  const toggle = (key: string) => setVisible(prev => {
    const next = new Set(prev)
    if (next.has(key)) { next.delete(key) } else { next.add(key) }
    return next
  })

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    let closest = 0, minDist = Infinity
    data.forEach((_, i) => {
      const dist = Math.abs(xOf(i) - svgX)
      if (dist < minDist) { minDist = dist; closest = i }
    })
    setHoverIdx(closest)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* SVG Chart + Tooltip */}
      <div className="relative">
      {hoverIdx !== null && (
        <div className="absolute z-10 pointer-events-none"
          style={{ left: `${(xOf(hoverIdx) / W) * 100}%`, top: 0, transform: 'translateX(-50%)' }}>
          <div className="bg-[#111811] border border-[#a3e635]/20 rounded-xl px-3 py-2.5 shadow-xl whitespace-nowrap text-[11px]">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 text-center">
              {monthLabel(data[hoverIdx].month)}
            </p>
            {allSeries.filter(s => visible.has(s.key)).map(s => (
              <div key={s.key} className="flex items-center justify-between gap-4 leading-5">
                <span className="text-[10px]" style={{ color: s.color, opacity: 0.75 }}>{s.name}</span>
                <span className="font-black tabular-nums" style={{ color: s.color }}>
                  {fmt(data[hoverIdx].balances[s.key] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" style={{ height: '200px' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
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

        {/* Dots at last point — hidden while hovering */}
        {hoverIdx === null && allSeries.filter(s => visible.has(s.key)).map(s => {
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
            <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9"
              fill={hoverIdx === i ? '#71717a' : '#3f3f46'}>
              {monthLabel(p.month)}
            </text>
          )
        })}

        {/* Hover crosshair */}
        {hoverIdx !== null && (
          <>
            <line x1={xOf(hoverIdx)} y1={padT} x2={xOf(hoverIdx)} y2={padT + chartH}
              stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3 2" />
            {allSeries.filter(s => visible.has(s.key)).map(s => (
              <circle key={s.key}
                cx={xOf(hoverIdx)}
                cy={yOf(data[hoverIdx].balances[s.key] ?? 0)}
                r={s.key === TOTAL_KEY ? 4 : 3}
                fill={s.color}
                stroke="#0d120d"
                strokeWidth="1.5"
              />
            ))}
          </>
        )}
      </svg>
      </div>

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
