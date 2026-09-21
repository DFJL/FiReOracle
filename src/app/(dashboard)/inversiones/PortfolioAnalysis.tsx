'use client'

import { useState } from 'react'
import type { PortfolioTarget } from '@/app/actions/portfolio'
import type { BucketData } from './buckets'

// ── types ─────────────────────────────────────────────────────────────────────

export type MonthlyContribution = {
  month: string           // 'YYYY-MM'
  bucketId: string
  amount: number          // CRC deposit amount (not counting returns)
}

export type MonthlyIncome = {
  month: string
  amount: number
}

export type EnvelopeCluster = {
  type: 'liquidez' | 'emergencia' | 'meta_especifica' | 'inversion' | 'sin_tipo'
  label: string
  balance: number
  envelopes: { id: string; name: string; custodio: string; balance: number }[]
}

// ── helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  liquidez:       'Liquidez',
  emergencia:     'Emergencia',
  meta_especifica: 'Metas',
  inversion:      'Inversión',
  sin_tipo:       'Sin clasificar',
}

const TYPE_COLORS: Record<string, string> = {
  liquidez:       '#60a5fa',
  emergencia:     '#f59e0b',
  meta_especifica: '#a78bfa',
  inversion:      '#34d399',
  sin_tipo:       '#52525b',
}

function fmtM(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)    return `₡${(n / 1_000).toFixed(0)}k`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function fmtPct(n: number) { return `${n.toFixed(1)}%` }

const last12months = (): string[] => {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(d.toISOString().slice(0, 7))
  }
  return months
}

function shortMonth(ym: string) {
  const [y, m] = ym.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('es-CR', { month: 'short' }).replace('.', '')
}

// ── Contribution bar chart ─────────────────────────────────────────────────────

