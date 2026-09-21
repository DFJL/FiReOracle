'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  computePortfolioModel,
  ACTIONABLE_CATEGORIES,
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  type PortfolioModelCategory,
  type ModelHolding,
} from '@/lib/portfolioModel'
import {
  savePortfolioModelTargets,
  updateBucketModelCategory,
  updateAssetModelCategory,
  updatePositionModelCategory,
} from '@/app/actions/portfolioModel'

function fmtCRC(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(2)}M`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`
}

const ASSIGNABLE_CATEGORIES = ALL_CATEGORIES.filter(c => c !== 'cash')

// Default inclusion mirrors the FIRE liquidity scenario panel in /progreso:
// slices you can actually buy/sell/move are on by default, real estate is off
// — you can't rebalance a rental house the way you rebalance everything else
// here (sell 5% of it to buy gold). Toggle it on if you want it in the mix
// anyway; the target % you set for it is preserved either way.
const DEFAULT_INCLUDED: Record<PortfolioModelCategory, boolean> = {
  growth_global: true,
  growth_high_risk: true,
  fixed_income_local: true,
  gold_hedge: true,
  cash: true,
  real_estate_rental: false,
  pension_locked: false,
}

type SortMode = 'gap' | 'size' | 'name'
const SORT_LABELS: Record<SortMode, string> = { gap: 'Gap', size: 'Tamaño', name: 'Nombre' }

export interface BucketOption {
  id: string
  name: string
  balance: number
  category: PortfolioModelCategory | null
}

export interface AssetOption {
  id: string
  name: string
  netEquity: number
  category: PortfolioModelCategory | null
}

// A snapshot_based bucket is a real brokerage account (e.g. IBKR) that can
// hold several asset classes at once — a stock ETF and a gold ETF both sit
// in the same account — so the category lives on the position, not the
// bucket. bucketName is only for the display label ("IBKR · VXUS").
export interface PositionOption {
  id: string
  symbol: string
  bucketName: string
  amount: number
  category: PortfolioModelCategory | null
}

type HoldingRow =
  | { kind: 'bucket'; id: string; name: string; amount: number }
  | { kind: 'asset'; id: string; name: string; amount: number }
  | { kind: 'position'; id: string; name: string; amount: number }
  | { kind: 'cash'; id: null; name: string; amount: number }

