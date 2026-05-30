'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export interface MonthPoint {
  month: string
  income: number
  expenses: number
  net: number
  savings_rate: number
  cumulative: number
}

type MetricKey = 'income' | 'expenses' | 'net' | 'savings_rate' | 'cumulative'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(n)
}

const METRICS: {
  key: MetricKey
  label: string
  stroke: string
  format: (n: number) => string
}[] = [
  { key: 'income', label: 'Ingresos', stroke: 'rgb(52 211 153)', format: fmtCRC },
  { key: 'expenses', label: 'Gastos', stroke: 'rgb(251 113 133)', format: fmtCRC },
  { key: 'net', label: 'Flujo neto', stroke: 'rgb(96 165 250)', format: fmtCRC },
  { key: 'savings_rate', label: 'Ahorro %', stroke: 'rgb(167 139 250)', format: (n) => n.toFixed(1) + '%' },
  { key: 'cumulative', label: 'Acumulado', stroke: 'rgb(99 102 241)', format: fmtCRC },
]

function getValue(p: MonthPoint, k: MetricKey) {
  return p[k]
}

function smoothPath(xArr: number[], yArr: number[]) {
  if (xArr.length === 0) return ''
  if (xArr.length === 1) return `M${xArr[0]},${yArr[0]}`
  let d = `M${xArr[0].toFixed(1)},${yArr[0].toFixed(1)}`
  for (let i = 1; i < xArr.length; i++) {
    const cpX = ((xArr[i - 1] + xArr[i]) / 2).toFixed(1)
    d += ` C${cpX},${yArr[i - 1].toFixed(1)} ${cpX},${yArr[i].toFixed(1)} ${xArr[i].toFixed(1)},${yArr[i].toFixed(1)}`
  }
  return d
}

export function MetricChart({ data, defaultMetric = 'net' }: { data: MonthPoint[]; defaultMetric?: MetricKey }) {
  const [metric, setMetric] = useState<MetricKey>(defaultMetric)
  const [hovered, setHovered] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Reset selected metric when the default changes (tab switch)
  useEffect(() => { setMetric(defaultMetric) }, [defaultMetric])

  const cfg = METRICS.find((m) => m.key === metric)!

  const values = data.map((p) => getValue(p, metric))
  const minV = Math.min(...values, 0)
  const maxV = Math.max(...values, 1)
  const range = maxV - minV || 1

  const W = 800
  const H = 170
  const padX = 4
  const padTop = 12
  const padBottom = 20
  const chartH = H - padTop - padBottom
  const chartW = W - padX * 2

  const xs = data.map((_, i) => padX + (i / Math.max(data.length - 1, 1)) * chartW)
  const ys = values.map((v) => padTop + chartH - ((v - minV) / range) * chartH)

  const pathD = smoothPath(xs, ys)
  const last = xs.length - 1
  const areaD =
    pathD +
    ` L${xs[last].toFixed(1)},${(padTop + chartH).toFixed(1)} L${xs[0].toFixed(1)},${(padTop + chartH).toFixed(1)} Z`

  const zeroY =
    minV < 0
      ? padTop + chartH - ((0 - minV) / range) * chartH
      : null

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect || data.length === 0) return
      const relX = ((e.clientX - rect.left) / rect.width) * W
      let closest = 0
      let minDist = Infinity
      xs.forEach((x, i) => {
        const d = Math.abs(x - relX)
        if (d < minDist) {
          minDist = d
          closest = i
        }
      })
      setHovered(closest)
    },
    [xs, data.length]
  )

  const hp = hovered !== null ? data[hovered] : null
  const hv = hovered !== null ? values[hovered] : null

  if (data.length === 0) return null

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-sm font-semibold text-zinc-200 tracking-tight">Tendencia mensual</p>
          <div className="h-5 mt-1">
            {hp && hv !== null ? (
              <p className="text-xs text-zinc-400">
                <span className="text-zinc-500 mr-2">
                  {MONTH_LABELS[parseInt(hp.month.slice(5, 7)) - 1]} {hp.month.slice(0, 4)}
                </span>
                <span className="font-semibold tabular-nums" style={{ color: cfg.stroke }}>
                  {cfg.format(hv)}
                </span>
              </p>
            ) : (
              <p className="text-xs text-zinc-600">Hover para ver valor</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 justify-end max-w-xs">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                metric === m.key
                  ? 'bg-white/[0.08] text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              style={metric === m.key ? { boxShadow: `0 0 0 1px ${m.stroke}40` } : {}}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
        className="cursor-crosshair"
      >
        <defs>
          <linearGradient id="mgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cfg.stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={cfg.stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {zeroY !== null && (
          <line
            x1={padX} y1={zeroY} x2={W - padX} y2={zeroY}
            stroke="rgb(113 113 122 / 0.25)" strokeDasharray="4 3" strokeWidth="1"
          />
        )}

        <path d={areaD} fill="url(#mgGrad)" />
        <path d={pathD} fill="none" stroke={cfg.stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

        {hovered !== null && (
          <>
            <line
              x1={xs[hovered]} y1={padTop} x2={xs[hovered]} y2={padTop + chartH}
              stroke="rgb(255 255 255 / 0.08)" strokeWidth="1"
            />
            <circle cx={xs[hovered]} cy={ys[hovered]} r={3.5} fill={cfg.stroke} />
            <circle cx={xs[hovered]} cy={ys[hovered]} r={6} fill={cfg.stroke} fillOpacity="0.15" />
          </>
        )}

        {data.map((p, i) => {
          const step = data.length > 24 ? 3 : data.length > 12 ? 2 : 1
          if (i % step !== 0) return null
          const mi = parseInt(p.month.slice(5, 7)) - 1
          return (
            <text key={p.month} x={xs[i]} y={H - 3} textAnchor="middle" fontSize="8" fill="rgb(82 82 91)">
              {MONTH_LABELS[mi]}{p.month.slice(2, 4)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
