'use client'

import { useState, useTransition, useEffect } from 'react'
import type { NetWorthItem } from '@/app/actions/netWorthItems'
import { saveNetWorthItemForPeriod, addNetWorthItem, deleteNetWorthItem } from '@/app/actions/netWorthItems'

const CAT_META = {
  liquido:   { label: 'Líquido',   color: '#f59e0b', border: 'border-amber-500/20',   head: 'bg-amber-500/[0.06]'   },
  invertido: { label: 'Invertido', color: '#a3e635', border: 'border-[#a3e635]/20',  head: 'bg-[#a3e635]/[0.04]'  },
  iliquido:  { label: 'Ilíquido',  color: '#60a5fa', border: 'border-blue-500/20',   head: 'bg-blue-500/[0.04]'   },
  pasivo:    { label: 'Pasivos',   color: '#f43f5e', border: 'border-rose-500/20',   head: 'bg-rose-500/[0.04]'   },
} as const

type Category = keyof typeof CAT_META
const CATEGORY_ORDER: Category[] = ['liquido', 'invertido', 'iliquido', 'pasivo']

function fmtPreview(raw: string): string {
  const n = parseFloat(raw.replace(/,/g, ''))
  if (isNaN(n)) return ''
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `₡${(n / 1_000).toFixed(0)}K`
  return `₡${n.toLocaleString('es-CR')}`
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })
}

type EditSheet = { item: NetWorthItem; period: string; value: string } | null
type AddSheet  = { cat: Category; name: string; period: string; value: string } | null

