'use client'

import { useState, useTransition, useRef } from 'react'
import { Plus, RefreshCw, Trash2, TrendingUp, Download, Upload, Camera } from 'lucide-react'
import {
  createAsset,
  updateAssetValue,
  deactivateAsset,
  createLiability,
  updateLiabilityBalance,
  deactivateLiability,
} from '@/app/actions/patrimonio'
import {
  saveSnapshot,
  bulkImportSnapshots,
  deleteSnapshot,
  type SnapshotRow,
} from '@/app/actions/netWorthSnapshot'
import type { ExchangeRate } from '@/lib/exchange-rate'
import type { NetWorthItem } from '@/app/actions/netWorthItems'
import { ComposicionDetallada } from './ComposicionDetallada'

type Asset = {
  id: string; name: string; asset_type: string
  value_crc: number; as_of_date: string
  is_investable: boolean; notes: string | null
}

type Liability = {
  id: string; name: string; liability_type: string
  current_balance: number; original_balance: number | null
  interest_rate: number | null; as_of_date: string
}

type TrendPoint = { month: string; total: number }

type Props = {
  liquidBalance: number
  totalInvested: number
  iliquidTotal: number
  iliquidInvestable: number
  totalLiabilities: number
  totalActivos: number
  patrimonioNeto: number
  activosInvertibles: number
  assets: Asset[]
  liabilities: Liability[]
  monthlyTrend: TrendPoint[]
  snapshots: SnapshotRow[]
  exchangeRate: ExchangeRate
  netWorthItems: NetWorthItem[]
  envelopeBreakdown: { name: string; balance: number }[]
  bucketBreakdown: { name: string; balance: number }[]
}

const ASSET_TYPES = [
  { value: 'real_estate', label: 'Inmueble' },
  { value: 'vehicle',     label: 'Vehículo' },
  { value: 'pension',     label: 'Pensión / OPC' },
  { value: 'business',    label: 'Negocio' },
  { value: 'crypto',      label: 'Cripto' },
  { value: 'other',       label: 'Otro' },
]

const LIABILITY_TYPES = [
  { value: 'mortgage',       label: 'Hipoteca' },
  { value: 'auto_loan',      label: 'Préstamo vehículo' },
  { value: 'personal_loan',  label: 'Préstamo personal' },
  { value: 'credit_card',    label: 'Tarjeta de crédito' },
  { value: 'student_loan',   label: 'Préstamo estudiantil' },
  { value: 'other',          label: 'Otro' },
]

const ASSET_LABEL: Record<string, string> = Object.fromEntries(ASSET_TYPES.map(t => [t.value, t.label]))
const LIABILITY_LABEL: Record<string, string> = Object.fromEntries(LIABILITY_TYPES.map(t => [t.value, t.label]))

function fmtShort(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `₡${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `₡${(v / 1_000).toFixed(0)}K`
  return `₡${Math.round(v).toLocaleString('es-CR')}`
}

function fmtAmt(v: number, curr: 'CRC' | 'USD', rate: number) {
  const val  = curr === 'CRC' ? v : v / rate
  const sym  = curr === 'CRC' ? '₡' : '$'
  const abs  = Math.abs(val)
  if (abs >= 1_000_000) return `${sym}${(val / 1_000_000).toFixed(2)}M`
  return `${sym}${Math.round(val).toLocaleString('es-CR')}`
}

function today() { return new Date().toISOString().slice(0, 10) }

function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(mo) - 1]} '${y.slice(2)}`
}

const NW_SERIES = [
  { key: '__neto__',      name: 'Patrimonio neto', color: '#a3e635' },
  { key: '__liquid__',    name: 'Líquido',          color: '#f59e0b' },
  { key: '__invested__',  name: 'Invertido',         color: '#84cc16' },
  { key: '__iliquid__',   name: 'Ilíquido',          color: '#60a5fa' },
  { key: '__pasivos__',   name: 'Pasivos',           color: '#f43f5e' },
]

const NW_RANGES = [
  { label: '1A',   months: 12   },
  { label: '2A',   months: 24   },
  { label: '5A',   months: 60   },
  { label: 'Todo', months: 9999 },
]

// ─── Snapshot net worth chart (interactive, portfolio-style) ─────────────────

