'use client'

import { useState, useRef, useCallback } from 'react'

export interface MonthData {
  month: string
  income: number
  expenses: number
  withdrawals: number
  net: number
  cumulative: number
  rate: number | null
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(n)
}

function monthLabel(m: string) {
  return MONTH_LABELS[parseInt(m.slice(5, 7)) - 1] ?? m
}

// ── Grouped bar + net line chart ──────────────────────────────────────────────

export function MonthlyBarsChart({
  data,
  initialBalance = 0,
}: {
  data: MonthData[]
  initialBalance?: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [overlay, setOverlay] = useState<'net' | 'cumulative' | 'rate' | 'none'>('net')
  const svgRef = useRef<SVGSVGElement>(null)

  if (data.length === 0) return null

  const hasData = data.some((d) => d.income > 0 || d.expenses > 0)
  if (!hasData) return null

  const W = 800
  const BAR_AREA_H = 200
  const LINE_H = 80
  const LABEL_H = 24
  const TOTAL_H = BAR_AREA_H + LINE_H + LABEL_H
  const padX = 8
  const chartW = W - padX * 2

  const n = data.length
  const groupW = chartW / n
  const barW = Math.min(groupW * 0.35, 22)
  const gap = Math.min(groupW * 0.04, 3)

  const maxBar = Math.max(...data.flatMap((d) => [d.income, d.expenses + d.withdrawals]), 1)

  // Bar positions
  const barCenters = data.map((_, i) => padX + i * groupW + groupW / 2)

  // Overlay line values
  const overlayVals = data.map((d) => {
    if (overlay === 'net') return d.net
    if (overlay === 'cumulative') return initialBalance + d.cumulative
    if (overlay === 'rate') return d.rate ?? 0
    return 0
  })
  const lineMin = Math.min(...overlayVals)
  const lineMax = Math.max(...overlayVals)
  const lineRange = lineMax - lineMin || 1
  const lineTop = BAR_AREA_H + 6
  const lineBot = BAR_AREA_H + LINE_H - 8

  function lineY(v: number) {
    return lineTop + (lineBot - lineTop) - ((v - lineMin) / lineRange) * (lineBot - lineTop)
  }

  const lineXs = barCenters
  const lineYs = overlayVals.map(lineY)
  const zeroLineY = lineMin < 0 && lineMax > 0 ? lineY(0) : null

  function smoothPath(xs: number[], ys: number[]) {
    if (xs.length === 0) return ''
    if (xs.length === 1) return `M${xs[0]},${ys[0]}`
    let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`
    for (let i = 1; i < xs.length; i++) {
      const cpX = ((xs[i - 1] + xs[i]) / 2).toFixed(1)
      d += ` C${cpX},${ys[i - 1].toFixed(1)} ${cpX},${ys[i].toFixed(1)} ${xs[i].toFixed(1)},${ys[i].toFixed(1)}`
    }
    return d
  }

  const overlayColors = {
    net: 'rgb(96 165 250)',
    cumulative: 'rgb(99 102 241)',
    rate: 'rgb(167 139 250)',
    none: 'transparent',
  }
  const overlayColor = overlayColors[overlay]

  const linePath = overlay !== 'none' ? smoothPath(lineXs, lineYs) : ''
  const areaPath =
    overlay !== 'none' && linePath
      ? linePath +
        ` L${lineXs[lineXs.length - 1].toFixed(1)},${lineBot} L${lineXs[0].toFixed(1)},${lineBot} Z`
      : ''

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const relX = ((e.clientX - rect.left) / rect.width) * W
      let closest = 0
      let minDist = Infinity
      barCenters.forEach((x, i) => {
        const d = Math.abs(x - relX)
        if (d < minDist) {
          minDist = d
          closest = i
        }
      })
      setHovered(closest)
    },
    [barCenters]
  )

  const hp = hovered !== null ? data[hovered] : null
  const hv = hovered !== null ? overlayVals[hovered] : null

  const OVERLAYS: { key: typeof overlay; label: string }[] = [
    { key: 'net', label: 'Flujo neto' },
    { key: 'cumulative', label: 'Acumulado' },
    { key: 'rate', label: 'Ahorro %' },
    { key: 'none', label: 'Sin línea' },
  ]

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">
            Ingresos vs Egresos
          </p>
          {hp ? (
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <span className="text-xs text-zinc-500">{monthLabel(hp.month)}</span>
              <span className="text-xs text-emerald-400 tabular-nums">+{fmtCRC(hp.income)}</span>
              <span className="text-xs text-rose-400 tabular-nums">−{fmtCRC(hp.expenses + hp.withdrawals)}</span>
              {overlay !== 'none' && hv !== null && (
                <span className="text-xs font-semibold tabular-nums" style={{ color: overlayColor }}>
                  {overlay === 'rate'
                    ? hv.toFixed(1) + '%'
                    : fmtCRC(hv)}
                </span>
              )}
              {hp.rate !== null && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    hp.rate >= 20
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : hp.rate >= 0
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-rose-500/10 text-rose-400'
                  }`}
                >
                  {hp.rate.toFixed(1)}% ahorro
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-600 mt-1">Hover para ver valores</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Legend */}
          <div className="flex gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/60 inline-block" />
              Ingresos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-400/60 inline-block" />
              Egresos
            </span>
          </div>
          {/* Overlay selector */}
          <div className="flex gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
            {OVERLAYS.map((o) => (
              <button
                key={o.key}
                onClick={() => setOverlay(o.key)}
                className={`px-2 py-1 rounded-md text-xs font-bold transition-colors ${
                  overlay === o.key
                    ? 'bg-[#a3e635] text-black'
                    : 'text-zinc-600 hover:text-zinc-300'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${TOTAL_H}`}
        width="100%"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
        className="cursor-crosshair"
      >
        <defs>
          <linearGradient id="ovGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={overlayColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={overlayColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Hover column highlight */}
        {hovered !== null && (
          <rect
            x={padX + hovered * groupW}
            y={0}
            width={groupW}
            height={BAR_AREA_H}
            fill="rgb(255 255 255 / 0.025)"
            rx={3}
          />
        )}

        {/* Income + expense bars */}
        {data.map((d, i) => {
          const cx = barCenters[i]
          const incH = Math.max(2, (d.income / maxBar) * (BAR_AREA_H - 8))
          const egH = Math.max(d.expenses + d.withdrawals > 0 ? 2 : 0, ((d.expenses + d.withdrawals) / maxBar) * (BAR_AREA_H - 8))
          const isHov = hovered === i

          return (
            <g key={d.month}>
              <rect
                x={cx - barW - gap / 2}
                y={BAR_AREA_H - incH}
                width={barW}
                height={incH}
                rx={2}
                fill={isHov ? 'rgb(52 211 153 / 0.85)' : 'rgb(52 211 153 / 0.55)'}
              />
              <rect
                x={cx + gap / 2}
                y={BAR_AREA_H - egH}
                width={barW}
                height={egH}
                rx={2}
                fill={isHov ? 'rgb(251 113 133 / 0.85)' : 'rgb(251 113 133 / 0.55)'}
              />
            </g>
          )
        })}

        {/* Divider */}
        <line
          x1={padX} y1={BAR_AREA_H + 1} x2={W - padX} y2={BAR_AREA_H + 1}
          stroke="rgb(255 255 255 / 0.04)" strokeWidth="1"
        />

        {/* Overlay area + line */}
        {overlay !== 'none' && areaPath && (
          <>
            <path d={areaPath} fill="url(#ovGrad)" />
            {zeroLineY !== null && (
              <line
                x1={padX} y1={zeroLineY} x2={W - padX} y2={zeroLineY}
                stroke="rgb(113 113 122 / 0.25)" strokeDasharray="4 3" strokeWidth="1"
              />
            )}
            <path
              d={linePath}
              fill="none"
              stroke={overlayColor}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {hovered !== null && (
              <>
                <line
                  x1={barCenters[hovered]} y1={lineTop}
                  x2={barCenters[hovered]} y2={lineBot}
                  stroke="rgb(255 255 255 / 0.08)" strokeWidth="1"
                />
                <circle
                  cx={barCenters[hovered]}
                  cy={lineYs[hovered]}
                  r={3.5}
                  fill={overlayColor}
                />
                <circle
                  cx={barCenters[hovered]}
                  cy={lineYs[hovered]}
                  r={7}
                  fill={overlayColor}
                  fillOpacity="0.15"
                />
              </>
            )}
          </>
        )}

        {/* Month labels */}
        {data.map((d, i) => {
          const step = n > 18 ? 3 : n > 9 ? 2 : 1
          if (i % step !== 0) return null
          return (
            <text
              key={d.month}
              x={barCenters[i]}
              y={TOTAL_H - 3}
              textAnchor="middle"
              fontSize="8.5"
              fill={hovered === i ? 'rgb(161 161 170)' : 'rgb(82 82 91)'}
            >
              {monthLabel(d.month)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ── Savings rate heatmap ──────────────────────────────────────────────────────

export function SavingsHeatmap({ data }: { data: MonthData[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (data.length === 0) return null

  const CELL_W = Math.min(56, Math.floor(760 / data.length))
  const CELL_H = 36
  const W = data.length * CELL_W + 40
  const H = CELL_H + 32

  function rateColor(rate: number | null) {
    if (rate === null) return 'rgb(30 30 35)'
    if (rate >= 30) return 'rgb(16 185 129 / 0.7)'
    if (rate >= 20) return 'rgb(52 211 153 / 0.55)'
    if (rate >= 10) return 'rgb(96 165 250 / 0.45)'
    if (rate >= 0) return 'rgb(59 130 246 / 0.25)'
    if (rate >= -20) return 'rgb(251 113 133 / 0.35)'
    return 'rgb(239 68 68 / 0.6)'
  }

  const hp = hovered !== null ? data[hovered] : null

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-zinc-200 tracking-tight">Margen neto mensual</p>
          {hp ? (
            <p className="text-xs text-zinc-400 mt-1">
              <span className="text-zinc-500 mr-2">{monthLabel(hp.month)}</span>
              <span className="font-semibold" style={{ color: hp.rate !== null && hp.rate >= 0 ? 'rgb(52 211 153)' : 'rgb(251 113 133)' }}>
                {hp.rate !== null ? hp.rate.toFixed(1) + '%' : 'Sin datos'}
              </span>
              {hp.income > 0 && (
                <span className="text-zinc-600 ml-2">{fmtCRC(hp.income - hp.expenses)} neto</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-zinc-600 mt-1">Hover para ver valor</p>
          )}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1.5 text-xs text-zinc-600">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'rgb(239 68 68 / 0.6)' }} />
          <span>&lt;0%</span>
          <span className="w-3 h-3 rounded-sm inline-block ml-1" style={{ background: 'rgb(59 130 246 / 0.25)' }} />
          <span>0–10%</span>
          <span className="w-3 h-3 rounded-sm inline-block ml-1" style={{ background: 'rgb(52 211 153 / 0.55)' }} />
          <span>20%+</span>
          <span className="w-3 h-3 rounded-sm inline-block ml-1" style={{ background: 'rgb(16 185 129 / 0.7)' }} />
          <span>30%+</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {data.map((d, i) => {
          const x = 20 + i * CELL_W
          const isHov = hovered === i
          return (
            <g key={d.month}>
              <rect
                x={x + 1}
                y={2}
                width={CELL_W - 2}
                height={CELL_H}
                rx={3}
                fill={rateColor(d.rate)}
                stroke={isHov ? 'rgb(255 255 255 / 0.25)' : 'transparent'}
                strokeWidth="1"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              />
              {d.rate !== null && Math.abs(d.rate) >= 5 && (
                <text
                  x={x + CELL_W / 2}
                  y={CELL_H / 2 + 5}
                  textAnchor="middle"
                  fontSize="8"
                  fill="rgb(228 228 231 / 0.8)"
                  style={{ pointerEvents: 'none' }}
                >
                  {d.rate.toFixed(0)}%
                </text>
              )}
              <text
                x={x + CELL_W / 2}
                y={H - 3}
                textAnchor="middle"
                fontSize="8"
                fill={isHov ? 'rgb(161 161 170)' : 'rgb(82 82 91)'}
              >
                {monthLabel(d.month)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