export function ComposicionDetallada({
  items: initialItems,
  fmt,
  computedValues = {},
}: {
  items: NetWorthItem[]
  fmt: (v: number) => string
  computedValues?: Record<string, number>
}) {
  const [items, setItems]       = useState<NetWorthItem[]>(initialItems)
  const [editSheet, setEdit]    = useState<EditSheet>(null)
  const [addSheet, setAdd]      = useState<AddSheet>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setItems(initialItems) }, [initialItems])

  if (items.length === 0) return null

  const snapshotDate  = items[0]?.snapshot_date ?? new Date().toISOString().slice(0, 10)
  const currentYYYYMM = new Date().toISOString().slice(0, 7)

  function showSaved(msg: string) {
    setSavedMsg(msg)
    setTimeout(() => setSavedMsg(null), 3500)
  }

  function openEdit(item: NetWorthItem) {
    setEdit({ item, period: currentYYYYMM, value: String(item.value_crc) })
  }

  function commitEdit() {
    if (!editSheet) return
    const val = parseFloat(editSheet.value)
    if (isNaN(val)) return
    startTransition(async () => {
      const res = await saveNetWorthItemForPeriod(
        { item_name: editSheet.item.item_name, category: editSheet.item.category, sort_order: editSheet.item.sort_order },
        editSheet.period,
        val,
      )
      if (res?.error) {
        showSaved(`Error: ${res.error}`)
      } else {
        if (editSheet.period === snapshotDate.slice(0, 7)) {
          setItems(prev => prev.map(i => i.id === editSheet.item.id ? { ...i, value_crc: val } : i))
        }
        showSaved(`Guardado para ${monthLabel(editSheet.period)} ✓`)
      }
      setEdit(null)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteNetWorthItem(id)
      if (!res?.error) setItems(prev => prev.filter(i => i.id !== id))
    })
  }

  function commitAdd() {
    if (!addSheet) return
    const name = addSheet.name.trim()
    const val  = parseFloat(addSheet.value)
    if (!name || isNaN(val)) return
    const maxOrder = Math.max(-1, ...items.filter(i => i.category === addSheet.cat).map(i => i.sort_order))
    startTransition(async () => {
      const res = await addNetWorthItem({
        snapshot_date: addSheet.period + '-01',
        category: addSheet.cat,
        item_name: name,
        value_crc: val,
        sort_order: maxOrder + 1,
      })
      if (res?.error) {
        showSaved(`Error: ${res.error}`)
      } else {
        if (addSheet.period === snapshotDate.slice(0, 7)) {
          setItems(prev => [...prev, {
            id: `temp-${Date.now()}`,
            snapshot_date: addSheet.period + '-01',
            category: addSheet.cat,
            item_name: name,
            value_crc: val,
            sort_order: maxOrder + 1,
          }])
        }
        showSaved(`"${name}" guardado para ${monthLabel(addSheet.period)} ✓`)
      }
      setAdd(null)
    })
  }

  const activeSheet = editSheet !== null || addSheet !== null

  return (
    <>
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">Período:</span>
          <span className="text-[10px] font-semibold text-zinc-400 capitalize">
            {monthLabel(snapshotDate.slice(0, 7))}
          </span>
        </div>
        {savedMsg && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-opacity ${
            savedMsg.startsWith('Error') ? 'bg-rose-500/20 text-rose-400' : 'bg-lime-500/20 text-lime-400'
          }`}>
            {savedMsg}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CATEGORY_ORDER.map(cat => {
          const catItems = [...items.filter(i => i.category === cat)]
            .sort((a, b) => a.sort_order - b.sort_order)
          const total = catItems.reduce((s, i) => {
            const k = i.item_name.toLowerCase()
            return s + (k in computedValues ? computedValues[k] : Number(i.value_crc))
          }, 0)
          const m = CAT_META[cat]
          return (
            <div key={cat} className={`rounded-xl border ${m.border} overflow-hidden`}>
              <div className={`px-3 py-2 border-b border-white/[0.05] flex items-center justify-between ${m.head}`}>
                <p className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: m.color }}>
                  {m.label}
                </p>
                {catItems.length > 0 && (
                  <p className="text-xs font-bold" style={{ color: m.color }}>{fmt(total)}</p>
                )}
              </div>

              {catItems.map(item => {
                const computedKey  = item.item_name.toLowerCase()
                const isComputed   = computedKey in computedValues
                const displayValue = isComputed ? computedValues[computedKey] : Number(item.value_crc)
                return (
                  <div key={item.id}
                    className="flex items-center justify-between px-3 py-2 border-b border-white/[0.03] last:border-0 bg-white/[0.01] group">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-2">
                      <p className="text-xs text-zinc-300 truncate">{item.item_name}</p>
                      {isComputed && (
                        <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-wide shrink-0">auto</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => !isComputed && openEdit(item)}
                        disabled={isComputed}
                        title={isComputed ? 'Calculado automáticamente' : 'Editar'}
                        className={`text-xs font-bold tabular-nums ${isComputed ? 'cursor-default' : 'active:opacity-60'}`}
                        style={{ color: m.color }}
                      >
                        {fmt(displayValue)}
                      </button>
                      {!isComputed && (
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={isPending}
                          title="Eliminar"
                          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 transition-opacity disabled:opacity-20"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              <button
                onClick={() => setAdd({ cat, name: '', period: currentYYYYMM, value: '' })}
                className="w-full text-left px-3 py-2 text-[10px] text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.02] transition-colors border-t border-white/[0.03]"
              >
                + agregar
              </button>
            </div>
          )
        })}
      </div>
    </div>

    {/* Bottom sheet overlay */}
    {activeSheet && (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        onClick={e => { if (e.target === e.currentTarget) { setEdit(null); setAdd(null) } }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        {/* Sheet */}
        <div className="relative w-full sm:max-w-sm bg-zinc-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-2xl">
          {editSheet && <EditSheetContent
            sheet={editSheet}
            onChange={setEdit}
            onSave={commitEdit}
            onClose={() => setEdit(null)}
            isPending={isPending}
          />}
          {addSheet && <AddSheetContent
            sheet={addSheet}
            onChange={setAdd}
            onSave={commitAdd}
            onClose={() => setAdd(null)}
            isPending={isPending}
            catColor={CAT_META[addSheet.cat].color}
            catLabel={CAT_META[addSheet.cat].label}
          />}
        </div>
      </div>
    )}
    </>
  )
}

function PeriodInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="month"
      value={value}
      max={new Date().toISOString().slice(0, 7)}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30 appearance-none"
    />
  )
}

function ValueInput({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter?: () => void }) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-medium pointer-events-none">₡</span>
      <input
        type="number"
        inputMode="numeric"
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        placeholder="0"
        className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl pl-8 pr-4 py-3 text-xl font-bold text-white focus:outline-none focus:border-white/30 tabular-nums placeholder-zinc-700"
      />
      {value && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xs pointer-events-none">
          {fmtPreview(value)}
        </span>
      )}
    </div>
  )
}

function EditSheetContent({ sheet, onChange, onSave, onClose, isPending }: {
  sheet: NonNullable<EditSheet>
  onChange: (s: EditSheet) => void
  onSave: () => void
  onClose: () => void
  isPending: boolean
}) {
  const isValid = !isNaN(parseFloat(sheet.value)) && sheet.period.length === 7
  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-0.5">Editar valor</p>
          <p className="text-base font-bold text-white">{sheet.item.item_name}</p>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Período</p>
        <PeriodInput value={sheet.period} onChange={v => onChange({ ...sheet, period: v })} />
        <p className="text-[10px] text-zinc-600 capitalize pl-1">{sheet.period ? monthLabel(sheet.period) : ''}</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Monto en colones</p>
        <ValueInput value={sheet.value} onChange={v => onChange({ ...sheet, value: v })} onEnter={onSave} />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-sm text-zinc-400 hover:bg-white/[0.04]">
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={!isValid || isPending}
          className="flex-1 py-3 rounded-xl bg-[#a3e635] text-black text-sm font-bold disabled:opacity-40 active:opacity-80"
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </>
  )
}

function AddSheetContent({ sheet, onChange, onSave, onClose, isPending, catColor, catLabel }: {
  sheet: NonNullable<AddSheet>
  onChange: (s: AddSheet) => void
  onSave: () => void
  onClose: () => void
  isPending: boolean
  catColor: string
  catLabel: string
}) {
  const isValid = sheet.name.trim().length > 0 && !isNaN(parseFloat(sheet.value)) && sheet.period.length === 7
  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-0.5">Nuevo ítem</p>
          <p className="text-base font-bold" style={{ color: catColor }}>{catLabel}</p>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Nombre</p>
        <input
          autoFocus
          type="text"
          placeholder="ej. Pensión voluntaria"
          value={sheet.name}
          onChange={e => onChange({ ...sheet, name: e.target.value })}
          className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30 placeholder-zinc-700"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Período</p>
        <PeriodInput value={sheet.period} onChange={v => onChange({ ...sheet, period: v })} />
        <p className="text-[10px] text-zinc-600 capitalize pl-1">{sheet.period ? monthLabel(sheet.period) : ''}</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Monto en colones</p>
        <ValueInput value={sheet.value} onChange={v => onChange({ ...sheet, value: v })} onEnter={onSave} />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-sm text-zinc-400 hover:bg-white/[0.04]">
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={!isValid || isPending}
          className="flex-1 py-3 rounded-xl bg-[#a3e635] text-black text-sm font-bold disabled:opacity-40 active:opacity-80"
        >
          {isPending ? 'Guardando…' : 'Agregar'}
        </button>
      </div>
    </>
  )
}