function NetWorthChart({
  snapshots, fallback, fmt, assets, liabilities,
}: {
  snapshots: SnapshotRow[]
  fallback: TrendPoint[]
  fmt: (v: number) => string
  assets: Asset[]
  liabilities: Liability[]
}) {
  const [rangeMonths, setRangeMonths] = useState(9999)
  const [visible, setVisible]         = useState<Set<string>>(new Set(['__neto__']))
  const [hoverIdx, setHoverIdx]       = useState<number | null>(null)
  const svgRef                        = useRef<SVGSVGElement>(null)

  const useSnapshots = snapshots.length >= 2

  if (!useSnapshots && fallback.length < 2) {
    return (
      <div className="h-36 flex flex-col items-center justify-center text-xs text-zinc-600 gap-1">
        <span>Sin historial aún.</span>
        <span className="text-[10px]">Guardá un snapshot mensual para construir la serie histórica.</span>
      </div>
    )
  }

  const toggle = (key: string) => setVisible(prev => {
    const next = new Set(prev)
    if (next.has(key)) { next.delete(key) } else { next.add(key) }
    return next
  })

  if (useSnapshots) {
    const pts = snapshots.slice(-rangeMonths)
    const data = pts.map(p => ({
      month:    p.snapshot_date.slice(0, 7),
      balances: {
        '__neto__':     Number(p.net_worth_crc),
        '__liquid__':   Number(p.liquid_crc),
        '__invested__': Number(p.invested_crc),
        '__iliquid__':  Number(p.iliquid_crc),
        '__pasivos__':  Number(p.liabilities_crc),
      } as Record<string, number>,
    }))

    const W = 800, H = 200
    const padL = 52, padR = 8, padT = 8, padB = 28
    const chartW = W - padL - padR
    const chartH = H - padT - padB
    const N = data.length

    const visibleVals = data.flatMap(p =>
      NW_SERIES.filter(s => visible.has(s.key)).map(s => p.balances[s.key] ?? 0)
    )
    const maxV = Math.max(...visibleVals, 1)

    const xOf = (i: number) => padL + (i / Math.max(N - 1, 1)) * chartW
    const yOf = (v: number) => padT + chartH - (Math.max(v, 0) / maxV) * chartH

    const labelStep = Math.ceil(N / 8)
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => t * maxV)

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const svgX = ((e.clientX - rect.left) / rect.width) * W
      let closest = 0, minDist = Infinity
      data.forEach((_, i) => {
        const dist = Math.abs(xOf(i) - svgX)
        if (dist < minDist) { minDist = dist; closest = i }
      })
      setHoverIdx(closest)
    }

    const last = data[data.length - 1]

    return (
      <div className="space-y-3">
        {/* Range selector */}
        <div className="flex justify-end">
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
            {NW_RANGES.map(r => (
              <button key={r.label} onClick={() => setRangeMonths(r.months)}
                className={`px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-wider transition-all ${
                  rangeMonths === r.months ? 'bg-white/[0.10] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}>{r.label}</button>
            ))}
          </div>
        </div>

        {/* SVG chart + hover tooltip */}
        <div className="relative">
          {hoverIdx !== null && (
            <div className="absolute z-10 pointer-events-none"
              style={{ left: `${(xOf(hoverIdx) / W) * 100}%`, top: 0, transform: 'translateX(-50%)' }}>
              <div className="bg-[#111811] border border-[#a3e635]/20 rounded-xl px-3 py-2.5 shadow-xl whitespace-nowrap">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 text-center">
                  {monthLabel(data[hoverIdx].month)}
                </p>
                {NW_SERIES.filter(s => visible.has(s.key)).map(s => (
                  <div key={s.key} className="flex items-center justify-between gap-4 leading-5">
                    <span className="text-[10px]" style={{ color: s.color, opacity: 0.75 }}>{s.name}</span>
                    <span className="text-[10px] font-black tabular-nums" style={{ color: s.color }}>
                      {fmt(data[hoverIdx].balances[s.key] ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" style={{ height: '200px' }}
            onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>

            {/* Grid + Y labels */}
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
            {NW_SERIES.filter(s => visible.has(s.key)).map(s => {
              const linePoints = data.map((p, i) =>
                `${xOf(i).toFixed(1)},${yOf(p.balances[s.key] ?? 0).toFixed(1)}`
              ).join(' ')
              const isNeto = s.key === '__neto__'
              return (
                <polyline key={s.key} points={linePoints} fill="none"
                  stroke={s.color}
                  strokeWidth={isNeto ? 2.5 : 1.5}
                  strokeOpacity={isNeto ? 1 : 0.65}
                  strokeLinejoin="round" strokeLinecap="round"
                />
              )
            })}

            {/* End-point dots (hidden while hovering) */}
            {hoverIdx === null && NW_SERIES.filter(s => visible.has(s.key)).map(s => (
              <circle key={s.key}
                cx={xOf(N - 1)} cy={yOf(last.balances[s.key] ?? 0)}
                r={s.key === '__neto__' ? 3 : 2}
                fill={s.color} opacity={0.9}
              />
            ))}

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
                {NW_SERIES.filter(s => visible.has(s.key)).map(s => (
                  <circle key={s.key}
                    cx={xOf(hoverIdx)} cy={yOf(data[hoverIdx].balances[s.key] ?? 0)}
                    r={s.key === '__neto__' ? 4 : 3}
                    fill={s.color} stroke="#0d120d" strokeWidth="1.5"
                  />
                ))}
              </>
            )}
          </svg>
        </div>

        {/* Legend / series toggle */}
        <div className="flex flex-wrap gap-1.5">
          {NW_SERIES.map(s => {
            const on = visible.has(s.key)
            return (
              <button key={s.key} onClick={() => toggle(s.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-left transition-all ${
                  on ? 'border-white/[0.10] bg-white/[0.04]' : 'border-transparent opacity-40'
                }`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-[9px] font-semibold text-zinc-300">{s.name}</span>
                <span className="text-[9px] tabular-nums font-black ml-1" style={{ color: s.color }}>
                  {fmt(last.balances[s.key] ?? 0)}
                </span>
              </button>
            )
          })}
        </div>

        {/* Breakdown drawers — appear when ilíquido or pasivos are toggled on */}
        {(visible.has('__iliquid__') || visible.has('__pasivos__')) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {visible.has('__iliquid__') && (
              <div className="rounded-xl border border-blue-500/20 bg-white/[0.02] overflow-hidden">
                <div className="px-3 py-2 border-b border-white/[0.04] flex items-center justify-between">
                  <p className="text-[9px] font-black text-blue-400/70 uppercase tracking-[0.12em]">Activos ilíquidos</p>
                  <p className="text-xs font-bold text-blue-400">{fmt(last.balances['__iliquid__'] ?? 0)}</p>
                </div>
                {assets.length > 0 ? assets.map(a => (
                  <div key={a.id} className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.03] last:border-0">
                    <div>
                      <p className="text-xs text-zinc-300">{a.name}</p>
                      <p className="text-[9px] text-zinc-600">{ASSET_LABEL[a.asset_type] ?? a.asset_type}</p>
                    </div>
                    <p className="text-xs font-bold text-blue-400">{fmt(a.value_crc)}</p>
                  </div>
                )) : (
                  <p className="px-3 py-3 text-[10px] text-zinc-600">
                    Total del snapshot importado. Usá <span className="text-zinc-400">"Agregar activo"</span> para desglosar por inmueble, vehículo, etc.
                  </p>
                )}
              </div>
            )}
            {visible.has('__pasivos__') && (
              <div className="rounded-xl border border-rose-500/20 bg-white/[0.02] overflow-hidden">
                <div className="px-3 py-2 border-b border-white/[0.04] flex items-center justify-between">
                  <p className="text-[9px] font-black text-rose-400/70 uppercase tracking-[0.12em]">Pasivos</p>
                  <p className="text-xs font-bold text-rose-400">{fmt(last.balances['__pasivos__'] ?? 0)}</p>
                </div>
                {liabilities.length > 0 ? liabilities.map(l => (
                  <div key={l.id} className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.03] last:border-0">
                    <div>
                      <p className="text-xs text-zinc-300">{l.name}</p>
                      <p className="text-[9px] text-zinc-600">{LIABILITY_LABEL[l.liability_type] ?? l.liability_type}</p>
                    </div>
                    <p className="text-xs font-bold text-rose-400">{fmt(l.current_balance)}</p>
                  </div>
                )) : (
                  <p className="px-3 py-3 text-[10px] text-zinc-600">
                    Total del snapshot importado. Usá <span className="text-zinc-400">"Agregar pasivo"</span> para desglosar por hipoteca, tarjeta, etc.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Fallback: simple net worth line derived from transaction data
  const fbPts = fallback.slice(-24)
  const fbVals = fbPts.map(p => p.total)
  const fbMin = Math.min(...fbVals), fbMax = Math.max(...fbVals)
  const fbRange = fbMax - fbMin || 1
  const FW = 600, FH = 110, FPX = 4, FPY = 6
  const fx = (i: number) => FPX + (i / (fbPts.length - 1)) * (FW - 2 * FPX)
  const fy = (v: number) => FH - FPY - ((v - fbMin) / fbRange) * (FH - 2 * FPY)
  const fbLine = fbPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${fx(i).toFixed(1)},${fy(p.total).toFixed(1)}`).join(' ')
  const fbArea = `${fbLine} L${fx(fbPts.length-1).toFixed(1)},${FH} L${fx(0).toFixed(1)},${FH} Z`

  return (
    <div>
      <svg viewBox={`0 0 ${FW} ${FH}`} className="w-full h-36" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pnGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e635" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#a3e635" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fbArea} fill="url(#pnGrad2)" />
        <path d={fbLine} fill="none" stroke="#a3e635" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <text x={FPX+2} y={FH-2} fill="#52525b" fontSize="9" textAnchor="start">{fbPts[0].month}</text>
        <text x={FW-FPX-2} y={FH-2} fill="#52525b" fontSize="9" textAnchor="end">{fbPts[fbPts.length-1].month}</text>
      </svg>
      <p className="text-[9px] text-zinc-700 mt-1">Registrá snapshots mensuales para incluir activos ilíquidos y pasivos en la serie.</p>
    </div>
  )
}

// ─── Breakdown bars ──────────────────────────────────────────────────────────

function BreakdownBar({
  liquidBalance, totalInvested, iliquidTotal, totalLiabilities, totalActivos,
}: {
  liquidBalance: number; totalInvested: number; iliquidTotal: number
  totalLiabilities: number; totalActivos: number
}) {
  if (totalActivos <= 0) return null
  const pct = (v: number) => `${((v / totalActivos) * 100).toFixed(1)}%`
  const ratio = (v: number) => v / totalActivos

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Activos</span>
          <span className="text-xs font-bold text-zinc-300">{fmtShort(totalActivos)}</span>
        </div>
        <div className="h-6 flex rounded-lg overflow-hidden gap-px bg-white/[0.03]">
          {liquidBalance > 0 && (
            <div style={{ width: pct(liquidBalance) }} className="bg-amber-500/75 flex items-center justify-center transition-all">
              {ratio(liquidBalance) > 0.07 && <span className="text-[9px] font-black text-black/60 px-1">Liq</span>}
            </div>
          )}
          {totalInvested > 0 && (
            <div style={{ width: pct(totalInvested) }} className="bg-[#a3e635]/75 flex items-center justify-center transition-all">
              {ratio(totalInvested) > 0.07 && <span className="text-[9px] font-black text-black/60 px-1">Inv</span>}
            </div>
          )}
          {iliquidTotal > 0 && (
            <div style={{ width: pct(iliquidTotal) }} className="bg-blue-500/65 flex items-center justify-center transition-all">
              {ratio(iliquidTotal) > 0.07 && <span className="text-[9px] font-black text-black/60 px-1">Ilíq</span>}
            </div>
          )}
        </div>
      </div>

      {totalLiabilities > 0 && (
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Pasivos</span>
            <span className="text-xs font-bold text-rose-400">{fmtShort(totalLiabilities)}</span>
          </div>
          <div className="h-6 flex rounded-lg overflow-hidden bg-white/[0.03]">
            <div
              style={{ width: `${Math.min((totalLiabilities / totalActivos) * 100, 100).toFixed(1)}%` }}
              className="bg-rose-500/65 flex items-center justify-center"
            >
              {ratio(totalLiabilities) > 0.06 && <span className="text-[9px] font-black text-black/60 px-1">Deuda</span>}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-[9px] font-black uppercase tracking-[0.1em] pt-1">
        <span className="flex items-center gap-1.5 text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/75 inline-block" />
          Líquido <span className="text-amber-400 ml-0.5">{fmtShort(liquidBalance)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-zinc-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#a3e635]/75 inline-block" />
          Invertido <span className="text-[#a3e635] ml-0.5">{fmtShort(totalInvested)}</span>
        </span>
        {iliquidTotal > 0 && (
          <span className="flex items-center gap-1.5 text-zinc-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/65 inline-block" />
            Ilíquido <span className="text-blue-400 ml-0.5">{fmtShort(iliquidTotal)}</span>
          </span>
        )}
        {totalLiabilities > 0 && (
          <span className="flex items-center gap-1.5 text-zinc-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/65 inline-block" />
            Pasivos <span className="text-rose-400 ml-0.5">{fmtShort(totalLiabilities)}</span>
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

// ─── CSV paste parser ────────────────────────────────────────────────────────

function parsePastedSnapshots(raw: string): Array<{
  snapshot_date: string; liquid_crc: number; invested_crc: number
  iliquid_crc: number; liabilities_crc: number
}> | string {
  const lines = raw.trim().split('\n').filter(l => l.trim())
  if (lines.length === 0) return 'Sin datos'

  const parseNum = (s: string) => {
    const clean = s.replace(/[₡,\s]/g, '').replace(',', '.')
    const n = parseFloat(clean)
    return isNaN(n) ? 0 : n
  }

  const parseDate = (s: string): string | null => {
    const t = s.trim()
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
    // DD/MM/YYYY
    const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
    // MM/YYYY or YYYY/MM
    const my = t.match(/^(\d{1,2})\/(\d{4})$/)
    if (my) return `${my[2]}-${my[1].padStart(2,'0')}-01`
    const ym = t.match(/^(\d{4})\/(\d{1,2})$/)
    if (ym) return `${ym[1]}-${ym[2].padStart(2,'0')}-01`
    // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(t)) return `${t}-01`
    return null
  }

  const sep = lines[0].includes('\t') ? '\t' : ','
  const firstCols = lines[0].toLowerCase().split(sep)

  // Detect header row
  const isHeader = firstCols.some(c => /fecha|date|mes|liquid|invest|iliq|pasiv|liab/.test(c))
  const dataLines = isHeader ? lines.slice(1) : lines

  // Column mapping (default: date, liquid, invested, iliquid, liabilities)
  let ci = { date: 0, liquid: 1, invested: 2, iliquid: 3, liabilities: 4 }
  if (isHeader) {
    firstCols.forEach((c, i) => {
      if (/fecha|date|mes/.test(c))                    ci.date       = i
      else if (/^l[ií]q/.test(c) && !/iliq/.test(c))  ci.liquid     = i
      else if (/invert/.test(c))                       ci.invested   = i
      else if (/il[ií]q/.test(c))                      ci.iliquid    = i
      else if (/pasiv|liab/.test(c))                   ci.liabilities = i
    })
  }

  const rows = []
  for (const line of dataLines) {
    const cols = line.split(sep)
    if (cols.length < 4) continue
    const snapshot_date = parseDate(cols[ci.date] ?? '')
    if (!snapshot_date) continue
    rows.push({
      snapshot_date,
      liquid_crc:      parseNum(cols[ci.liquid]      ?? '0'),
      invested_crc:    parseNum(cols[ci.invested]    ?? '0'),
      iliquid_crc:     parseNum(cols[ci.iliquid]     ?? '0'),
      liabilities_crc: parseNum(cols[ci.liabilities] ?? '0'),
    })
  }

  if (rows.length === 0) return 'No se encontraron filas válidas. Revisá el formato.'
  return rows
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PatrimonioView({
  liquidBalance, totalInvested, iliquidTotal, iliquidInvestable,
  totalLiabilities, totalActivos, patrimonioNeto, activosInvertibles,
  assets, liabilities, monthlyTrend, snapshots, exchangeRate, netWorthItems,
  envelopeBreakdown, bucketBreakdown,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('USD')

  const rate = exchangeRate.sell
  const fmt = (v: number) => fmtAmt(v, currency, rate)

  // Asset CRUD state
  const [showAddAsset, setShowAddAsset]       = useState(false)
  const [updatingAsset, setUpdatingAsset]     = useState<string | null>(null)
  const [newAssetName, setNewAssetName]       = useState('')
  const [newAssetType, setNewAssetType]       = useState('real_estate')
  const [newAssetValue, setNewAssetValue]     = useState('')
  const [newAssetDate, setNewAssetDate]       = useState(today())
  const [newAssetInv, setNewAssetInv]         = useState(false)
  const [newAssetNotes, setNewAssetNotes]     = useState('')
  const [assetNewVal, setAssetNewVal]         = useState('')
  const [assetNewDate, setAssetNewDate]       = useState(today())

  // Liability CRUD state
  const [showAddLiab, setShowAddLiab]         = useState(false)
  const [updatingLiab, setUpdatingLiab]       = useState<string | null>(null)
  const [newLiabName, setNewLiabName]         = useState('')
  const [newLiabType, setNewLiabType]         = useState('mortgage')
  const [newLiabBal, setNewLiabBal]           = useState('')
  const [newLiabOrigBal, setNewLiabOrigBal]   = useState('')
  const [newLiabRate, setNewLiabRate]         = useState('')
  const [liabNewBal, setLiabNewBal]           = useState('')

  // Snapshot state
  const [showSnapshotPanel, setShowSnapshotPanel] = useState(false)
  const [showImport, setShowImport]               = useState(false)
  const [importText, setImportText]               = useState('')
  const [importMsg, setImportMsg]                 = useState<string | null>(null)
  const [snapDate, setSnapDate]                   = useState(today())
  const [snapLiquid, setSnapLiquid]               = useState('')
  const [snapInvested, setSnapInvested]           = useState('')
  const [snapIliquid, setSnapIliquid]             = useState('')
  const [snapLiabilities, setSnapLiabilities]     = useState('')
  const [snapNotes, setSnapNotes]                 = useState('')

  const inputCls = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40'
  const lbl = 'block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1'

  function handleAddAsset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createAsset({
        name: newAssetName,
        asset_type: newAssetType as 'real_estate' | 'vehicle' | 'pension' | 'business' | 'crypto' | 'other',
        value_crc: parseFloat(newAssetValue),
        as_of_date: newAssetDate,
        is_investable: newAssetInv,
        notes: newAssetNotes || undefined,
      })
      if (result.error) { setError(result.error); return }
      setShowAddAsset(false)
      setNewAssetName(''); setNewAssetValue(''); setNewAssetDate(today())
      setNewAssetInv(false); setNewAssetNotes('')
    })
  }

  function handleUpdateAsset(assetId: string) {
    if (!assetNewVal) return
    setError(null)
    startTransition(async () => {
      const result = await updateAssetValue({
        asset_id: assetId,
        value_crc: parseFloat(assetNewVal),
        snapshot_date: assetNewDate,
      })
      if (result.error) { setError(result.error); return }
      setUpdatingAsset(null)
      setAssetNewVal(''); setAssetNewDate(today())
    })
  }

  function handleDeleteAsset(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deactivateAsset(id)
      if (result.error) setError(result.error)
    })
  }

  function handleAddLiab(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createLiability({
        name: newLiabName,
        liability_type: newLiabType as 'mortgage' | 'auto_loan' | 'personal_loan' | 'credit_card' | 'student_loan' | 'other',
        current_balance: parseFloat(newLiabBal),
        original_balance: newLiabOrigBal ? parseFloat(newLiabOrigBal) : undefined,
        interest_rate: newLiabRate ? parseFloat(newLiabRate) / 100 : undefined,
      })
      if (result.error) { setError(result.error); return }
      setShowAddLiab(false)
      setNewLiabName(''); setNewLiabBal(''); setNewLiabOrigBal(''); setNewLiabRate('')
    })
  }

  function handleUpdateLiab(liabId: string) {
    if (!liabNewBal) return
    setError(null)
    startTransition(async () => {
      const result = await updateLiabilityBalance(liabId, parseFloat(liabNewBal))
      if (result.error) { setError(result.error); return }
      setUpdatingLiab(null)
      setLiabNewBal('')
    })
  }

  function handleDeleteLiab(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deactivateLiability(id)
      if (result.error) setError(result.error)
    })
  }

  function handleSaveSnapshot(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await saveSnapshot({
        snapshot_date: snapDate,
        liquid_crc:      parseFloat(snapLiquid      || '0'),
        invested_crc:    parseFloat(snapInvested    || '0'),
        iliquid_crc:     parseFloat(snapIliquid     || '0'),
        liabilities_crc: parseFloat(snapLiabilities || '0'),
        notes: snapNotes || undefined,
      })
      if (result.error) { setError(result.error); return }
      setShowSnapshotPanel(false)
      setSnapNotes('')
    })
  }

  function prefillSnapshot() {
    setSnapDate(today())
    setSnapLiquid(String(Math.round(liquidBalance)))
    setSnapInvested(String(Math.round(totalInvested)))
    setSnapIliquid(String(Math.round(iliquidTotal)))
    setSnapLiabilities(String(Math.round(totalLiabilities)))
    setShowSnapshotPanel(true)
  }

  function handleImport() {
    setImportMsg(null)
    const parsed = parsePastedSnapshots(importText)
    if (typeof parsed === 'string') { setImportMsg(parsed); return }
    startTransition(async () => {
      const result = await bulkImportSnapshots(parsed)
      if (result.error) { setImportMsg(`Error: ${result.error}`); return }
      setImportMsg(`✓ ${result.count} snapshots importados`)
      setImportText('')
      setShowImport(false)
    })
  }

  function handleDeleteSnapshot(id: string) {
    startTransition(async () => {
      await deleteSnapshot(id)
    })
  }

  // Month-over-month and year-over-year delta from snapshots
  const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
  const lastSnap = sorted[sorted.length - 1]
  const prevMonthSnap = sorted[sorted.length - 2]

  // Liquidez and Inversiones are always live-computed from DB (reliable, no manual entry needed).
  // Ilíquido and Pasivos use the latest snapshot when available (requires manual recording).
  const dispLiq     = liquidBalance
  const dispInv     = totalInvested
  const dispIliq    = lastSnap ? Number(lastSnap.iliquid_crc)      : iliquidTotal
  const dispPasivos = lastSnap ? Number(lastSnap.liabilities_crc)  : totalLiabilities
  const dispActivos = dispLiq + dispInv + dispIliq
  const dispNW      = dispActivos - dispPasivos

  const pnColor = dispNW >= 0 ? 'text-[#a3e635]' : 'text-rose-400'
  const yearAgoSnap   = sorted.find(s => {
    const d = new Date(lastSnap?.snapshot_date ?? today())
    const target = new Date(d.getFullYear() - 1, d.getMonth(), 1)
    return s.snapshot_date.slice(0,7) === target.toISOString().slice(0,7)
  })
  const momDelta = lastSnap && prevMonthSnap
    ? Number(lastSnap.net_worth_crc) - Number(prevMonthSnap.net_worth_crc) : null
  const yoyDelta = lastSnap && yearAgoSnap
    ? Number(lastSnap.net_worth_crc) - Number(yearAgoSnap.net_worth_crc) : null

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em]">Balance Patrimonial</p>
          <h1 className="text-2xl font-black text-white mt-0.5">Patrimonio</h1>
          {lastSnap && (
            <p className="text-[10px] text-zinc-600 mt-0.5">Snapshot {lastSnap.snapshot_date.slice(0,7)}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06] mt-1 shrink-0">
          {(['CRC', 'USD'] as const).map(c => (
            <button key={c} onClick={() => setCurrency(c)}
              className={`px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-wider transition-all ${
                currency === c ? 'bg-[#a3e635] text-black' : 'text-zinc-500 hover:text-zinc-300'
              }`}>{c === 'CRC' ? '₡' : '$'}</button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2 md:col-span-1 bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Patrimonio Neto</p>
          <p className={`text-2xl font-black ${pnColor}`}>{fmt(dispNW)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Activos − Pasivos</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Total Activos</p>
          <p className="text-xl font-black text-white">{fmt(dispActivos)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Liq + Inv + Ilíq</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Pasivos</p>
          <p className="text-xl font-black text-rose-400">{fmt(dispPasivos)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Deuda total</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Invertibles</p>
          <p className="text-xl font-black text-blue-400">{fmt(activosInvertibles)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Para número FIRE</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-4">
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Composición</p>
        <BreakdownBar
          liquidBalance={dispLiq} totalInvested={dispInv}
          iliquidTotal={dispIliq} totalLiabilities={dispPasivos}
          totalActivos={dispActivos}
        />
      </div>

      {/* Composición detallada */}
      {netWorthItems.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-4">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Composición Detallada</p>
          <ComposicionDetallada
            items={netWorthItems}
            fmt={fmt}
            computedValues={{ liquidez: liquidBalance, inversiones: totalInvested }}
            liquidezBreakdown={envelopeBreakdown}
            inversionesBreakdown={bucketBreakdown}
          />
        </div>
      )}

      {/* Net worth trend + deltas */}
      <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp size={12} className="text-[#a3e635]" />
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Evolución Histórica</p>
            {snapshots.length > 0 && (
              <span className="text-[9px] text-zinc-600">{snapshots.length} meses</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {momDelta !== null && (
              <span className={`text-xs font-bold ${momDelta >= 0 ? 'text-[#a3e635]' : 'text-rose-400'}`}>
                {momDelta >= 0 ? '▲' : '▼'} {fmtShort(Math.abs(momDelta))} vs mes ant.
              </span>
            )}
            {yoyDelta !== null && (
              <span className={`text-xs font-bold ${yoyDelta >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                {yoyDelta >= 0 ? '▲' : '▼'} {fmtShort(Math.abs(yoyDelta))} vs 12m
              </span>
            )}
          </div>
        </div>
        <NetWorthChart snapshots={snapshots} fallback={monthlyTrend} fmt={fmt} assets={assets} liabilities={liabilities} />
      </div>

      {/* ── Historial Mensual ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Historial Mensual</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">Patrimonio neto registrado mes a mes</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(v => !v)}
              className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.04]">
              <Upload size={11} />
              Importar historial
            </button>
            <button onClick={prefillSnapshot}
              className="flex items-center gap-1.5 text-xs font-bold text-[#a3e635] hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-[#a3e635]/20 hover:bg-[#a3e635]/10">
              <Camera size={11} />
              Guardar snapshot
            </button>
          </div>
        </div>

        {/* Import panel */}
        {showImport && (
          <div className="bg-white/[0.03] rounded-xl border border-white/[0.08] p-4 space-y-3">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Pegar desde Google Sheets</p>
            <p className="text-[10px] text-zinc-600">
              Seleccioná el rango en tu hoja, copiá (Ctrl+C) y pegá abajo. Detecta encabezados automáticamente.<br/>
              <code className="text-zinc-400">Fecha · Líquido · Invertido · Ilíquido · Pasivos</code>
            </p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              rows={8}
              placeholder={"fecha\tliquido\tinvertido\tiliquido\tpasivos\n2024-01-31\t5000000\t8000000\t15000000\t3000000\n2024-02-29\t5200000\t8100000\t15000000\t2900000"}
              className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono placeholder-zinc-700 focus:outline-none focus:border-[#a3e635]/30 resize-y"
            />
            {importMsg && (
              <p className={`text-xs ${importMsg.startsWith('✓') ? 'text-[#a3e635]' : 'text-rose-400'}`}>{importMsg}</p>
            )}
            <div className="flex gap-2">
              <button onClick={handleImport} disabled={isPending || !importText.trim()}
                className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors">
                {isPending ? 'Importando…' : 'Importar'}
              </button>
              <button onClick={() => { setShowImport(false); setImportMsg(null) }}
                className="px-4 py-2 text-zinc-500 text-xs hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Save snapshot form */}
        {showSnapshotPanel && (
          <form onSubmit={handleSaveSnapshot} className="bg-white/[0.03] rounded-xl border border-[#a3e635]/20 p-4 space-y-3">
            <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-[0.14em]">Nuevo snapshot</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-2 md:col-span-1">
                <label className={lbl}>Fecha</label>
                <input type="date" value={snapDate} onChange={e => setSnapDate(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Líquido (₡)</label>
                <input type="number" min="0" step="any" value={snapLiquid} onChange={e => setSnapLiquid(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={lbl}>Invertido (₡)</label>
                <input type="number" min="0" step="any" value={snapInvested} onChange={e => setSnapInvested(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={lbl}>Ilíquido (₡)</label>
                <input type="number" min="0" step="any" value={snapIliquid} onChange={e => setSnapIliquid(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={lbl}>Pasivos (₡)</label>
                <input type="number" min="0" step="any" value={snapLiabilities} onChange={e => setSnapLiabilities(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={lbl}>Notas <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                <input type="text" value={snapNotes} onChange={e => setSnapNotes(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-zinc-500">
                Patrimonio neto: <span className={Number(snapLiquid||0)+Number(snapInvested||0)+Number(snapIliquid||0)-Number(snapLiabilities||0) >= 0 ? 'text-[#a3e635] font-bold' : 'text-rose-400 font-bold'}>
                  {fmtShort(Number(snapLiquid||0)+Number(snapInvested||0)+Number(snapIliquid||0)-Number(snapLiabilities||0))}
                </span>
              </div>
              <button type="submit" disabled={isPending}
                className="ml-auto px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors">
                {isPending ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" onClick={() => setShowSnapshotPanel(false)}
                className="px-4 py-2 text-zinc-500 text-xs hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Snapshot history table */}
        {sorted.length > 0 ? (
          <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-3 py-2 text-left text-[9px] font-black text-zinc-600 uppercase tracking-[0.12em]">Mes</th>
                  <th className="px-3 py-2 text-right text-[9px] font-black text-zinc-600 uppercase tracking-[0.12em]">Líquido</th>
                  <th className="px-3 py-2 text-right text-[9px] font-black text-zinc-600 uppercase tracking-[0.12em]">Invertido</th>
                  <th className="px-3 py-2 text-right text-[9px] font-black text-zinc-600 uppercase tracking-[0.12em]">Ilíquido</th>
                  <th className="px-3 py-2 text-right text-[9px] font-black text-zinc-600 uppercase tracking-[0.12em]">Pasivos</th>
                  <th className="px-3 py-2 text-right text-[9px] font-black text-zinc-600 uppercase tracking-[0.12em]">Patrimonio Neto</th>
                  <th className="px-1 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {sorted.slice().reverse().slice(0, 24).map((s, i) => {
                  const prev = sorted.slice().reverse()[i + 1]
                  const delta = prev ? Number(s.net_worth_crc) - Number(prev.net_worth_crc) : null
                  return (
                    <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="px-3 py-1.5 text-zinc-400">{s.snapshot_date.slice(0, 7)}</td>
                      <td className="px-3 py-1.5 text-right text-amber-400">{fmtShort(Number(s.liquid_crc))}</td>
                      <td className="px-3 py-1.5 text-right text-[#a3e635]">{fmtShort(Number(s.invested_crc))}</td>
                      <td className="px-3 py-1.5 text-right text-blue-400">{fmtShort(Number(s.iliquid_crc))}</td>
                      <td className="px-3 py-1.5 text-right text-rose-400">{fmtShort(Number(s.liabilities_crc))}</td>
                      <td className="px-3 py-1.5 text-right font-bold text-white">
                        {fmtShort(Number(s.net_worth_crc))}
                        {delta !== null && (
                          <span className={`ml-1.5 text-[9px] ${delta >= 0 ? 'text-[#a3e635]/70' : 'text-rose-400/70'}`}>
                            {delta >= 0 ? '▲' : '▼'}{fmtShort(Math.abs(delta))}
                          </span>
                        )}
                      </td>
                      <td className="px-1 py-1.5">
                        <button onClick={() => handleDeleteSnapshot(s.id)} disabled={isPending}
                          className="p-1 rounded text-zinc-700 hover:text-rose-400 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-zinc-600 bg-white/[0.02] rounded-xl border border-white/[0.04]">
            Sin snapshots aún. Importá tu historial desde Google Sheets o guardá el estado actual.
          </div>
        )}
      </div>

      {/* ── Activos Ilíquidos ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Activos Ilíquidos</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">Inmuebles, vehículos, pensión y otros bienes</p>
          </div>
          <button
            onClick={() => setShowAddAsset(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#a3e635] hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-[#a3e635]/20 hover:bg-[#a3e635]/10"
          >
            <Plus size={12} strokeWidth={3} />
            Agregar activo
          </button>
        </div>

        {showAddAsset && (
          <form onSubmit={handleAddAsset} className="bg-white/[0.03] rounded-xl border border-[#a3e635]/20 p-4 space-y-3">
            <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-[0.14em]">Nuevo activo</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Nombre</label>
                <input type="text" value={newAssetName} onChange={e => setNewAssetName(e.target.value)}
                  placeholder="Casa en Escazú, Toyota Corolla, OPC…" className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Tipo</label>
                <select value={newAssetType} onChange={e => setNewAssetType(e.target.value)} className={inputCls}>
                  {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Valor (₡ CRC)</label>
                <input type="number" min="0" step="any" value={newAssetValue}
                  onChange={e => setNewAssetValue(e.target.value)} placeholder="0" className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Fecha de valuación</label>
                <input type="date" value={newAssetDate} onChange={e => setNewAssetDate(e.target.value)}
                  className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Notas <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                <input type="text" value={newAssetNotes} onChange={e => setNewAssetNotes(e.target.value)}
                  placeholder="Descripción adicional…" className={inputCls} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={newAssetInv} onChange={e => setNewAssetInv(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-[#a3e635]" />
              <span className="text-xs text-zinc-400">Activo invertible — cuenta para el número FIRE</span>
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={isPending}
                className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors">
                {isPending ? 'Guardando…' : 'Guardar activo'}
              </button>
              <button type="button" onClick={() => setShowAddAsset(false)}
                className="px-4 py-2 text-zinc-500 text-xs hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {assets.length === 0 && !showAddAsset ? (
          <div className="text-center py-8 text-sm text-zinc-600 bg-white/[0.02] rounded-xl border border-white/[0.04]">
            Sin activos ilíquidos registrados.
            <br />
            <span className="text-xs">Agregá tu primera propiedad, vehículo o pensión.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {assets.map(asset => (
              <div key={asset.id} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white truncate">{asset.name}</p>
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                        {ASSET_LABEL[asset.asset_type] ?? asset.asset_type}
                      </span>
                      {asset.is_investable && (
                        <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-[#a3e635]/10 text-[#a3e635]">
                          Invertible
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Valuado al {asset.as_of_date}</p>
                    {asset.notes && <p className="text-[10px] text-zinc-600 mt-0.5">{asset.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <p className="text-base font-black text-white">{fmtShort(asset.value_crc)}</p>
                    <button
                      onClick={() => { setUpdatingAsset(asset.id); setAssetNewVal(String(asset.value_crc)); setAssetNewDate(today()) }}
                      className="p-1.5 rounded-lg text-zinc-600 hover:text-[#a3e635] hover:bg-[#a3e635]/10 transition-colors"
                      title="Actualizar valor"
                    >
                      <RefreshCw size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteAsset(asset.id)} disabled={isPending}
                      className="p-1.5 rounded-lg text-zinc-700 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                      title="Eliminar activo"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {updatingAsset === asset.id && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap gap-2 items-end">
                    <div>
                      <label className={lbl}>Nuevo valor (₡)</label>
                      <input type="number" min="0" step="any" value={assetNewVal}
                        onChange={e => setAssetNewVal(e.target.value)}
                        className="w-40 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#a3e635]/40" />
                    </div>
                    <div>
                      <label className={lbl}>Fecha</label>
                      <input type="date" value={assetNewDate} onChange={e => setAssetNewDate(e.target.value)}
                        className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#a3e635]/40" />
                    </div>
                    <button onClick={() => handleUpdateAsset(asset.id)} disabled={isPending || !assetNewVal}
                      className="px-3 py-1.5 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors">
                      {isPending ? '…' : 'Actualizar'}
                    </button>
                    <button onClick={() => setUpdatingAsset(null)}
                      className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pasivos ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Pasivos</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">Hipotecas, préstamos, tarjetas de crédito</p>
          </div>
          <button
            onClick={() => setShowAddLiab(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-rose-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-rose-400/20 hover:bg-rose-400/10"
          >
            <Plus size={12} strokeWidth={3} />
            Agregar pasivo
          </button>
        </div>

        {showAddLiab && (
          <form onSubmit={handleAddLiab} className="bg-white/[0.03] rounded-xl border border-rose-400/20 p-4 space-y-3">
            <p className="text-[9px] font-black text-rose-400/60 uppercase tracking-[0.14em]">Nuevo pasivo</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Nombre</label>
                <input type="text" value={newLiabName} onChange={e => setNewLiabName(e.target.value)}
                  placeholder="Hipoteca BN, Tarjeta Visa…" className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Tipo</label>
                <select value={newLiabType} onChange={e => setNewLiabType(e.target.value)} className={inputCls}>
                  {LIABILITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Saldo actual (₡)</label>
                <input type="number" min="0" step="any" value={newLiabBal}
                  onChange={e => setNewLiabBal(e.target.value)} placeholder="0" className={inputCls} required />
              </div>
              <div>
                <label className={lbl}>Saldo original (₡) <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                <input type="number" min="0" step="any" value={newLiabOrigBal}
                  onChange={e => setNewLiabOrigBal(e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <label className={lbl}>Tasa de interés % anual <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                <input type="number" min="0" step="any" value={newLiabRate}
                  onChange={e => setNewLiabRate(e.target.value)} placeholder="12.5" className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isPending}
                className="px-4 py-2 rounded-lg bg-rose-500 text-white text-xs font-black hover:bg-rose-400 disabled:opacity-50 transition-colors">
                {isPending ? 'Guardando…' : 'Guardar pasivo'}
              </button>
              <button type="button" onClick={() => setShowAddLiab(false)}
                className="px-4 py-2 text-zinc-500 text-xs hover:text-zinc-300 transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {liabilities.length === 0 && !showAddLiab ? (
          <div className="text-center py-8 text-sm text-zinc-600 bg-white/[0.02] rounded-xl border border-white/[0.04]">
            Sin pasivos registrados.
          </div>
        ) : (
          <div className="space-y-2">
            {liabilities.map(liab => {
              const remainingPct = liab.original_balance
                ? Math.min((liab.current_balance / liab.original_balance) * 100, 100)
                : null
              const paidPct = remainingPct != null ? (100 - remainingPct).toFixed(0) : null

              return (
                <div key={liab.id} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-white truncate">{liab.name}</p>
                        <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">
                          {LIABILITY_LABEL[liab.liability_type] ?? liab.liability_type}
                        </span>
                        {liab.interest_rate != null && (
                          <span className="shrink-0 text-[9px] text-zinc-600">
                            {(liab.interest_rate * 100).toFixed(1)}% anual
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        Actualizado {liab.as_of_date}
                        {paidPct != null && ` · ${paidPct}% pagado`}
                      </p>
                      {remainingPct != null && (
                        <div className="mt-2 h-1 bg-white/[0.06] rounded-full overflow-hidden w-28">
                          <div
                            style={{ width: `${remainingPct.toFixed(1)}%` }}
                            className="h-full bg-rose-500/60 rounded-full"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <p className="text-base font-black text-rose-400">{fmtShort(liab.current_balance)}</p>
                      <button
                        onClick={() => { setUpdatingLiab(liab.id); setLiabNewBal(String(liab.current_balance)) }}
                        className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                        title="Actualizar saldo"
                      >
                        <RefreshCw size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteLiab(liab.id)} disabled={isPending}
                        className="p-1.5 rounded-lg text-zinc-700 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                        title="Eliminar pasivo"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {updatingLiab === liab.id && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap gap-2 items-end">
                      <div>
                        <label className={lbl}>Nuevo saldo (₡)</label>
                        <input type="number" min="0" step="any" value={liabNewBal}
                          onChange={e => setLiabNewBal(e.target.value)}
                          className="w-40 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#a3e635]/40" />
                      </div>
                      <button onClick={() => handleUpdateLiab(liab.id)} disabled={isPending || !liabNewBal}
                        className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-black hover:bg-rose-400 disabled:opacity-50 transition-colors">
                        {isPending ? '…' : 'Actualizar'}
                      </button>
                      <button onClick={() => setUpdatingLiab(null)}
                        className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}