export function PortfolioModelPanel({
  buckets,
  assets,
  positions,
  cashAmount,
  targets: initialTargets,
}: {
  buckets: BucketOption[]
  assets: AssetOption[]
  positions: PositionOption[]
  cashAmount: number
  targets: { category: PortfolioModelCategory; target_pct: number }[]
}) {
  const [included, setIncluded] = useState(DEFAULT_INCLUDED)
  const [sortMode, setSortMode] = useState<SortMode>('gap')

  const initialDrafts = useMemo(
    () => Object.fromEntries(
      ACTIONABLE_CATEGORIES.map(c => [c, String(initialTargets.find(t => t.category === c)?.target_pct ?? 0)]),
    ) as Record<PortfolioModelCategory, string>,
    [initialTargets],
  )
  const [drafts, setDrafts] = useState(initialDrafts)
  const [savedDrafts, setSavedDrafts] = useState(initialDrafts)
  const [saving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  const holdings: ModelHolding[] = useMemo(() => [
    ...buckets.map(b => ({ name: b.name, category: b.category, amount: b.balance })),
    ...assets.map(a => ({ name: a.name, category: a.category, amount: a.netEquity })),
    ...positions.map(p => ({ name: `${p.bucketName} · ${p.symbol}`, category: p.category, amount: p.amount })),
    { name: 'Liquidez', category: 'cash' as PortfolioModelCategory, amount: cashAmount },
  ], [buckets, assets, positions, cashAmount])

  const rawTotals = useMemo(() => {
    const t: Partial<Record<PortfolioModelCategory, number>> = {}
    for (const h of holdings) if (h.category) t[h.category] = (t[h.category] ?? 0) + h.amount
    return t
  }, [holdings])

  const uncategorized: HoldingRow[] = [
    ...buckets.filter(b => !b.category).map(b => ({ kind: 'bucket' as const, id: b.id, name: b.name, amount: b.balance })),
    ...assets.filter(a => !a.category).map(a => ({ kind: 'asset' as const, id: a.id, name: a.name, amount: a.netEquity })),
    ...positions.filter(p => !p.category).map(p => ({ kind: 'position' as const, id: p.id, name: `${p.bucketName} · ${p.symbol}`, amount: p.amount })),
  ]

  function holdingsFor(category: PortfolioModelCategory): HoldingRow[] {
    return [
      ...buckets.filter(b => b.category === category).map(b => ({ kind: 'bucket' as const, id: b.id, name: b.name, amount: b.balance })),
      ...assets.filter(a => a.category === category).map(a => ({ kind: 'asset' as const, id: a.id, name: a.name, amount: a.netEquity })),
      ...positions.filter(p => p.category === category).map(p => ({ kind: 'position' as const, id: p.id, name: `${p.bucketName} · ${p.symbol}`, amount: p.amount })),
      ...(category === 'cash' ? [{ kind: 'cash' as const, id: null, name: 'Liquidez', amount: cashAmount }] : []),
    ]
  }

  // Renormalized so actual% and target% both sum to 100 among only the
  // categories currently checked — comparing a checked subset against targets
  // that still assume the unchecked slice's share would otherwise make every
  // remaining category look artificially over-allocated.
  const checkedCats = ACTIONABLE_CATEGORIES.filter(c => included[c])
  const checkedTargetSum = checkedCats.reduce((s, c) => s + (parseFloat(drafts[c]) || 0), 0)
  const renormalizedTargets = checkedCats.map(c => ({
    category: c,
    target_pct: checkedTargetSum > 0 ? ((parseFloat(drafts[c]) || 0) / checkedTargetSum) * 100 : 0,
  }))

  const filteredHoldings: ModelHolding[] = holdings.map(h =>
    h.category && included[h.category] ? h : { ...h, category: null },
  )
  const model = computePortfolioModel(filteredHoldings, renormalizedTargets)
  const visibleByCategory = new Map(model.actionable.map(r => [r.category, r]))

  const rawTargetSum = ACTIONABLE_CATEGORIES.reduce((s, c) => s + (parseFloat(drafts[c]) || 0), 0)
  const dirty = ACTIONABLE_CATEGORIES.some(c => drafts[c] !== savedDrafts[c])

  // Six categories — cheap enough to just recompute on every render rather
  // than fight the compiler over memoizing a Map that's rebuilt each render anyway.
  const orderedCategories = (() => {
    const withMetrics = ACTIONABLE_CATEGORIES.map(c => {
      const row = visibleByCategory.get(c)
      return {
        category: c,
        gap: included[c] ? Math.abs(row?.gapPct ?? 0) : -1,
        size: included[c] ? (row?.actual ?? 0) : (rawTotals[c] ?? 0),
        label: CATEGORY_LABELS[c],
      }
    })
    const sorted = [...withMetrics]
    if (sortMode === 'gap') sorted.sort((a, b) => b.gap - a.gap)
    else if (sortMode === 'size') sorted.sort((a, b) => b.size - a.size)
    else sorted.sort((a, b) => a.label.localeCompare(b.label))
    return sorted.map(x => x.category)
  })()

  function saveTargets() {
    setSaveError(null)
    startSaving(async () => {
      const res = await savePortfolioModelTargets(
        ACTIONABLE_CATEGORIES.map(c => ({ category: c, target_pct: parseFloat(drafts[c]) || 0 })),
      )
      if (res.error) setSaveError(res.error)
      else setSavedDrafts(drafts)
    })
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-black text-zinc-100">Modelo de portafolio</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-md">
            Tu asignación real comparada contra tus propias metas — mapeado a tus instrumentos tal
            cual son, no a &quot;acciones/bonos/oro&quot; genéricos (inspirado en Golden Butterfly).
            Desmarcá lo que no querés que cuente ahora mismo.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 shrink-0">
          {(['gap', 'size', 'name'] as SortMode[]).map(m => (
            <button
              key={m}
              onClick={() => setSortMode(m)}
              className={`px-2 py-1 rounded-md text-[10px] font-black tracking-wide transition-all ${
                sortMode === m ? 'bg-lime-400 text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {SORT_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {orderedCategories.map(category => {
          const isChecked = included[category]
          const row = visibleByCategory.get(category)
          const rawAmount = rawTotals[category] ?? 0
          const rows = holdingsFor(category)
          const isDeficit = row ? row.gapAmount > 0 : false
          const isBig = row ? Math.abs(row.gapPct) >= 5 : false

          return (
            <div key={category} className={`rounded-xl border p-3 ${isChecked ? 'border-zinc-800' : 'border-zinc-900 opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <label className="flex items-start gap-2 cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={e => setIncluded(prev => ({ ...prev, [category]: e.target.checked }))}
                    className="mt-0.5 accent-lime-400"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-zinc-200">{CATEGORY_LABELS[category]}</span>
                  </div>
                </label>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-black text-zinc-300">{fmtPct(isChecked ? (row?.actualPct ?? 0) : 0)}</span>
                  <span className="text-[10px] text-zinc-600">meta</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={drafts[category]}
                    onChange={e => setDrafts(d => ({ ...d, [category]: e.target.value }))}
                    className="w-14 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-right"
                  />
                  <span className="text-[10px] text-zinc-600">%</span>
                </div>
              </div>

              {isChecked ? (
                <>
                  <div className="relative h-2 rounded-full bg-zinc-900 overflow-hidden mt-2">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full"
                      style={{
                        width: `${Math.min(row?.actualPct ?? 0, 100)}%`,
                        background: isBig ? (isDeficit ? '#f43f5e' : '#f59e0b') : '#4ade80',
                        opacity: 0.85,
                      }}
                    />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-white/50"
                      style={{ left: `${Math.min(row?.targetPct ?? 0, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[10px] text-zinc-500">{fmtCRC(row?.actual ?? 0)}</span>
                    {row && Math.abs(row.gapAmount) > 1000 && (
                      <span className={`text-[10px] font-bold ${isDeficit ? 'text-rose-400' : 'text-amber-400'}`}>
                        {isDeficit
                          ? `faltan ${fmtCRC(row.gapAmount)}`
                          : `${fmtCRC(-row.gapAmount)} de más`}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-[10px] text-zinc-600 mt-1.5">
                  Excluido de la comparación · {fmtCRC(rawAmount)} sin contar
                </p>
              )}

              {rows.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-zinc-900 space-y-1.5">
                  {rows.map(h => (
                    <HoldingRowView key={`${h.kind}-${h.id ?? 'cash'}`} holding={h} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {dirty && (
        <div className="flex items-center gap-3 pt-1">
          <span className={`text-[11px] font-bold ${Math.abs(rawTargetSum - 100) > 0.5 ? 'text-rose-400' : 'text-emerald-400'}`}>
            Suma de metas: {rawTargetSum.toFixed(1)}%
          </span>
          {saveError && <span className="text-[11px] text-rose-400">{saveError}</span>}
          <button
            disabled={saving || Math.abs(rawTargetSum - 100) > 0.5}
            onClick={saveTargets}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-lime-400 text-zinc-950 font-bold disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar metas'}
          </button>
        </div>
      )}

      {uncategorized.length > 0 && (
        <div className="pt-3 border-t border-zinc-900">
          <p className="text-[11px] font-black text-amber-400 uppercase tracking-wide mb-2">Sin clasificar</p>
          <div className="space-y-1.5">
            {uncategorized.map(h => (
              <HoldingRowView key={`${h.kind}-${h.id}`} holding={h} />
            ))}
          </div>
        </div>
      )}

      {model.context.length > 0 && (
        <div className="pt-3 border-t border-zinc-900">
          <p className="text-[11px] font-black text-zinc-500 uppercase tracking-wide mb-2">Contexto (no incluido en el %)</p>
          {model.context.map(c => (
            <div key={c.category} className="flex items-center justify-between text-xs py-1">
              <div>
                <span className="text-zinc-400">{c.label}</span>
                <span className="text-[10px] text-zinc-600 ml-2">{c.hint}</span>
              </div>
              <span className="text-zinc-300 font-bold">{fmtCRC(c.actual)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HoldingRowView({ holding }: { holding: HoldingRow }) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-[11px] text-zinc-300 truncate">{holding.name}</span>
        <span className="text-[10px] text-zinc-600 shrink-0">{fmtCRC(holding.amount)}</span>
      </div>
      {holding.kind !== 'cash' && (
        <select
          disabled={pending}
          defaultValue=""
          onChange={e => {
            const value = (e.target.value || null) as PortfolioModelCategory | null
            if (!value) return
            startTransition(async () => {
              if (holding.kind === 'bucket') await updateBucketModelCategory(holding.id, value)
              else if (holding.kind === 'asset') await updateAssetModelCategory(holding.id, value)
              else await updatePositionModelCategory(holding.id, value)
            })
          }}
          className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 shrink-0"
        >
          <option value="">reclasificar…</option>
          {ASSIGNABLE_CATEGORIES.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      )}
    </div>
  )
}
