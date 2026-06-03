'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Pencil, Trash2, X, Check, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { upsertBudget, deleteBudget } from '@/app/actions/budgets'
import type { Budget } from '@/app/actions/budgets'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

function barColor(pct: number) {
  if (pct >= 100) return 'bg-rose-500'
  if (pct >= 80)  return 'bg-amber-400'
  return 'bg-[#a3e635]'
}

function textColor(pct: number) {
  if (pct >= 100) return 'text-rose-400'
  if (pct >= 80)  return 'text-amber-400'
  return 'text-[#a3e635]'
}

interface Props {
  budgets: Budget[]
  actual: Record<string, number>
  year: number
  month: number
  suggestions: string[]  // from DB transaction_categories — used as datalist hints only
}

export function PresupuestoClient({ budgets, actual, year, month, suggestions }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editId, setEditId]     = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [newAmount, setNewAmount]     = useState('')
  const [showNoLimit, setShowNoLimit] = useState(false)

  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  function navigate(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    router.push(`/presupuesto?m=${m}`)
  }

  const budgetRows = budgets.map(b => {
    const amt = actual[b.category] ?? 0
    const pct = b.monthly_limit > 0 ? (amt / b.monthly_limit) * 100 : 0
    return { ...b, actualAmt: amt, pct }
  })

  const totalBudgeted = budgets.reduce((s, b) => s + b.monthly_limit, 0)
  const totalActual   = budgets.reduce((s, b) => s + (actual[b.category] ?? 0), 0)
  const totalPct      = totalBudgeted > 0 ? (totalActual / totalBudgeted) * 100 : 0

  const budgetedSet = new Set(budgets.map(b => b.category))
  const unbudgeted = Object.entries(actual)
    .filter(([g]) => !budgetedSet.has(g))
    .sort((a, b) => b[1] - a[1])

  function handleEdit(b: Budget) {
    setEditId(b.id)
    setEditAmount(String(b.monthly_limit))
  }

  function handleSave(id: string, category: string) {
    const amt = parseFloat(editAmount.replace(/[^0-9.]/g, ''))
    if (isNaN(amt) || amt <= 0) return
    startTransition(async () => {
      await upsertBudget(category, amt)
      setEditId(null)
    })
  }

  function handleAdd() {
    const amt = parseFloat(newAmount.replace(/[^0-9.]/g, ''))
    if (!newCategory || isNaN(amt) || amt <= 0) return
    startTransition(async () => {
      await upsertBudget(newCategory, amt)
      setShowAdd(false)
      setNewCategory('')
      setNewAmount('')
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteBudget(id)
    })
  }

  return (
    <div className="space-y-5">

      {/* Header + month nav */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-white">Presupuesto</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-white min-w-[80px] text-center">
            {MONTH_LABELS[month - 1]} {year}
          </span>
          <button
            onClick={() => navigate(1)}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Total summary card */}
      {budgets.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Total presupuestado</span>
            <span className={`text-xs font-semibold ${textColor(totalPct)}`}>
              {Math.round(totalPct)}%
            </span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-black text-white">{fmtCRC(totalActual)}</span>
            <span className="text-sm text-zinc-500">de {fmtCRC(totalBudgeted)}</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor(totalPct)}`}
              style={{ width: `${Math.min(totalPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Category rows */}
      {budgetRows.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-sm">
          No hay categorías con límite configurado.
        </div>
      ) : (
        <div className="space-y-2">
          {budgetRows.map(row => (
            <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{row.category}</span>
                <div className="flex items-center gap-0.5">
                  {editId !== row.id && (
                    <button
                      onClick={() => handleEdit(row)}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(row.id)}
                    disabled={isPending}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-600 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-200 font-medium">{fmtCRC(row.actualAmt)}</span>

                {editId === row.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={editAmount}
                      onChange={e => setEditAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(row.id, row.category); if (e.key === 'Escape') setEditId(null) }}
                      className="w-32 text-right bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#a3e635] [appearance:textfield]"
                      autoFocus
                    />
                    <button onClick={() => handleSave(row.id, row.category)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-[#a3e635] transition-colors">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <span className={`font-medium ${textColor(row.pct)}`}>
                    {fmtCRC(row.monthly_limit)} · {Math.round(row.pct)}%
                  </span>
                )}
              </div>

              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor(row.pct)}`}
                  style={{ width: `${Math.min(row.pct, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add budget */}
      {showAdd ? (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-white">Nueva línea de presupuesto</p>
          <p className="text-xs text-zinc-500">Escribe cualquier nombre — categoría del sistema, ahorro, gasto fijo personalizado, etc.</p>
          <datalist id="budget-cat-list">
            {suggestions.filter(s => !budgetedSet.has(s)).map(s => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <input
            type="text"
            list="budget-cat-list"
            placeholder="Nombre de la línea (ej. CrossFit, Ahorro prima casa…)"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#a3e635]"
            autoFocus
          />
          <input
            type="number"
            placeholder="Límite mensual (₡)"
            value={newAmount}
            onChange={e => setNewAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#a3e635] [appearance:textfield]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newCategory.trim() || !newAmount || isPending}
              className="flex-1 py-2 rounded-lg bg-[#a3e635] text-black text-sm font-bold disabled:opacity-40 transition-opacity"
            >
              Agregar
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewCategory(''); setNewAmount('') }}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-zinc-700 rounded-xl text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 text-sm transition-colors"
        >
          <PlusCircle size={15} />
          Agregar línea de presupuesto
        </button>
      )}

      {/* Unbudgeted spending */}
      {unbudgeted.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => setShowNoLimit(v => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-2"
          >
            <ChevronDown size={13} className={`transition-transform ${showNoLimit ? 'rotate-180' : ''}`} />
            Sin límite configurado ({unbudgeted.length} categorías)
          </button>
          {showNoLimit && (
            <div className="space-y-0.5">
              {unbudgeted.map(([group, amt]) => (
                <div key={group} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-zinc-900/50 transition-colors group">
                  <span className="text-xs text-zinc-400">{group}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{fmtCRC(amt)}</span>
                    <button
                      onClick={() => { setNewCategory(group); setShowAdd(true) }}
                      className="text-zinc-600 hover:text-[#a3e635] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <PlusCircle size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
