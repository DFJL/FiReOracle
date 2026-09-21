'use client'

import { useState, useTransition } from 'react'
import type { BucketData, BucketTx } from './buckets'
import type { ExchangeRate } from '@/lib/exchange-rate'
import { AccountSyncPanel } from '@/components/AccountSyncPanel'
import { upsertPortfolioTarget, type PortfolioTarget } from '@/app/actions/portfolio'

function fmtCRC(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(2)}M`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function fmtUSD(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Full precision, never abbreviated — for the lines that get reconciled against
// a real account statement. "₡33.31M" hides up to ₡5,000, more than the
// month-over-month movement being compared.
function fmtCRCFull(n: number) {
  return `₡${n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtUSDFull(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

const LIQUID_KEY   = '__liquidez__'
const LIQUID_COLOR = '#f59e0b'

// ── Donut ─────────────────────────────────────────────────────────────────────

function Donut({
  slices,
  selected,
  onSelect,
}: {
  slices: { pct: number; color: string; key: string }[]
  selected: string | null
  onSelect: (key: string) => void
}) {
  const R = 40, cx = 50, cy = 50, strokeW = 14
  const circ = 2 * Math.PI * R
  let offset = 0
  const segments = slices.map(s => {
    const len = (s.pct / 100) * circ
    const seg = { ...s, len, offset }
    offset += len
    return seg
  })
  return (
    <svg viewBox="0 0 100 100" width="130" height="130" className="shrink-0">
      {segments.map((s, i) => {
        const active = selected === s.key
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={active ? strokeW + 3 : strokeW}
            strokeDasharray={`${s.len} ${circ - s.len}`}
            strokeDashoffset={-s.offset}
            opacity={selected && !active ? 0.35 : 1}
            style={{
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
              cursor: 'pointer',
              transition: 'stroke-width 0.15s, opacity 0.15s',
            }}
            onClick={() => onSelect(s.key)}
          />
        )
      })}
    </svg>
  )
}

// ── Currency toggle ───────────────────────────────────────────────────────────

function CurrencyToggle({ currency, onChange }: { currency: 'CRC' | 'USD'; onChange: (c: 'CRC' | 'USD') => void }) {
  return (
    <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
      {(['CRC', 'USD'] as const).map(c => (
        <button key={c} onClick={() => onChange(c)}
          className={`px-3 py-1 rounded-md text-[10px] font-black tracking-wider transition-all ${
            currency === c ? 'bg-[#a3e635] text-black' : 'text-zinc-500 hover:text-zinc-300'
          }`}>
          {c === 'CRC' ? '₡ CRC' : '$ USD'}
        </button>
      ))}
    </div>
  )
}

// ── Target editor ─────────────────────────────────────────────────────────────
// Single place to set allocation goals — both % of portfolio (drives the gap
// markers below) and % of income/month (drives the target line on the
// Contribuciones tab). Used to be duplicated as a whole separate "Asignación"
// tab with its own current-vs-target bars, which just re-rendered this same
// Distribución list a second time with a target overlay.

function TargetEditor({
  rows, targets: initial, onSaved,
}: {
  rows: { key: string; label: string; color: string }[]
  targets: PortfolioTarget[]
  onSaved: (targets: PortfolioTarget[]) => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  type Draft = { bucketKey: string; label: string; pctPortfolio: string; pctIncome: string }

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    rows.map(r => {
      const t = initial.find(t => t.bucketKey === r.key)
      return {
        bucketKey: r.key,
        label: r.label,
        pctPortfolio: t?.targetPctPortfolio?.toString() ?? '',
        pctIncome:    t?.targetPctIncome?.toString()    ?? '',
      }
    })
  )

  const totalPctPortfolio = drafts.reduce((s, d) => s + (parseFloat(d.pctPortfolio) || 0), 0)
  const totalPctIncome    = drafts.reduce((s, d) => s + (parseFloat(d.pctIncome)    || 0), 0)

  function save() {
    setError(null)
    startTransition(async () => {
      const saved: PortfolioTarget[] = []
      for (const d of drafts) {
        const pp = d.pctPortfolio ? parseFloat(d.pctPortfolio) : null
        const pi = d.pctIncome    ? parseFloat(d.pctIncome)    : null
        if (pp == null && pi == null) continue
        const res = await upsertPortfolioTarget(d.bucketKey, d.label, pp, pi)
        if (res.error) { setError(res.error); return }
        saved.push({ id: d.bucketKey, bucketKey: d.bucketKey, label: d.label, targetPctPortfolio: pp, targetPctIncome: pi })
      }
      onSaved(saved)
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 items-center">
        <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Bucket</span>
        <span className="text-[9px] text-zinc-600 uppercase tracking-wider text-center">% portafolio</span>
        <span className="text-[9px] text-zinc-600 uppercase tracking-wider text-center">% ingreso/mes</span>

        {drafts.map((d, i) => {
          const row = rows.find(r => r.key === d.bucketKey)
          return (
            <>
              <div key={`${d.bucketKey}-label`} className="flex items-center gap-1.5">
                {row && <div className="w-2 h-2 rounded-full" style={{ background: row.color }} />}
                <span className="text-xs text-zinc-300">{d.label}</span>
              </div>
              <input
                key={`${d.bucketKey}-pp`}
                type="number" min="0" max="100" step="0.5"
                value={d.pctPortfolio}
                onChange={e => setDrafts(prev => prev.map((x, j) => j === i ? { ...x, pctPortfolio: e.target.value } : x))}
                placeholder="—"
                className="w-16 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white text-center placeholder-zinc-700 focus:outline-none focus:border-[#a3e635]/40"
              />
              <input
                key={`${d.bucketKey}-pi`}
                type="number" min="0" max="100" step="0.5"
                value={d.pctIncome}
                onChange={e => setDrafts(prev => prev.map((x, j) => j === i ? { ...x, pctIncome: e.target.value } : x))}
                placeholder="—"
                className="w-16 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white text-center placeholder-zinc-700 focus:outline-none focus:border-[#a3e635]/40"
              />
            </>
          )
        })}

        <div className="text-[9px] text-zinc-600 font-black">Total</div>
        <div className={`text-[9px] text-center font-black ${totalPctPortfolio > 100 ? 'text-rose-400' : 'text-zinc-400'}`}>{fmtPct(totalPctPortfolio)}</div>
        <div className="text-[9px] text-zinc-400 text-center font-black">{fmtPct(totalPctIncome)}</div>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <button onClick={save} disabled={pending}
        className="px-4 py-1.5 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50">
        {pending ? '...' : 'Guardar metas'}
      </button>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

type EnvEntry = { id: string; name: string; color: string | null; balance: number }
type CustodioGroup = { name: string; total: number; envelopes: EnvEntry[] }

const TX_META: Record<string, { label: string; color: string; sign: 1 | -1 }> = {
  deposit:      { label: 'Depósito',    color: '#60a5fa', sign:  1 },
  liquidacion:  { label: 'Liquidación', color: '#f87171', sign: -1 },
  rendimiento:  { label: 'Rendimiento', color: '#a3e635', sign:  1 },
  valorizacion: { label: 'Valoriz.',    color: '#86efac', sign:  1 },
  perdida:      { label: 'Pérdida',     color: '#fb923c', sign: -1 },
  gasto_directo:{ label: 'Gasto directo', color: '#c084fc', sign: -1 },
  otro:         { label: 'Otro',        color: '#a1a1aa', sign: -1 },
}

export function PortfolioView({ buckets, liquidBalance, totalInvested, totalPatrimony, exchangeRate, liquidBreakdown, bucketTransactions, targets: initialTargets }: {
  buckets: BucketData[]
  liquidBalance: number
  totalInvested: number
  totalPatrimony: number
  exchangeRate: ExchangeRate
  liquidBreakdown: CustodioGroup[]
  bucketTransactions: Record<string, BucketTx[]>
  targets: PortfolioTarget[]
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('USD')
  const [showAllTx, setShowAllTx] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [targets, setTargets] = useState(initialTargets)
  const [editingTargets, setEditingTargets] = useState(false)

  const rate   = exchangeRate.sell
  const toUSD  = (crc: number) => crc / rate
  const fmt    = (crc: number) => currency === 'CRC' ? fmtCRC(crc) : fmtUSD(toUSD(crc))
  const fmtFull = (crc: number) => currency === 'CRC' ? fmtCRCFull(crc) : fmtUSDFull(toUSD(crc))

  // For a snapshot-backed USD account, showing USD means showing the exact
  // number that was typed in at sync time — re-deriving it from the CRC total
  // via today's live rate drifts with every FX tick even though nothing about
  // the real account changed. CRC view has no native figure to fall back on,
  // so it stays a live reconversion (expected to move with the rate).
  const bucketBalanceLabel = (b: BucketData) =>
    currency === 'USD' && b.accountCurrency === 'USD' && b.balanceNative != null
      ? fmtUSDFull(b.balanceNative)
      : fmtFull(b.balance)

  // Synthetic liquidez entry appended to bucket list
  const liquidItem: BucketData = {
    key: LIQUID_KEY,
    name: 'Liquidez',
    industry: 'Cuentas líquidas',
    color: LIQUID_COLOR,
    vendors: [],
    balance: liquidBalance,
    deposits: 0, liquidaciones: 0, rendimientos: 0,
    passiveValuation: 0, markToMarketLoss: 0, directSpend: 0, valorizationNet: 0,
  }

  // Largest first — same order the donut segments follow.
  const allItems = [...buckets, liquidItem].sort((a, b) => b.balance - a.balance)

  function toggle(key: string) {
    setSelected(prev => prev === key ? null : key)
    setShowAllTx(false)
    setSyncOpen(false)
  }

  const donutSlices = allItems.map(b => ({
    pct:   totalPatrimony > 0 ? (b.balance / totalPatrimony) * 100 : 0,
    color: b.color,
    key:   b.key,
  }))

  const sel = selected ? allItems.find(b => b.key === selected) ?? null : null

  const targetRows = allItems.map(b => ({ key: b.key, label: b.name, color: b.color }))

  const now        = new Date()
  const monthLabel = now.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }).toUpperCase()

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[9px] font-black text-[#a3e635]/60 tracking-[0.22em] uppercase mb-1">
            Fire Oracle · {monthLabel}
          </p>
          <p className="text-3xl font-black text-white tracking-tight leading-none">Portafolio</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <CurrencyToggle currency={currency} onChange={setCurrency} />
          <p className="text-[9px] text-zinc-600">
            TC venta ₡{rate.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {' · '}{exchangeRate.source} · {exchangeRate.date}
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[#a3e635]/[0.06] rounded-2xl overflow-hidden border border-[#a3e635]/[0.08]">
        {[
          { label: 'Patrimonio total', crc: totalPatrimony, color: 'text-[#a3e635]' },
          { label: 'Invertido',        crc: totalInvested,  color: 'text-blue-400' },
          { label: 'Liquidez',         crc: liquidBalance,  color: 'text-amber-400' },
        ].map(k => (
          <div key={k.label} className="bg-[#0d120d] px-4 py-4 flex flex-col gap-1.5">
            <p className={`text-2xl font-black tabular-nums leading-none ${k.color}`}>{fmt(k.crc)}</p>
            {currency === 'CRC' && (
              <p className="text-[10px] tabular-nums text-zinc-600">{fmtUSD(toUSD(k.crc))}</p>
            )}
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.16em]">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Donut + item list */}
      <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Distribución</p>
          <button onClick={() => setEditingTargets(v => !v)}
            className="text-[9px] font-black text-zinc-500 hover:text-zinc-300 transition-colors">
            {editingTargets ? 'Cerrar' : targets.length === 0 ? '+ Metas' : 'Editar metas'}
          </button>
        </div>
        <div className="flex gap-6 items-center flex-wrap">
          <Donut slices={donutSlices} selected={selected} onSelect={toggle} />
          <div className="flex-1 min-w-0 space-y-1.5">
            {allItems.map(b => {
              const pct    = totalPatrimony > 0 ? (b.balance / totalPatrimony) * 100 : 0
              const active = selected === b.key
              const target = targets.find(t => t.bucketKey === b.key)
              const targetPct = target?.targetPctPortfolio ?? null
              const gap = targetPct != null ? pct - targetPct : null
              const status = gap == null ? null : gap > 3 ? 'over' : gap < -3 ? 'under' : 'ok'
              return (
                <button key={b.key} onClick={() => toggle(b.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                    active ? 'bg-white/[0.06] border-white/[0.10]' : 'border-transparent hover:bg-white/[0.03]'
                  }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200 truncate">{b.name}</p>
                        <p className="text-[9px] text-zinc-600">{b.industry}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black tabular-nums text-zinc-100">{bucketBalanceLabel(b)}</p>
                      <div className="flex items-center gap-1.5 justify-end">
                        <p className="text-[9px] tabular-nums" style={{ color: b.color }}>{pct.toFixed(1)}%</p>
                        {targetPct != null && <p className="text-[8px] text-zinc-700">meta {targetPct.toFixed(1)}%</p>}
                        {status === 'over'  && <span className="text-[8px] font-black text-amber-400">▲</span>}
                        {status === 'under' && <span className="text-[8px] font-black text-rose-400">▼</span>}
                      </div>
                    </div>
                  </div>
                  <div className="relative mt-1.5 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: b.color, opacity: active ? 0.9 : 0.55 }} />
                    {targetPct != null && (
                      <div className="absolute top-0 h-full w-0.5 bg-white/40" style={{ left: `${Math.min(targetPct, 100)}%` }} />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {editingTargets && (
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <TargetEditor
              rows={targetRows}
              targets={targets}
              onSaved={saved => {
                setTargets(prev => [...prev.filter(t => !saved.some(s => s.bucketKey === t.bucketKey)), ...saved])
                setEditingTargets(false)
              }}
            />
          </div>
        )}
      </div>

      {/* Detail panel */}
      {sel && (
        <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Detalle</p>
              <p className="text-xl font-black text-white mt-0.5">{sel.name}</p>
              <p className="text-xs text-zinc-500">{sel.industry}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {sel.accountId && (
                <button onClick={() => setSyncOpen(v => !v)}
                  className="px-2.5 py-1 rounded-lg bg-blue-400/10 text-blue-300 text-[10px] font-bold hover:bg-blue-400/20 transition-colors">
                  {syncOpen ? 'Cerrar' : 'Actualizar'}
                </button>
              )}
              <button onClick={() => setSelected(null)} className="text-zinc-600 hover:text-zinc-400 text-xs">✕</button>
            </div>
          </div>

          {syncOpen && sel.accountId && (
            <div className="rounded-xl bg-white/[0.02] border border-blue-400/20 overflow-hidden">
              <AccountSyncPanel
                accountId={sel.accountId}
                currencyCode={sel.accountCurrency ?? 'CRC'}
                onClose={() => setSyncOpen(false)}
              />
            </div>
          )}

          {sel.key === LIQUID_KEY ? (
            /* Liquidez detail — per-custodio breakdown */
            <div className="space-y-3">
              {liquidBreakdown.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">Sin movimientos registrados</p>
              ) : (
                liquidBreakdown.map(group => {
                  const groupPct = liquidBalance > 0 ? (group.total / liquidBalance) * 100 : 0
                  return (
                    <div key={group.name} className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-zinc-300 truncate">{group.name}</p>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black tabular-nums text-amber-400">{fmtFull(group.total)}</p>
                          {currency === 'CRC' && (
                            <p className="text-[9px] tabular-nums text-zinc-600">{fmtUSD(toUSD(group.total))}</p>
                          )}
                        </div>
                      </div>
                      <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-amber-400/60" style={{ width: `${groupPct}%` }} />
                      </div>
                      <div className="space-y-1 pt-1">
                        {group.envelopes.map(env => {
                          const envPct = group.total > 0 ? (env.balance / group.total) * 100 : 0
                          const dotColor = env.color ?? '#f59e0b'
                          return (
                            <div key={env.id} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                              <span className="text-[10px] text-zinc-400 truncate flex-1">{env.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="w-16 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${envPct}%`, background: dotColor, opacity: 0.7 }} />
                                </div>
                                <span className="text-[11px] font-semibold tabular-nums text-zinc-300 text-right">{fmtFull(env.balance)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Balance',       crc: sel.balance,                             display: bucketBalanceLabel(sel), color: 'text-white',     sub: 'valor actual' },
                  { label: 'Depósitos',     crc: sel.deposits,                            display: fmtFull(sel.deposits),   color: 'text-zinc-200',  sub: 'cash in' },
                  { label: 'Liquidaciones', crc: sel.liquidaciones,                       display: fmtFull(sel.liquidaciones), color: 'text-rose-400', sub: 'cash out' },
                  { label: 'Rendimientos',  crc: sel.passiveValuation + sel.rendimientos, display: fmtFull(sel.passiveValuation + sel.rendimientos), color: 'text-[#a3e635]', sub: 'NAV + efectivo' },
                  ...(sel.directSpend > 0 ? [
                    { label: 'Gasto directo', crc: sel.directSpend, display: fmtFull(sel.directSpend), color: 'text-purple-400', sub: 'pagado con tarjeta/bucket' },
                  ] : []),
                ].map(k => (
                  <div key={k.label} className="rounded-xl bg-white/[0.03] px-3 py-3">
                    <p className={`text-base font-black tabular-nums ${k.color}`}>{k.display}</p>
                    {currency === 'CRC' && (
                      <p className="text-[9px] tabular-nums text-zinc-700">{fmtUSD(toUSD(k.crc))}</p>
                    )}
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-1">{k.label}</p>
                    <p className="text-[9px] text-zinc-700">{k.sub}</p>
                  </div>
                ))}
              </div>

              {!!sel.positions?.length && (
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] px-3 pt-2.5">
                    Posiciones
                  </p>
                  <div className="divide-y divide-white/[0.04]">
                    {sel.positions.map(p => (
                      <div key={p.symbol} className="flex items-center gap-3 px-3 py-2">
                        <span className="text-xs font-bold text-zinc-200 w-16 shrink-0">{p.symbol}</span>
                        <span className="text-[10px] text-zinc-600 flex-1">{p.quantity} u.</span>
                        <span className="text-xs font-black tabular-nums text-zinc-100">
                          {currency === 'CRC' ? fmtCRCFull(p.market_value_usd * rate) : fmtUSDFull(p.market_value_usd)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sel.markToMarketLoss > 0 && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Pérdida valor</span>
                  <span className="text-sm font-black tabular-nums ml-auto text-rose-400">
                    -{fmtFull(sel.markToMarketLoss)}
                  </span>
                  <span className="text-[9px] text-zinc-700">mark-to-market · no cash</span>
                </div>
              )}

              {sel.deposits - sel.liquidaciones > 0 && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">ROI cash</span>
                  <span className={`text-sm font-black tabular-nums ml-auto ${sel.balance >= sel.deposits - sel.liquidaciones ? 'text-[#a3e635]' : 'text-rose-400'}`}>
                    {fmtPct(((sel.balance - (sel.deposits - sel.liquidaciones)) / (sel.deposits - sel.liquidaciones)) * 100)}
                  </span>
                  <span className="text-[9px] text-zinc-700">(balance − neto desplegado) / neto desplegado</span>
                </div>
              )}

              {/* Snapshot-tracked buckets have no per-transaction ledger — show the
                  history of real-balance updates instead so the section isn't just blank. */}
              {!!sel.accountId && (
                <div className="space-y-1 pt-1">
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] px-1 pb-1">
                    Historial de balance real · {sel.balanceHistory?.length ?? 0} registro{(sel.balanceHistory?.length ?? 0) === 1 ? '' : 's'}
                  </p>
                  {!sel.balanceHistory?.length ? (
                    <p className="text-[10px] text-zinc-600 italic px-3 py-2">
                      Sin registros todavía — el gráfico y este historial se van a ir llenando cada vez que actualices el balance.
                    </p>
                  ) : (
                    sel.balanceHistory.map(h => (
                      <div key={h.date} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                        <span className="text-[9px] tabular-nums text-zinc-600 w-20 shrink-0">{h.date}</span>
                        <span className="flex-1 text-[10px] text-zinc-500">Balance real</span>
                        <span className="text-[10px] font-black tabular-nums text-zinc-200">
                          {currency === 'USD' && sel.accountCurrency === 'USD' && h.balanceNative != null
                            ? fmtUSDFull(h.balanceNative)
                            : fmtFull(h.balance)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Transaction history */}
              {(() => {
                const txList = bucketTransactions[sel.key] ?? []
                if (txList.length === 0) return null
                const visible = showAllTx ? txList : txList.slice(0, 15)
                return (
                  <div className="space-y-1 pt-1">
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em] px-1 pb-1">
                      Historial · {txList.length} movimientos
                    </p>
                    {visible.map(tx => {
                      const meta = TX_META[tx.tx_type]
                      const label = tx.concept || tx.vendor || '—'
                      return (
                        <div key={tx.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                          <span className="text-[9px] tabular-nums text-zinc-600 w-14 shrink-0">
                            {tx.date.slice(0, 7).replace('-', '/')}
                          </span>
                          <span className="flex-1 text-[10px] text-zinc-300 truncate min-w-0">{label}</span>
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: `${meta.color}22`, color: meta.color }}>
                            {meta.label}
                          </span>
                          <span className="text-[10px] font-black tabular-nums shrink-0"
                            style={{ color: meta.sign === -1 ? '#f87171' : '#d4d4d8' }}>
                            {meta.sign === -1 ? '-' : '+'}{fmtFull(tx.amount)}
                          </span>
                        </div>
                      )
                    })}
                    {txList.length > 15 && !showAllTx && (
                      <button onClick={() => setShowAllTx(true)}
                        className="text-[9px] text-zinc-600 hover:text-zinc-400 px-3 py-1 transition-colors w-full text-left">
                        Ver {txList.length - 15} más...
                      </button>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

    </div>
  )
}
