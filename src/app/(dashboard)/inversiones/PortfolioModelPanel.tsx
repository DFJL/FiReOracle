'use client'

import { useState, useTransition } from 'react'
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
} from '@/app/actions/portfolioModel'

function fmtCRC(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(2)}M`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`
}

function fmtPctSigned(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}pp`
}

const ASSIGNABLE_CATEGORIES = ALL_CATEGORIES.filter(c => c !== 'cash')

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

export function PortfolioModelPanel({
  buckets,
  assets,
  cashAmount,
  targets: initialTargets,
}: {
  buckets: BucketOption[]
  assets: AssetOption[]
  cashAmount: number
  targets: { category: PortfolioModelCategory; target_pct: number }[]
}) {
  const holdings: ModelHolding[] = [
    ...buckets.map(b => ({ name: b.name, category: b.category, amount: b.balance })),
    ...assets.map(a => ({ name: a.name, category: a.category, amount: a.netEquity })),
    { name: 'Liquidez', category: 'cash' as PortfolioModelCategory, amount: cashAmount },
  ]

  const model = computePortfolioModel(holdings, initialTargets)

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-6">
      <div>
        <h3 className="text-sm font-black text-zinc-100">Modelo tropicalizado (Golden Butterfly CR)</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Comparación contra tus propias metas de asignación, adaptadas a tus instrumentos reales
          (no acciones/bonos/oro genéricos). Las pensiones se muestran aparte — son ahorro forzado,
          no una palanca que puedas mover hoy.
        </p>
      </div>

      <GapTable model={model} />

      <TargetEditor initialTargets={initialTargets} />

      <CategoryAssignment buckets={buckets} assets={assets} />

      {model.context.length > 0 && (
        <div className="pt-2 border-t border-zinc-900">
          <p className="text-[11px] font-black text-zinc-500 uppercase tracking-wide mb-2">Contexto (no incluido en el %)</p>
          {model.context.map(c => (
            <div key={c.category} className="flex items-center justify-between text-xs py-1">
              <span className="text-zinc-400">{c.label}</span>
              <span className="text-zinc-300 font-bold">{fmtCRC(c.actual)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GapTable({ model }: { model: ReturnType<typeof computePortfolioModel> }) {
  return (
    <div className="space-y-3">
      {model.actionable.map(r => {
        const isDeficit = r.gapAmount > 0
        const isBig = Math.abs(r.gapPct) >= 5
        return (
          <div key={r.category}>
            <div className="flex items-center justify-between mb-1">
              <div>
                <span className="text-xs font-bold text-zinc-200">{r.label}</span>
                <span className="text-[10px] text-zinc-600 ml-2">{r.hint}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-300 font-black">{fmtPct(r.actualPct)}</span>
                <span className="text-zinc-600">meta {fmtPct(r.targetPct)}</span>
              </div>
            </div>
            <div className="relative h-2 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  width: `${Math.min(r.actualPct, 100)}%`,
                  background: isBig ? (isDeficit ? '#f43f5e' : '#f59e0b') : '#4ade80',
                  opacity: 0.85,
                }}
              />
              <div
                className="absolute top-0 h-full w-0.5 bg-white/50"
                style={{ left: `${Math.min(r.targetPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[10px] text-zinc-500">{fmtCRC(r.actual)}</span>
              {Math.abs(r.gapAmount) > 1000 && (
                <span className={`text-[10px] font-bold ${isDeficit ? 'text-rose-400' : 'text-amber-400'}`}>
                  {isDeficit
                    ? `faltan ${fmtCRC(r.gapAmount)} (${fmtPctSigned(r.gapPct)})`
                    : `${fmtCRC(-r.gapAmount)} de más (${fmtPctSigned(r.gapPct)})`}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TargetEditor({
  initialTargets,
}: {
  initialTargets: { category: PortfolioModelCategory; target_pct: number }[]
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<PortfolioModelCategory, string>>(() =>
    Object.fromEntries(
      ACTIONABLE_CATEGORIES.map(c => [c, (initialTargets.find(t => t.category === c)?.target_pct ?? 0).toString()]),
    ) as Record<PortfolioModelCategory, string>,
  )

  const sum = ACTIONABLE_CATEGORIES.reduce((s, c) => s + (parseFloat(drafts[c]) || 0), 0)

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-[11px] font-bold text-zinc-500 hover:text-zinc-300"
      >
        Ajustar metas de %
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
      {ACTIONABLE_CATEGORIES.map(c => (
        <div key={c} className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-300">{CATEGORY_LABELS[c]}</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={drafts[c]}
              onChange={e => setDrafts(d => ({ ...d, [c]: e.target.value }))}
              className="w-16 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-right"
            />
            <span className="text-xs text-zinc-500">%</span>
          </div>
        </div>
      ))}
      <div className={`text-xs font-bold text-right ${Math.abs(sum - 100) > 0.5 ? 'text-rose-400' : 'text-emerald-400'}`}>
        Suma: {sum.toFixed(1)}%
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={() => setEditing(false)}
          className="text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200"
        >
          Cancelar
        </button>
        <button
          disabled={pending}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const res = await savePortfolioModelTargets(
                ACTIONABLE_CATEGORIES.map(c => ({ category: c, target_pct: parseFloat(drafts[c]) || 0 })),
              )
              if (res.error) setError(res.error)
              else setEditing(false)
            })
          }}
          className="text-xs px-3 py-1.5 rounded-lg bg-lime-400 text-zinc-950 font-bold disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function CategoryAssignment({
  buckets,
  assets,
}: {
  buckets: BucketOption[]
  assets: AssetOption[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const rows = [
    ...buckets.map(b => ({ id: b.id, name: b.name, category: b.category, kind: 'bucket' as const })),
    ...assets.map(a => ({ id: a.id, name: a.name, category: a.category, kind: 'asset' as const })),
  ]

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] font-bold text-zinc-500 hover:text-zinc-300">
        Reclasificar instrumentos
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
      {rows.map(r => (
        <div key={r.id} className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-300">{r.name}</span>
          <select
            disabled={pending}
            value={r.category ?? ''}
            onChange={e => {
              const value = (e.target.value || null) as PortfolioModelCategory | null
              startTransition(async () => {
                if (r.kind === 'bucket') await updateBucketModelCategory(r.id, value)
                else await updateAssetModelCategory(r.id, value)
              })
            }}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
          >
            <option value="">— sin clasificar —</option>
            {ASSIGNABLE_CATEGORIES.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      ))}
      <button onClick={() => setOpen(false)} className="text-[11px] text-zinc-500 hover:text-zinc-300">
        Cerrar
      </button>
    </div>
  )
}
