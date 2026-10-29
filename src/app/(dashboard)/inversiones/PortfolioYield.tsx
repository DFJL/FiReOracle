'use client'

import { useState, useTransition, useRef } from 'react'
import type { ExchangeRate } from '@/lib/exchange-rate'
import { recomputeYieldHistory } from '@/app/actions/computeYieldHistory'
import { useCurrency } from '@/lib/currency'

type YieldRow = {
  product_name: string
  year_month: string
  yield_usd: number
  invested_usd: number
  yield_pct: number
  exchange_rate: number
}

type Props = {
  rows: YieldRow[]
  exchangeRate: ExchangeRate
}

const INSTRUMENT_COLORS: [string, string][] = [
  ['transcomer', '#a3e635'],
  ['dominion',   '#22d3ee'],
  ['crypto',     '#f59e0b'],
  ['farming',    '#f59e0b'],
  ['multimoney', '#818cf8'],
  ['scotiabank', '#818cf8'],
]

function instrumentColor(name: string) {
  const lc = name.toLowerCase()
  for (const [key, color] of INSTRUMENT_COLORS) {
    if (lc.includes(key)) return color
  }
  return '#818cf8'
}

export function PortfolioYield({ rows, exchangeRate }: Props) {
  const { currency } = useCurrency()
  const [rangeMonths, setRangeMonths]   = useState<number>(24)
  const [hoverIdx, setHoverIdx]         = useState<number | null>(null)
  const [recalcMsg, setRecalcMsg]       = useState<string | null>(null)
  const [isPending, startTransition]    = useTransition()
  const svgRef = useRef<SVGSVGElement>(null)

  const liveRate = exchangeRate.sell

  const now = new Date()
  const cutoff = rangeMonths === 0
    ? '2000-01-01'
    : new Date(now.getFullYear(), now.getMonth() - rangeMonths, 1).toISOString().slice(0, 10)

  const filtered = rows.filter(r => r.year_month >= cutoff)
  const months   = [...new Set(filtered.map(r => r.year_month))].sort()

  // Per-product lookup for chart: product → month → yield_pct
  const lookup: Record<string, Record<string, number>> = {}
  for (const r of filtered) {
    lookup[r.product_name] ??= {}
    lookup[r.product_name][r.year_month] = r.yield_pct
  }

  const rangeLabel = rangeMonths === 0 ? 'todo' : `${rangeMonths}m`

  // Summary cards — only products with yield data in the selected range
  const summaries = [...new Set(filtered.map(r => r.product_name))].map(name => {
    const pr      = filtered.filter(r => r.product_name === name)
    const nonZero = pr.filter(r => r.yield_pct > 0)
    const avg     = nonZero.length > 0 ? nonZero.reduce((s, r) => s + r.yield_pct, 0) / nonZero.length : 0
    const ann     = (Math.pow(1 + avg / 100, 12) - 1) * 100
    const totalUsd = pr.reduce((s, r) => s + r.yield_usd, 0)
    const lastRow  = [...pr].reverse().find(r => r.invested_usd > 0)
    return { name, avg, ann, totalUsd, lastInvestedUsd: lastRow?.invested_usd ?? 0, months: nonZero.length }
  }).filter(s => s.months > 0)
    .sort((a, b) => b.ann - a.ann)

  const products = summaries.map(s => s.name)

  // summaries is already sorted best→worst (line above), but that order
  // alone doesn't answer "¿cuál es el mejor/peor?" at a glance in a grid —
  // pull them out explicitly for their own strip.
  const bestPerformer  = summaries[0] ?? null
  const worstPerformer = summaries.length > 1 ? summaries[summaries.length - 1] : null

  // Blended portfolio-level return — money-weighted by what's invested in
  // each instrument, not a plain average across instruments (a tiny position
  // with a huge % shouldn't move this as much as the bulk of the capital).
  // Same annualizing formula as each instrument's own card, so the headline
  // number is directly comparable to them.
  const totalInvested = summaries.reduce((s, r) => s + r.lastInvestedUsd, 0)
  const blendedMonthlyAvg = totalInvested > 0
    ? summaries.reduce((s, r) => s + r.avg * r.lastInvestedUsd, 0) / totalInvested
    : 0
  const blendedAnn = (Math.pow(1 + blendedMonthlyAvg / 100, 12) - 1) * 100
  const blendedTotalUsd = summaries.reduce((s, r) => s + r.totalUsd, 0)

  const fmtUsd = (v: number) => {
    const val = currency === 'CRC' ? v * liveRate : v
    const sym = currency === 'CRC' ? '₡' : '$'
    return val >= 1_000_000 ? `${sym}${(val / 1_000_000).toFixed(2)}M`
      : `${sym}${Math.round(val).toLocaleString('es-CR')}`
  }

  // Chart dimensions
  const W = 800, H = 200
  const padL = 52, padR = 24, padT = 16, padB = 36
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const N = months.length

  const allPcts = filtered.map(r => r.yield_pct).filter(v => v > 0)
  const maxYield = allPcts.length > 0 ? Math.max(...allPcts) * 1.15 : 1

  const xOf = (i: number) => padL + (i / Math.max(N - 1, 1)) * chartW
  const yOf = (v: number) => padT + chartH - (Math.max(v, 0) / maxYield) * chartH

  const labelStep = Math.max(1, Math.ceil(N / 8))
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => Number((t * maxYield).toFixed(3)))

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || N === 0) return
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    let best = 0, minD = Infinity
    months.forEach((_, i) => {
      const d = Math.abs(xOf(i) - svgX)
      if (d < minD) { minD = d; best = i }
    })
    setHoverIdx(best)
  }

  const fmtMonthLabel = (m: string) => {
    const d = new Date(m + 'T12:00:00')
    return `${d.toLocaleString('es', { month: 'short' })} ${d.getFullYear().toString().slice(2)}`
  }

  const hoveredMonth = hoverIdx !== null ? months[hoverIdx] : null

  const handleRecalculate = () => {
    setRecalcMsg(null)
    startTransition(async () => {
      const result = await recomputeYieldHistory()
      if (result.error) {
        setRecalcMsg(`Error: ${result.error}`)
      } else {
        setRecalcMsg(`${result.rows} filas actualizadas`)
      }
    })
  }

  if (N < 2) return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center space-y-3">
      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.14em]">Rendimiento por Instrumento</p>
      <p className="text-xs text-zinc-600">Sin historial de rendimientos calculado aún.</p>
      <button
        onClick={handleRecalculate}
        disabled={isPending}
        className="px-4 py-2 rounded-lg bg-[#a3e635]/10 text-[#a3e635] text-xs font-black border border-[#a3e635]/20 hover:bg-[#a3e635]/20 disabled:opacity-50 transition-all"
      >
        {isPending ? 'Calculando…' : 'Calcular rendimientos desde transacciones'}
      </button>
      {recalcMsg && (
        <p className={`text-[10px] px-3 py-1.5 rounded-lg ${
          recalcMsg.startsWith('Error') ? 'text-rose-400 bg-rose-400/10' : 'text-[#a3e635] bg-[#a3e635]/10'
        }`}>{recalcMsg}</p>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header + range selector + recalculate button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Rendimiento por Instrumento</p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Range selector */}
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
            {([{ l: '3m', v: 3 }, { l: '6m', v: 6 }, { l: '12m', v: 12 }, { l: '24m', v: 24 }, { l: 'Todo', v: 0 }]).map(r => (
              <button key={r.l} onClick={() => setRangeMonths(r.v)}
                className={`px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-wider transition-all ${
                  rangeMonths === r.v ? 'bg-white/[0.10] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}>{r.l}</button>
            ))}
          </div>

          {/* Recalculate button */}
          <button
            onClick={handleRecalculate}
            disabled={isPending}
            className="px-3 py-0.5 rounded-lg bg-[#a3e635]/10 text-[#a3e635] text-[9px] font-black tracking-wider border border-[#a3e635]/20 hover:bg-[#a3e635]/20 disabled:opacity-50 transition-all"
          >
            {isPending ? 'Calculando…' : 'Recalcular Rendimientos'}
          </button>
        </div>
      </div>

      {/* Recalculate feedback */}
      {recalcMsg && (
        <p className={`text-[10px] px-3 py-1.5 rounded-lg ${
          recalcMsg.startsWith('Error')
            ? 'text-rose-400 bg-rose-400/10'
            : 'text-[#a3e635] bg-[#a3e635]/10'
        }`}>
          {recalcMsg}
        </p>
      )}

      {/* Portfolio-level blended return — the number that answers "¿está funcionando mi portafolio?",
          not just each instrument on its own */}
      {totalInvested > 0 && (
        <div className="rounded-xl border border-[#a3e635]/20 bg-[#a3e635]/[0.06] p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[9px] font-black text-[#a3e635]/80 uppercase tracking-[0.14em]">Rendimiento General del Portfolio</p>
            <p className="text-3xl font-black text-[#a3e635] leading-tight mt-0.5">{blendedAnn.toFixed(2)}%</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">anualizado ({rangeLabel}) · ponderado por monto invertido</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Total Invertido</p>
            <p className="text-sm font-bold text-zinc-300 mt-0.5">{fmtUsd(totalInvested)}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">{fmtUsd(blendedTotalUsd)} yield {rangeLabel}</p>
          </div>
        </div>
      )}

      {/* Mejor / Peor performer — summaries below is already sorted best→worst,
          but that alone doesn't read as a ranking in a grid; call it out
          explicitly so it's not something you have to go hunting for. */}
      {bestPerformer && worstPerformer && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { tag: 'Mejor', s: bestPerformer, color: '#a3e635' },
            { tag: 'Peor', s: worstPerformer, color: worstPerformer.ann < 0 ? '#fb7185' : '#a1a1aa' },
          ].map(({ tag, s, color }) => (
            <div key={tag} className="rounded-xl border p-3" style={{ borderColor: `${color}33`, background: `${color}0f` }}>
              <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color }}>{tag} performer</p>
              <p className="text-lg font-black leading-tight mt-0.5 truncate" title={s.name} style={{ color }}>
                {s.name.replace('Fondos de Inversión ', '').replace('Rendimientos ', '')}
              </p>
              <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color }}>
                {s.ann >= 0 ? '+' : ''}{s.ann.toFixed(2)}% <span className="text-zinc-500 font-normal">anualizado</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Ranking — mejor a peor, barras horizontales. Más legible para
          comparar instrumentos entre sí que el chart de líneas de abajo,
          que responde una pregunta distinta (tendencia en el tiempo). */}
      {summaries.length > 1 && (() => {
        const maxAbs = Math.max(...summaries.map(s => Math.abs(s.ann)), 1)
        return (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Ranking · {rangeLabel}</p>
            {summaries.map(s => {
              const shortName = s.name.replace('Fondos de Inversión ', '').replace('Rendimientos ', '')
              const color = s.ann < 0 ? '#fb7185' : instrumentColor(s.name)
              const widthPct = (Math.abs(s.ann) / maxAbs) * 100
              return (
                <div key={s.name} className="flex items-center gap-2"
                  title={`${shortName}: ${s.ann >= 0 ? '+' : ''}${s.ann.toFixed(2)}% anualizado (${rangeLabel})`}>
                  <span className="text-[9px] text-zinc-400 w-24 truncate shrink-0">{shortName}</span>
                  <div className="flex-1 h-3 bg-black/20 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(widthPct, 2)}%`, background: color }} />
                  </div>
                  <span className="text-[10px] font-bold tabular-nums w-16 text-right shrink-0" style={{ color }}>
                    {s.ann >= 0 ? '+' : ''}{s.ann.toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {summaries.map(s => {
          const color = instrumentColor(s.name)
          const shortName = s.name.replace('Fondos de Inversión ', '').replace('Rendimientos ', '')
          return (
            <div key={s.name} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <p className="text-[9px] font-black text-zinc-400 truncate leading-tight" title={s.name}>
                  {shortName}
                </p>
              </div>
              <p className="text-xl font-black leading-none" style={{ color }}>
                {s.ann.toFixed(2)}%
              </p>
              <p className="text-[9px] text-zinc-500 mt-0.5">anualizado ({rangeLabel})</p>
              <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-0.5">
                <p className="text-[9px] text-zinc-600">{s.avg.toFixed(3)}%/mes · {s.months} meses</p>
                <p className="text-[9px] text-zinc-600">{fmtUsd(s.totalUsd)} yield 12m</p>
                {s.lastInvestedUsd > 0 && (
                  <p className="text-[9px] text-zinc-700">{fmtUsd(s.lastInvestedUsd)} invertido</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Monthly yield % chart */}
      <div className="relative">
        {hoveredMonth && (
          <div className="absolute z-10 pointer-events-none"
            style={{
              left: `${(xOf(months.indexOf(hoveredMonth)) / W) * 100}%`,
              top: 0,
              transform: 'translateX(-50%)',
            }}>
            <div className="bg-[#111811] border border-[#a3e635]/20 rounded-xl px-3 py-2.5 shadow-xl whitespace-nowrap">
              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 text-center">
                {fmtMonthLabel(hoveredMonth)}
              </p>
              {products.map(name => {
                const v = lookup[name]?.[hoveredMonth]
                if (!v) return null
                const color = instrumentColor(name)
                return (
                  <div key={name} className="flex items-center justify-between gap-4 leading-5">
                    <span className="text-[10px]" style={{ color, opacity: 0.8 }}>
                      {name.replace('Fondos de Inversión ', '').replace('Rendimientos ', '')}
                    </span>
                    <span className="text-[10px] font-black tabular-nums" style={{ color }}>
                      {v.toFixed(3)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" style={{ height: '180px' }}
          onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>

          {/* Y grid */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)}
                stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              <text x={padL - 4} y={yOf(v) + 4} textAnchor="end" fontSize="9" fill="#3f3f46">
                {v.toFixed(2)}%
              </text>
            </g>
          ))}

          {/* Lines per instrument */}
          {products.map(name => {
            const color = instrumentColor(name)
            const pts = months.map((m, i) =>
              `${xOf(i).toFixed(1)},${yOf(lookup[name]?.[m] ?? 0).toFixed(1)}`
            ).join(' ')
            return (
              <polyline key={name} points={pts} fill="none"
                stroke={color} strokeWidth="1.5" strokeOpacity="0.85"
                strokeLinejoin="round" strokeLinecap="round" />
            )
          })}

          {/* Hover crosshair + dots */}
          {hoverIdx !== null && (
            <g>
              <line x1={xOf(hoverIdx)} x2={xOf(hoverIdx)} y1={padT} y2={padT + chartH}
                stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              {products.map(name => {
                const v = lookup[name]?.[months[hoverIdx]] ?? 0
                if (v === 0) return null
                return (
                  <circle key={name} cx={xOf(hoverIdx)} cy={yOf(v)} r={3}
                    fill={instrumentColor(name)} stroke="#080c08" strokeWidth="2" />
                )
              })}
            </g>
          )}

          {/* X labels */}
          {months.map((m, i) => {
            if (i % labelStep !== 0 && i !== N - 1) return null
            return (
              <text key={m} x={xOf(i)} y={H - padB + 20} textAnchor="middle" fontSize="9" fill="#52525b">
                {fmtMonthLabel(m)}
              </text>
            )
          })}
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {products.map(name => (
            <span key={name} className="flex items-center gap-1.5 text-[9px] text-zinc-500">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: instrumentColor(name) }} />
              {name.replace('Fondos de Inversión ', '').replace('Rendimientos ', '')}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
