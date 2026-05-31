'use client'

import { useState, useTransition, useEffect } from 'react'
import type { NetWorthItem } from '@/app/actions/netWorthItems'
import { updateItemPreservingHistory, addNetWorthItem, deleteNetWorthItem } from '@/app/actions/netWorthItems'

const CAT_META = {
  liquido:   { label: 'Líquido',   color: '#f59e0b', border: 'border-amber-500/20',   head: 'bg-amber-500/[0.06]'   },
  invertido: { label: 'Invertido', color: '#a3e635', border: 'border-[#a3e635]/20',  head: 'bg-[#a3e635]/[0.04]'  },
  iliquido:  { label: 'Ilíquido',  color: '#60a5fa', border: 'border-blue-500/20',   head: 'bg-blue-500/[0.04]'   },
  pasivo:    { label: 'Pasivos',   color: '#f43f5e', border: 'border-rose-500/20',   head: 'bg-rose-500/[0.04]'   },
} as const

type Category = keyof typeof CAT_META
const CATEGORY_ORDER: Category[] = ['liquido', 'invertido', 'iliquido', 'pasivo']

export function ComposicionDetallada({
  items: initialItems,
  fmt,
  computedValues = {},
}: {
  items: NetWorthItem[]
  fmt: (v: number) => string
  computedValues?: Record<string, number>
}) {
  const [items, setItems] = useState<NetWorthItem[]>(initialItems)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingCat, setAddingCat] = useState<Category | null>(null)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setItems(initialItems) }, [initialItems])

  if (items.length === 0) return null

  const snapshotDate = items[0]?.snapshot_date ?? new Date().toISOString().slice(0, 10)
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01'
  const isCurrentMonth = snapshotDate.slice(0, 7) === currentMonth.slice(0, 7)

  const periodLabel = (() => {
    const [y, m] = snapshotDate.slice(0, 7).split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })
  })()

  function startEdit(item: NetWorthItem) {
    setEditingId(item.id)
    setEditValue(String(item.value_crc))
  }

  function saveEdit(item: NetWorthItem) {
    const val = parseFloat(editValue)
    if (isNaN(val) || val === item.value_crc) { setEditingId(null); return }
    startTransition(async () => {
      const res = await updateItemPreservingHistory(
        snapshotDate,
        { item_name: item.item_name, category: item.category, sort_order: item.sort_order },
        val,
      )
      if (!res?.error) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, value_crc: val } : i))
      }
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteNetWorthItem(id)
      if (!res?.error) setItems(prev => prev.filter(i => i.id !== id))
    })
  }

  function handleAdd(cat: Category) {
    const name = newName.trim()
    const val = parseFloat(newValue)
    if (!name || isNaN(val)) return
    const maxOrder = Math.max(-1, ...items.filter(i => i.category === cat).map(i => i.sort_order))
    startTransition(async () => {
      const res = await addNetWorthItem({
        snapshot_date: currentMonth,
        category: cat,
        item_name: name,
        value_crc: val,
        sort_order: maxOrder + 1,
      })
      if (!res?.error) {
        setItems(prev => [...prev, {
          id: `temp-${Date.now()}`,
          snapshot_date: snapshotDate,
          category: cat,
          item_name: name,
          value_crc: val,
          sort_order: maxOrder + 1,
        }])
      }
      setAddingCat(null)
      setNewName('')
      setNewValue('')
    })
  }

  return (
    <div className="space-y-2">
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-500">Período:</span>
      <span className="text-[10px] font-semibold text-zinc-400 capitalize">{periodLabel}</span>
      {!isCurrentMonth && (
        <span className="text-[9px] text-amber-500/70 font-medium">
          · editar crea nuevo registro para el mes actual
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
        const isAddingHere = addingCat === cat
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
              const computedKey = item.item_name.toLowerCase()
              const isComputed = computedKey in computedValues
              const displayValue = isComputed ? computedValues[computedKey] : Number(item.value_crc)
              return (
                <div key={item.id}
                  className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.03] last:border-0 bg-white/[0.01] group">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-2">
                    <p className="text-xs text-zinc-300 truncate">{item.item_name}</p>
                    {isComputed && (
                      <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-wide shrink-0">auto</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!isComputed && editingId === item.id ? (
                      <>
                        <input
                          autoFocus
                          type="number"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit(item)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          onBlur={() => saveEdit(item)}
                          className="w-28 text-xs text-right bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-white focus:outline-none focus:border-zinc-400 tabular-nums"
                        />
                        <span className="text-[10px] text-zinc-500">₡</span>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => !isComputed && startEdit(item)}
                          title={isComputed ? 'Calculado automáticamente' : 'Editar valor'}
                          className={`text-xs font-bold tabular-nums ${isComputed ? 'cursor-default' : 'hover:underline decoration-dotted'}`}
                          style={{ color: m.color }}
                        >
                          {fmt(displayValue)}
                        </button>
                        {!isComputed && (
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={isPending}
                            title="Eliminar"
                            className="opacity-0 group-hover:opacity-100 ml-1 text-zinc-600 hover:text-rose-400 transition-opacity disabled:opacity-30"
                            aria-label="Eliminar"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}

            {isAddingHere ? (
              <div className="px-3 py-2 border-t border-white/[0.05] bg-white/[0.02] flex items-center gap-2">
                <input
                  autoFocus
                  placeholder="Nombre"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="flex-1 min-w-0 text-xs bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-white focus:outline-none focus:border-zinc-400 placeholder-zinc-600"
                />
                <input
                  type="number"
                  placeholder="Valor ₡"
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAdd(cat)
                    if (e.key === 'Escape') { setAddingCat(null); setNewName(''); setNewValue('') }
                  }}
                  className="w-24 text-xs bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-white focus:outline-none focus:border-zinc-400 placeholder-zinc-600"
                />
                <button
                  onClick={() => handleAdd(cat)}
                  disabled={isPending}
                  className="text-[10px] font-bold text-lime-400 hover:text-lime-300 disabled:opacity-40"
                >OK</button>
                <button
                  onClick={() => { setAddingCat(null); setNewName(''); setNewValue('') }}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300"
                >✕</button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCat(cat)}
                className="w-full text-left px-3 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.02] transition-colors border-t border-white/[0.03]"
              >
                + agregar
              </button>
            )}
          </div>
        )
      })}
    </div>
    </div>
  )
}
