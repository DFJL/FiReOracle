'use client'

import { useState } from 'react'
import type { BucketData } from './buckets'

function fmtCRC(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)     return `₡${Math.round(n / 1_000)}K`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

// ── Mini donut SVG ────────────────────────────────────────────────────────────

function Donut({ slices }: { slices: { pct: number; color: string }[] }) {
  const R = 40, cx = 50, cy = 50, stroke = 14
  const circ = 2 * Math.PI * R
  let offset = 0
  const segments = slices.map(s => {
    const len = (s.pct / 100) * circ
    const seg = { ...s, len, offset }
    offset += len
    return seg
  })
  return (
    <svg viewBox="0 0 100 100" width="120" height="120" className="shrink-0">
      {segments.map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={R}
          fill="none" stroke={s.color} strokeWidth={stroke}
          strokeDasharray={`${s.len} ${circ - s.len}`}
          strokeDashoffset={-s.offset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
        />
      ))}
    </svg>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function PortfolioView({ buckets, liquidBalance, totalInvested, totalPatrimony }: {
  buckets: BucketData[]
  liquidBalance: number
  totalInvested: number
  totalPatrimony: number
}) {
  const [selected, setSelected] = useState<string | null>(null)

  const sel = selected ? buckets.find(b => b.key === selected) : null

  const donutSlices = [
    ...buckets.map(b => ({ pct: totalInvested > 0 ? (b.balance / totalInvested) * 100 : 0, color: b.color })),
  ]

  const now = new Date()
  const monthLabel = now.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }).toUpperCase()

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <p className="text-[9px] font-black text-[#a3e635]/60 tracking-[0.22em] uppercase mb-1">
          Fire Oracle · {monthLabel}
        </p>
        <p className="text-3xl font-black text-white tracking-tight leading-none">Portafolio</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[#a3e635]/[0.06] rounded-2xl overflow-hidden border border-[#a3e635]/[0.08]">
        {[
          { label: 'Patrimonio total', value: fmtCRC(totalPatrimony), color: 'text-[#a3e635]' },
          { label: 'Invertido',         value: fmtCRC(totalInvested),  color: 'text-blue-400' },
          { label: 'Liquidez',          value: fmtCRC(liquidBalance),  color: 'text-amber-400' },
        ].map(k => (
          <div key={k.label} className="bg-[#0d120d] px-4 py-4 flex flex-col gap-1.5">
            <p className={`text-2xl font-black tabular-nums leading-none ${k.color}`}>{k.value}</p>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.16em]">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Donut + bucket list */}
      <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5">
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-4">Distribución</p>
        <div className="flex gap-6 items-center flex-wrap">
          <Donut slices={donutSlices} />
          <div className="flex-1 min-w-0 space-y-2">
            {buckets.map(b => {
              const pct = totalInvested > 0 ? (b.balance / totalInvested) * 100 : 0
              const active = selected === b.key
              return (
                <button key={b.key} onClick={() => setSelected(active ? null : b.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${active ? 'bg-white/[0.06] border-white/[0.10]' : 'border-transparent hover:bg-white/[0.03]'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200 truncate">{b.name}</p>
                        <p className="text-[9px] text-zinc-600">{b.industry}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black tabular-nums text-zinc-100">{fmtCRC(b.balance)}</p>
                      <p className="text-[9px] tabular-nums" style={{ color: b.color }}>{pct.toFixed(1)}%</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color, opacity: 0.7 }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bucket detail — shown when selected */}
      {sel && (
        <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Detalle</p>
              <p className="text-xl font-black text-white mt-0.5">{sel.name}</p>
              <p className="text-xs text-zinc-500">{sel.industry}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-zinc-600 hover:text-zinc-400 text-xs">✕</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Balance',       value: fmtCRC(sel.balance),       color: 'text-white',      sub: 'cash neto' },
              { label: 'Depósitos',     value: fmtCRC(sel.deposits),      color: 'text-zinc-200',   sub: 'cash in' },
              { label: 'Liquidaciones', value: fmtCRC(sel.liquidaciones), color: 'text-rose-400',   sub: 'cash out' },
              { label: 'Rendimientos',  value: fmtCRC(sel.rendimientos),  color: 'text-[#a3e635]',  sub: 'cash returns' },
            ].map(k => (
              <div key={k.label} className="rounded-xl bg-white/[0.03] px-3 py-3">
                <p className={`text-base font-black tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-1">{k.label}</p>
                <p className="text-[9px] text-zinc-700">{k.sub}</p>
              </div>
            ))}
          </div>

          {sel.valorizationNet !== 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Valorización neta</span>
              <span className={`text-sm font-black tabular-nums ml-auto ${sel.valorizationNet >= 0 ? 'text-[#a3e635]' : 'text-rose-400'}`}>
                {fmtPct(0)}{fmtCRC(sel.valorizationNet)}
              </span>
              <span className="text-[9px] text-zinc-700">mark-to-market · no cash</span>
            </div>
          )}

          {/* ROI */}
          {sel.deposits > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">ROI cash</span>
              <span className={`text-sm font-black tabular-nums ml-auto ${sel.rendimientos - sel.liquidaciones + sel.balance - sel.deposits >= 0 ? 'text-[#a3e635]' : 'text-rose-400'}`}>
                {fmtPct(((sel.balance - sel.deposits) / sel.deposits) * 100)}
              </span>
              <span className="text-[9px] text-zinc-700">(balance − depósitos) / depósitos</span>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
