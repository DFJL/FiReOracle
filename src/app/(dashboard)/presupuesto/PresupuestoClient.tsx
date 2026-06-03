'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Pencil, Trash2, X, Check, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { upsertBudget, deleteBudget, toggleQuincena } from '@/app/actions/budgets'
import type { Budget } from '@/app/actions/budgets'

const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function fmt(n: number) {
  if (n >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `₡${Math.round(n / 1_000)}K`
  return `₡${Math.round(n)}`
}

function fmtFull(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

function pctCls(pct: number, inverse = false) {
  if (inverse) {
    if (pct >= 100) return 'text-[#a3e635]'
    if (pct >= 60)  return 'text-amber-400'
    return 'text-rose-400'
  }
  if (pct >= 100) return 'text-rose-400'
  if (pct >= 80)  return 'text-amber-400'
  return 'text-zinc-400'
}

interface Props {
  budgets:      Budget[]
  actualQ1:     Record<string, number>
  actualQ2:     Record<string, number>
  history:      Record<string, number>
  incomeActual: number
  year:         number
  month:        number
  suggestions:  string[]
}

type BudgetType = 'expense' | 'savings' | 'income'

export function PresupuestoClient({
  budgets, actualQ1, actualQ2, history, incomeActual, year, month, suggestions,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Inline row edit
  const [editId, setEditId]     = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editQ1, setEditQ1]     = useState('')
  const [editQ2, setEditQ2]     = useState('')

  // Add new line
  const [showAdd, setShowAdd]   = useState(false)
  const [newName, setNewName]   = useState('')
  const [newQ1, setNewQ1]       = useState('')
  const [newQ2, setNewQ2]       = useState('')
  const [newType, setNewType]   = useState<BudgetType>('expense')

  const [showNoLimit, setShowNoLimit] = useState(false)

  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const currentDay     = isCurrentMonth ? now.getDate() : 31
  const isQ1Active     = currentDay <= 15
  const isQ2Active     = currentDay > 15

  function navigate(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    router.push(`/presupuesto?m=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const expenseLines = budgets.filter(b => b.budget_type === 'expense')
  const savingsLines = budgets.filter(b => b.budget_type === 'savings')
  const incomeLines  = budgets.filter(b => b.budget_type === 'income')

  const incomeExpected = incomeLines.reduce((s, b) => s + (b.monthly_limit ?? 0), 0)
  const totalPlanQ1    = [...expenseLines, ...savingsLines].reduce((s, b) => s + (b.q1_amount ?? 0), 0)
  const totalPlanQ2    = [...expenseLines, ...savingsLines].reduce((s, b) => s + (b.q2_amount ?? 0), 0)
  const totalPlan      = totalPlanQ1 + totalPlanQ2

  // Only sum actuals for groups that appear in budgeted lines
  const budgetedGroups = new Set(budgets.map(b => b.category))
  let totalActQ1 = 0, totalActQ2 = 0
  for (const g of budgetedGroups) {
    totalActQ1 += actualQ1[g] ?? 0
    totalActQ2 += actualQ2[g] ?? 0
  }
  const totalAct = totalActQ1 + totalActQ2
  const totalPct = totalPlan > 0 ? totalAct / totalPlan * 100 : 0

  // Unbudgeted groups that have actual spending
  const allActual: Record<string, number> = {}
  for (const [g, v] of Object.entries(actualQ1)) allActual[g] = (allActual[g] ?? 0) + v
  for (const [g, v] of Object.entries(actualQ2)) allActual[g] = (allActual[g] ?? 0) + v
  const unbudgeted = Object.entries(allActual)
    .filter(([g]) => !budgetedGroups.has(g))
    .sort((a, b) => b[1] - a[1])

  function startEdit(b: Budget) {
    setEditId(b.id)
    setEditName(b.category)
    setEditQ1(String(b.q1_amount ?? ''))
    setEditQ2(String(b.q2_amount ?? ''))
  }

  function saveEdit(b: Budget) {
    const q1 = parseFloat(editQ1) || 0
    const q2 = parseFloat(editQ2) || 0
    const name = editName.trim() || b.category
    startTransition(async () => {
      await upsertBudget(name, q1, q2, b.budget_type)
      // If renamed, deactivate old entry (new one has same category if name unchanged)
      if (name !== b.category) await deleteBudget(b.id)
      setEditId(null)
    })
  }

  function handleAdd() {
    const q1 = parseFloat(newQ1) || 0
    const q2 = parseFloat(newQ2) || 0
    if (!newName.trim()) return
    startTransition(async () => {
      await upsertBudget(newName.trim(), q1, q2, newType)
      setShowAdd(false)
      setNewName(''); setNewQ1(''); setNewQ2('')
      setNewType('expense')
    })
  }

  function handleToggle(id: string, q: 1 | 2, done: boolean) {
    startTransition(async () => { await toggleQuincena(id, q, done) })
  }

  function handleDelete(id: string) {
    startTransition(async () => { await deleteBudget(id) })
  }

  // ── table rows ──────────────────────────────────────────────────────────────

  function SectionHeader({ label }: { label: string }) {
    return (
      <tr>
        <td colSpan={9} className="px-3 pt-3 pb-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900/40">
          {label}
        </td>
      </tr>
    )
  }

  function BudgetRow({ b }: { b: Budget }) {
    const q1Act = actualQ1[b.category]
    const q2Act = actualQ2[b.category]
    const hist  = history[b.category]
    const q1Plan = b.q1_amount ?? 0
    const q2Plan = b.q2_amount ?? 0
    const plan   = q1Plan + q2Plan
    const act    = (q1Act ?? 0) + (q2Act ?? 0)
    const pct    = plan > 0 ? act / plan * 100 : 0
    const isEdit = editId === b.id

    if (isEdit) return (
      <tr className="bg-zinc-800/50 border-b border-zinc-700">
        <td className="px-2 py-2">
          <input value={editName} onChange={e => setEditName(e.target.value)} list="budget-cat-list"
            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#a3e635]" />
        </td>
        <td className="px-2 py-2" colSpan={3}>
          <input type="number" value={editQ1} onChange={e => setEditQ1(e.target.value)}
            placeholder="Q1 ₡" className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#a3e635] [appearance:textfield]" />
        </td>
        <td className="px-2 py-2" colSpan={3}>
          <input type="number" value={editQ2} onChange={e => setEditQ2(e.target.value)}
            placeholder="Q2 ₡" onKeyDown={e => { if (e.key === 'Enter') saveEdit(b) }}
            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#a3e635] [appearance:textfield]" />
        </td>
        <td colSpan={2} className="px-2 py-2">
          <div className="flex gap-1">
            <button onClick={() => saveEdit(b)} disabled={isPending}
              className="p-1.5 rounded bg-[#a3e635]/20 text-[#a3e635] hover:bg-[#a3e635]/30 transition-colors">
              <Check size={11} />
            </button>
            <button onClick={() => setEditId(null)}
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 transition-colors">
              <X size={11} />
            </button>
            <button onClick={() => handleDelete(b.id)} disabled={isPending}
              className="p-1.5 rounded hover:bg-zinc-700 text-rose-400 transition-colors">
              <Trash2 size={11} />
            </button>
          </div>
        </td>
      </tr>
    )

    return (
      <tr className="border-b border-zinc-800/40 hover:bg-zinc-800/20 group transition-colors">
        {/* Name */}
        <td className="px-3 py-2 text-xs font-medium text-white max-w-[150px]">
          <span className="flex items-center gap-1.5 min-w-0">
            <button onClick={() => startEdit(b)}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300">
              <Pencil size={10} />
            </button>
            <span className="truncate" title={b.category}>{b.category}</span>
          </span>
        </td>
        {/* Q1 Plan */}
        <td className={`px-3 py-2 text-xs text-right tabular-nums ${isQ1Active ? 'text-zinc-200' : 'text-zinc-500'}`}>
          {q1Plan ? fmt(q1Plan) : <span className="text-zinc-700">—</span>}
        </td>
        {/* Q1 Real */}
        <td className={`px-3 py-2 text-xs text-right tabular-nums ${
          q1Act !== undefined
            ? (q1Plan && q1Act > q1Plan ? 'text-rose-400' : 'text-emerald-400')
            : 'text-zinc-700'
        }`}>
          {q1Act !== undefined ? fmt(q1Act) : '—'}
        </td>
        {/* Q1 done */}
        <td className="px-2 py-2 text-center">
          <button onClick={() => handleToggle(b.id, 1, !b.q1_done)} disabled={isPending}
            title={b.q1_done ? 'Marcar pendiente' : 'Marcar listo'}
            className={`inline-flex items-center justify-center w-4 h-4 rounded border transition-colors ${
              b.q1_done
                ? 'bg-[#a3e635] border-[#a3e635] text-black'
                : 'border-zinc-700 hover:border-zinc-500'
            }`}>
            {b.q1_done && <Check size={9} />}
          </button>
        </td>
        {/* Q2 Plan */}
        <td className={`px-3 py-2 text-xs text-right tabular-nums ${isQ2Active ? 'text-zinc-200' : 'text-zinc-500'}`}>
          {q2Plan ? fmt(q2Plan) : <span className="text-zinc-700">—</span>}
        </td>
        {/* Q2 Real */}
        <td className={`px-3 py-2 text-xs text-right tabular-nums ${
          q2Act !== undefined
            ? (q2Plan && q2Act > q2Plan ? 'text-rose-400' : 'text-emerald-400')
            : 'text-zinc-700'
        }`}>
          {q2Act !== undefined ? fmt(q2Act) : '—'}
        </td>
        {/* Q2 done */}
        <td className="px-2 py-2 text-center">
          <button onClick={() => handleToggle(b.id, 2, !b.q2_done)} disabled={isPending}
            title={b.q2_done ? 'Marcar pendiente' : 'Marcar listo'}
            className={`inline-flex items-center justify-center w-4 h-4 rounded border transition-colors ${
              b.q2_done
                ? 'bg-[#a3e635] border-[#a3e635] text-black'
                : 'border-zinc-700 hover:border-zinc-500'
            }`}>
            {b.q2_done && <Check size={9} />}
          </button>
        </td>
        {/* Historical 3m avg */}
        <td className={`px-3 py-2 text-xs text-right tabular-nums ${hist !== undefined ? 'text-zinc-400' : 'text-zinc-700'}`}
          title={hist !== undefined ? `Promedio últimos 3 meses: ${fmtFull(hist)}` : 'Sin historial automático'}>
          {hist !== undefined ? fmt(hist) : '—'}
        </td>
        {/* % */}
        <td className={`px-3 py-2 text-xs text-right tabular-nums font-semibold ${pctCls(pct)}`}>
          {plan > 0 && (act > 0 || !isCurrentMonth) ? `${Math.round(pct)}%` : ''}
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-4">
      <datalist id="budget-cat-list">
        {suggestions.map(s => <option key={s} value={s} />)}
      </datalist>

      {/* Header + month nav */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-white">Presupuesto</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-white min-w-[80px] text-center">
            {MONTH_LABELS[month - 1]} {year}
          </span>
          <button onClick={() => navigate(1)} disabled={isCurrentMonth}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Income summary */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-zinc-500 mb-0.5">Ing. esperado</p>
          <p className="text-sm font-black text-white">{fmt(incomeExpected)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            {incomeLines.length ? incomeLines.map(b => b.category).join(', ') : 'Agregar ingreso ↓'}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-zinc-500 mb-0.5">Ing. real</p>
          <p className="text-sm font-black text-emerald-400">{fmt(incomeActual)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">de transacciones</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-zinc-500 mb-0.5">Balance plan</p>
          {incomeExpected > 0 ? (
            <>
              <p className={`text-sm font-black ${incomeExpected >= totalPlan ? 'text-[#a3e635]' : 'text-rose-400'}`}>
                {fmt(Math.abs(incomeExpected - totalPlan))}
              </p>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                {incomeExpected >= totalPlan ? 'sobrante' : 'déficit'}
              </p>
            </>
          ) : (
            <p className="text-sm font-black text-zinc-600">—</p>
          )}
        </div>
      </div>

      {/* Main table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full border-collapse text-left" style={{ minWidth: 680 }}>
          <thead>
            {/* Summary bar */}
            <tr className="bg-zinc-900/80 border-b border-zinc-800">
              <td colSpan={9} className="px-3 py-2">
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span>Plan <strong className="text-zinc-200">{fmt(totalPlan)}</strong></span>
                  <span>Real <strong className={pctCls(totalPct)}>{fmt(totalAct)}</strong></span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      totalPct >= 100 ? 'bg-rose-500' : totalPct >= 80 ? 'bg-amber-400' : 'bg-[#a3e635]'
                    }`} style={{ width: `${Math.min(totalPct, 100)}%` }} />
                  </div>
                  <strong className={pctCls(totalPct)}>{Math.round(totalPct)}%</strong>
                </div>
              </td>
            </tr>
            {/* Column headers */}
            <tr className="bg-zinc-900/50 border-b border-zinc-700 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <th className="px-3 py-2 text-left w-[150px]">Línea</th>
              <th className={`px-3 py-2 text-right ${isQ1Active ? 'text-[#a3e635]/80' : ''}`}>Q1 Plan</th>
              <th className={`px-3 py-2 text-right ${isQ1Active ? 'text-[#a3e635]/80' : ''}`}>Q1 Real</th>
              <th className={`px-2 py-2 text-center ${isQ1Active ? 'text-[#a3e635]/80' : ''}`}>✓</th>
              <th className={`px-3 py-2 text-right ${isQ2Active ? 'text-[#a3e635]/80' : ''}`}>Q2 Plan</th>
              <th className={`px-3 py-2 text-right ${isQ2Active ? 'text-[#a3e635]/80' : ''}`}>Q2 Real</th>
              <th className={`px-2 py-2 text-center ${isQ2Active ? 'text-[#a3e635]/80' : ''}`}>✓</th>
              <th className="px-3 py-2 text-right" title="Promedio últimos 3 meses">3m Avg</th>
              <th className="px-3 py-2 text-right">%</th>
            </tr>
          </thead>

          <tbody className="bg-zinc-900/10">
            {expenseLines.length > 0 && (
              <>
                <SectionHeader label="Gastos" />
                {expenseLines.map(b => <BudgetRow key={b.id} b={b} />)}
              </>
            )}
            {savingsLines.length > 0 && (
              <>
                <SectionHeader label="Ahorros / Inversión" />
                {savingsLines.map(b => <BudgetRow key={b.id} b={b} />)}
              </>
            )}
            {incomeLines.length > 0 && (
              <>
                <SectionHeader label="Ingresos esperados" />
                {incomeLines.map(b => <BudgetRow key={b.id} b={b} />)}
              </>
            )}
          </tbody>

          <tfoot>
            <tr className="border-t border-zinc-700 bg-zinc-900/60 text-xs font-bold">
              <td className="px-3 py-2.5 text-zinc-300">TOTAL</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{fmt(totalPlanQ1)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400">{fmt(totalActQ1)}</td>
              <td />
              <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{fmt(totalPlanQ2)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400">{fmt(totalActQ2)}</td>
              <td />
              <td />
              <td className={`px-3 py-2.5 text-right ${pctCls(totalPct)}`}>{Math.round(totalPct)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add line */}
      {showAdd ? (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white flex-1">Nueva línea</p>
            <select value={newType} onChange={e => setNewType(e.target.value as BudgetType)}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-[#a3e635]">
              <option value="expense">Gasto</option>
              <option value="savings">Ahorro / Inversión</option>
              <option value="income">Ingreso esperado</option>
            </select>
          </div>
          <input type="text" list="budget-cat-list" autoFocus
            placeholder="Nombre (ej. CrossFit, Ahorro prima casa, Salario…)"
            value={newName} onChange={e => setNewName(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#a3e635]"
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder="₡ Quincena 1"
              value={newQ1} onChange={e => setNewQ1(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#a3e635] [appearance:textfield]"
            />
            <input type="number" placeholder="₡ Quincena 2"
              value={newQ2} onChange={e => setNewQ2(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#a3e635] [appearance:textfield]"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!newName.trim() || isPending}
              className="flex-1 py-2 rounded-lg bg-[#a3e635] text-black text-sm font-bold disabled:opacity-40 transition-opacity">
              Agregar
            </button>
            <button onClick={() => { setShowAdd(false); setNewName(''); setNewQ1(''); setNewQ2('') }}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-zinc-700 rounded-xl text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 text-sm transition-colors">
          <PlusCircle size={14} />
          Agregar línea
        </button>
      )}

      {/* Unbudgeted */}
      {unbudgeted.length > 0 && (
        <div>
          <button onClick={() => setShowNoLimit(v => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-1.5">
            <ChevronDown size={12} className={`transition-transform ${showNoLimit ? 'rotate-180' : ''}`} />
            Categorías sin línea de presupuesto ({unbudgeted.length})
          </button>
          {showNoLimit && (
            <div className="rounded-xl border border-zinc-800 overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {unbudgeted.map(([g, v]) => (
                    <tr key={g} className="border-b border-zinc-800/50 hover:bg-zinc-900/50 group">
                      <td className="px-3 py-2 text-zinc-400">{g}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{fmt(v)}</td>
                      <td className="px-3 py-2 text-right w-8">
                        <button onClick={() => { setNewName(g); setShowAdd(true) }}
                          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-[#a3e635] transition-all">
                          <PlusCircle size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