function ContributionChart({
  contributions, income, buckets, targets,
}: {
  contributions: MonthlyContribution[]
  income: MonthlyIncome[]
  buckets: BucketData[]
  targets: PortfolioTarget[]
}) {
  const months = last12months()
  const incomeByMonth = Object.fromEntries(income.map(i => [i.month, i.amount]))

  // Group contributions by month+bucket, as % of income
  const data = months.map(m => {
    const monthIncome = incomeByMonth[m] ?? 0
    const bucketAmts = buckets.map(b => {
      const total = contributions
        .filter(c => c.month === m && c.bucketId === b.key)
        .reduce((s, c) => s + c.amount, 0)
      return { key: b.key, color: b.color, name: b.name, amount: total, pct: monthIncome > 0 ? (total / monthIncome) * 100 : 0 }
    })
    const totalPct = bucketAmts.reduce((s, b) => s + b.pct, 0)
    return { month: m, income: monthIncome, buckets: bucketAmts, totalPct }
  })

  const maxPct = Math.max(...data.map(d => d.totalPct), 20)
  const targetTotalPct = targets.reduce((s, t) => s + (t.targetPctIncome ?? 0), 0)

  return (
    <div>
      <div className="flex items-end gap-1 h-40 relative">
        {/* Target line */}
        {targetTotalPct > 0 && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-[#a3e635]/50 z-10"
            style={{ bottom: `${(targetTotalPct / maxPct) * 100}%` }}
          >
            <span className="absolute right-0 -top-4 text-[9px] text-[#a3e635]/70 font-black">
              meta {fmtPct(targetTotalPct)}
            </span>
          </div>
        )}

        {data.map(d => (
          <div key={d.month} className="flex-1 flex flex-col justify-end gap-[1px] relative group">
            {d.income === 0 ? (
              <div className="w-full h-1 bg-white/[0.04] rounded-sm" />
            ) : (
              d.buckets.filter(b => b.pct > 0).map(b => (
                <div
                  key={b.key}
                  className="w-full rounded-sm transition-opacity group-hover:opacity-80"
                  style={{
                    height: `${Math.max((b.pct / maxPct) * 160, 2)}px`,
                    background: b.color,
                  }}
                  title={`${b.name}: ${fmtPct(b.pct)} del ingreso`}
                />
              ))
            )}
            {/* Tooltip on hover */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#111] border border-white/[0.08] rounded-lg p-2 text-[9px] text-zinc-300 whitespace-nowrap z-20 hidden group-hover:block">
              <p className="font-black text-white mb-1">{shortMonth(d.month)}</p>
              {d.income > 0 ? (
                <>
                  {d.buckets.filter(b => b.amount > 0).map(b => (
                    <p key={b.key} style={{ color: b.color }}>{b.name}: {fmtPct(b.pct)} ({fmtM(b.amount)})</p>
                  ))}
                  <p className="text-zinc-500 mt-0.5">Ingreso: {fmtM(d.income)}</p>
                  {d.buckets.every(b => b.amount === 0) && <p className="text-zinc-600">Sin aportes</p>}
                </>
              ) : (
                <p className="text-zinc-600">Sin ingresos registrados</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* X axis labels */}
      <div className="flex gap-1 mt-1">
        {months.map(m => (
          <div key={m} className="flex-1 text-center text-[8px] text-zinc-600">{shortMonth(m)}</div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3">
        {buckets.map(b => (
          <div key={b.key} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: b.color }} />
            <span className="text-[9px] text-zinc-500">{b.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Envelope cluster breakdown ────────────────────────────────────────────────

function EnvelopeClusters({ clusters }: { clusters: EnvelopeCluster[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const total = clusters.reduce((s, c) => s + c.balance, 0)

  return (
    <div className="space-y-2">
      {clusters.filter(c => c.balance !== 0 || c.envelopes.length > 0).map(c => (
        <div key={c.type} className="rounded-xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
          <button
            className="w-full flex items-center gap-3 p-3 text-left"
            onClick={() => setExpanded(expanded === c.type ? null : c.type)}
          >
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TYPE_COLORS[c.type] }} />
            <span className="flex-1 text-sm text-zinc-200">{c.label}</span>
            <span className="text-xs text-zinc-400 font-black">{fmtM(c.balance)}</span>
            <span className="text-[9px] text-zinc-600 ml-1">
              {total > 0 ? fmtPct((c.balance / total) * 100) : '—'}
            </span>
            <span className="text-zinc-600 text-[10px] ml-2">{expanded === c.type ? '▲' : '▼'}</span>
          </button>

          {expanded === c.type && c.envelopes.length > 0 && (
            <div className="border-t border-white/[0.04] px-3 pb-3 pt-2 space-y-1">
              {c.envelopes.map(e => (
                <div key={e.id} className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">{e.custodio} › {e.name}</span>
                  <span className="text-[10px] text-zinc-400">{fmtM(e.balance)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

const TABS = ['Contribuciones', 'Sobres'] as const
type Tab = typeof TABS[number]

export function PortfolioAnalysis({
  buckets,
  contributions,
  income,
  clusters,
  targets,
}: {
  buckets: BucketData[]
  contributions: MonthlyContribution[]
  income: MonthlyIncome[]
  clusters: EnvelopeCluster[]
  targets: PortfolioTarget[]
}) {
  const [tab, setTab] = useState<Tab>('Contribuciones')

  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-white tracking-tight">Análisis de portafolio</h2>
          <p className="text-[10px] text-zinc-600 mt-0.5">Contribuciones históricas · Liquidez — metas de asignación en Distribución</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.03] rounded-lg p-0.5 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-md text-[10px] font-black tracking-wide transition-all ${
              tab === t ? 'bg-[#a3e635] text-black' : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Contribuciones tab */}
      {tab === 'Contribuciones' && (
        <div className="space-y-4">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-3">
              Aportes mensuales como % del ingreso — últimos 12 meses
            </p>
            <ContributionChart
              contributions={contributions}
              income={income}
              buckets={buckets}
              targets={targets}
            />
          </div>

          {/* Monthly stats */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.05]">
            {(() => {
              const months = last12months()
              const incomeByMonth = Object.fromEntries(income.map(i => [i.month, i.amount]))
              const activeMonths = months.filter(m => incomeByMonth[m] > 0)
              if (activeMonths.length === 0) return null
              const avgIncome = activeMonths.reduce((s, m) => s + incomeByMonth[m], 0) / activeMonths.length
              const avgTotalContrib = activeMonths.reduce((s, m) => {
                const total = contributions.filter(c => c.month === m).reduce((x, c) => x + c.amount, 0)
                return s + total
              }, 0) / activeMonths.length
              const avgPct = avgIncome > 0 ? (avgTotalContrib / avgIncome) * 100 : 0
              const lastMonthsWithContrib = months.filter(m =>
                contributions.some(c => c.month === m && c.amount > 0)
              )
              const lastContrib = lastMonthsWithContrib[lastMonthsWithContrib.length - 1]
              const monthsSinceLast = lastContrib
                ? months.length - 1 - months.indexOf(lastContrib)
                : null

              return (
                <>
                  <div className="bg-white/[0.02] rounded-xl p-3">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Promedio mensual</p>
                    <p className="text-lg font-black text-white mt-1">{fmtPct(avgPct)}</p>
                    <p className="text-[9px] text-zinc-600">del ingreso va a inversiones</p>
                  </div>
                  <div className="bg-white/[0.02] rounded-xl p-3">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Último aporte</p>
                    {monthsSinceLast === 0 ? (
                      <p className="text-lg font-black text-[#a3e635] mt-1">Este mes</p>
                    ) : monthsSinceLast != null ? (
                      <p className="text-lg font-black text-amber-400 mt-1">hace {monthsSinceLast}m</p>
                    ) : (
                      <p className="text-lg font-black text-rose-400 mt-1">+12 meses</p>
                    )}
                    <p className="text-[9px] text-zinc-600">sin aportes a inversiones</p>
                  </div>
                </>
              )
            })()}
          </div>

          {/* Per-bucket last contrib */}
          <div className="space-y-1 pt-2 border-t border-white/[0.05]">
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em] mb-2">Último aporte por bucket</p>
            {buckets.map(b => {
              const months = last12months()
              const lastM = [...months].reverse().find(m =>
                contributions.some(c => c.month === m && c.bucketId === b.key && c.amount > 0)
              )
              const mAgo = lastM ? months.length - 1 - months.indexOf(lastM) : null
              return (
                <div key={b.key} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                  <span className="flex-1 text-xs text-zinc-400">{b.name}</span>
                  {mAgo === 0 && <span className="text-[9px] font-black text-[#a3e635]">este mes</span>}
                  {mAgo != null && mAgo > 0 && (
                    <span className={`text-[9px] font-black ${mAgo >= 3 ? 'text-amber-400' : 'text-zinc-500'}`}>
                      hace {mAgo}m
                    </span>
                  )}
                  {mAgo === null && <span className="text-[9px] text-rose-400 font-black">sin aportes</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Sobres tab */}
      {tab === 'Sobres' && (
        <div className="space-y-3">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">
            Sobres por categoría — etiquetalos en Configuración
          </p>
          <EnvelopeClusters clusters={clusters} />
        </div>
      )}
    </div>
  )
}
