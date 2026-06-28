'use client'

import { useState, useTransition, useOptimistic, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusCircle, Pencil, Trash2, X, Check,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  ArrowUpDown, ArrowUp, ArrowDown, Link2, Receipt,
} from 'lucide-react'
import { upsertBudget, deleteBudget, toggleQuincena, bulkToggleQuincena, updateBudgetActual, recordTransferFromSource, recordBatchEnvelopeMovements, bulkMarkDone } from '@/app/actions/budgets'
import type { Budget } from '@/app/actions/budgets'
import { getGroupLabel } from '@/app/(dashboard)/resumen/categoryUtils'

export type Envelope = {
  id: string
  name: string
  parent_envelope_id: string | null
  custodio: string | null
}

export type TxCategory = {
  code: string
  name: string
}

export type FinancialAccount = {
  id: string
  name: string
  account_type: string
}

const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function fmt(n: number) {
  if (n >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `₡${Math.round(n / 1_000)}K`
  return `₡${Math.round(n)}`
}
function fmtFull(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}
function pctCls(pct: number) {
  if (pct >= 100) return 'text-rose-400'
  if (pct >= 80)  return 'text-amber-400'
  return 'text-zinc-400'
}
function barCls(pct: number) {
  if (pct >= 100) return 'bg-rose-500'
  if (pct >= 80)  return 'bg-amber-400'
  return 'bg-[#a3e635]'
}

type SortKey = 'name' | 'q1_plan' | 'q2_plan' | 'actual' | 'history' | 'pct'
type BudgetType = 'expense' | 'savings' | 'income'

// ── TransferSummary ───────────────────────────────────────────────────────────

type TransferItem = {
  id: string
  category: string
  envName: string
  envId: string
  amount: number
  budgetType: string
  qDone: boolean   // whether this quincena is already marked done for current month
}

function CustodioRow({
  custodio, items, envelopes, q, year, month,
}: {
  custodio: string
  items: TransferItem[]
  envelopes: Envelope[]
  q: 1 | 2
  year: number
  month: number
}) {
  // Done items start unchecked (already registered) but remain selectable for additional deposits
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(items.filter(i => !i.qDone).map(i => i.id))
  )
  const [amounts, setAmounts] = useState<Map<string, string>>(
    () => new Map(items.map(i => [i.id, String(Math.round(i.amount))]))
  )
  const [fromId, setFromId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const [isPending, start] = useTransition()

  const allCheckRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (allCheckRef.current) {
      allCheckRef.current.indeterminate = checked.size > 0 && checked.size < items.length
    }
  }, [checked.size, items.length])

  function toggleItem(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setChecked(checked.size === items.length
      ? new Set()
      : new Set(items.map(i => i.id)))
  }

  function getAmt(id: string) { return parseFloat(amounts.get(id) ?? '0') || 0 }
  function setAmt(id: string, v: string) { setAmounts(prev => new Map(prev).set(id, v)) }

  const checkedItems = items.filter(i => checked.has(i.id))
  const subtotal = checkedItems.reduce((s, i) => s + getAmt(i.id), 0)

  function register() {
    if (checkedItems.length === 0) { setErr('Seleccioná al menos una línea'); return }
    setErr('')

    const savings = checkedItems.filter(i => i.budgetType === 'savings' || i.budgetType === 'income')

    start(async () => {
      // All selected lines: deposito to their envelopes
      const movements = checkedItems.map(i => ({
        envelope_id:   i.envId,
        amount:        getAmt(i.id),
        movement_type: 'deposito' as const,
        notes:         `Plan transferencias: ${i.category}`,
      }))
      const res = await recordBatchEnvelopeMovements(movements, date)
      if (res.error) { setErr(res.error); return }

      // Savings not yet done: mark the quincena so main table reflects it
      const newSavings = savings.filter(i => !i.qDone)
      if (newSavings.length > 0) {
        await bulkMarkDone(newSavings.map(i => i.id), q, year, month)
      }

      // Optional source debit (traslado_out from source envelope) for savings total
      if (fromId && savings.length > 0) {
        const savingsTotal = savings.reduce((s, i) => s + getAmt(i.id), 0)
        const res2 = await recordTransferFromSource(fromId, savingsTotal, custodio, date)
        if (res2.error) { setErr(res2.error); return }
      }

      setOk(true)
    })
  }

  const isSavings = (i: TransferItem) => i.budgetType === 'savings' || i.budgetType === 'income'

  return (
    <>
      {/* Custodio header */}
      <tr className="bg-white/[0.03] border-t border-white/[0.06]">
        <td className="px-3 py-1.5 w-7">
          <input ref={allCheckRef} type="checkbox"
            checked={checked.size > 0 && checked.size === items.length}
            onChange={toggleAll}
            className="accent-[#a3e635] w-3 h-3 cursor-pointer"
          />
        </td>
        <td colSpan={2} className="px-2 py-1.5">
          <span className="text-[10px] font-bold text-zinc-300">{custodio}</span>
          <span className="text-[9px] text-zinc-600 ml-1.5">{items.length} línea{items.length !== 1 ? 's' : ''}</span>
          {items.some(i => i.qDone) && (
            <span className="ml-2 text-[9px] text-[#a3e635]/60">
              {items.filter(i => i.qDone).length} ya hecho{items.filter(i => i.qDone).length !== 1 ? 's' : ''}
            </span>
          )}
        </td>
        <td className="px-4 py-1.5 text-right text-[10px] font-bold text-[#a3e635]">
          ₡{Math.round(subtotal).toLocaleString('es-CR')}
        </td>
      </tr>
      {/* Line items */}
      {items.map(l => (
        <tr key={l.id}
          className={`border-t border-white/[0.03] transition-opacity ${
            checked.has(l.id) ? 'hover:bg-white/[0.02]' : 'opacity-40'
          }`}
        >
          <td className="px-3 py-1 w-7">
            <input type="checkbox" checked={checked.has(l.id)} onChange={() => toggleItem(l.id)}
              className="accent-[#a3e635] w-3 h-3 cursor-pointer" />
          </td>
          <td className="px-2 py-1 text-[11px] text-zinc-400">
            <span className={`mr-1 text-[9px] ${isSavings(l) ? 'text-[#a3e635]/50' : 'text-rose-500/60'}`}>
              {isSavings(l) ? '▴' : '▾'}
            </span>
            {l.category}
            {l.qDone && <span className="ml-1 text-[9px] text-[#a3e635]/60">✓</span>}
          </td>
          <td className="px-2 py-1 text-[11px] text-zinc-500">{l.envName}</td>
          <td className="px-4 py-1 text-right">
            <input
              type="number"
              value={amounts.get(l.id) ?? ''}
              onChange={e => setAmt(l.id, e.target.value)}
              className="w-24 text-right bg-transparent border border-transparent hover:border-white/[0.08] focus:border-[#a3e635]/40 rounded px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none focus:text-white"
            />
          </td>
        </tr>
      ))}
      {/* Register row */}
      <tr className="border-t border-white/[0.04] bg-white/[0.01]">
        <td colSpan={4} className="px-4 py-2">
          {ok ? (
            <span className="text-[11px] text-[#a3e635]">
              ✓ Registrado ({checkedItems.length} movimiento{checkedItems.length !== 1 ? 's' : ''})
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select value={fromId} onChange={e => setFromId(e.target.value)}
                className="bg-white/[0.06] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-zinc-400 focus:outline-none focus:border-[#a3e635]/40">
                <option value="">Débito desde sobre… (opcional)</option>
                {envelopes.map(e => (
                  <option key={e.id} value={e.id}>{e.name}{e.custodio ? ` (${e.custodio})` : ''}</option>
                ))}
              </select>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="bg-white/[0.06] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#a3e635]/40" />
              <button onClick={register} disabled={isPending || checkedItems.length === 0}
                className="px-3 py-1 rounded bg-white/[0.08] text-zinc-300 text-[11px] font-semibold hover:bg-white/[0.12] disabled:opacity-50 transition-colors">
                {isPending ? '...' : `Registrar${checkedItems.length > 0 ? ` (${checkedItems.length})` : ''}`}
              </button>
              {err && <span className="text-[10px] text-rose-400">{err}</span>}
            </div>
          )}
        </td>
      </tr>
    </>
  )
}

function TransferSummary({
  budgets, envelopes, year, month,
}: {
  budgets: Budget[]
  envelopes: Envelope[]
  year: number
  month: number
}) {
  const [q, setQ] = useState<1 | 2>(1)
  const [open, setOpen] = useState(false)

  const envelopeMap = new Map(envelopes.map(e => [e.id, e]))

  const lines = budgets
    .filter(b => (b.budget_type === 'savings' || b.budget_type === 'expense') && b.envelope_id)
    .map(b => {
      const env = envelopeMap.get(b.envelope_id!)
      const qDone = b.budget_type === 'savings' || b.budget_type === 'income'
        ? (q === 1 ? b.q1_done : b.q2_done)
        : false   // expenses: quincena done = spent, not the same as "funded"
      return {
        ...b,
        envId:      b.envelope_id!,
        envName:    env?.name ?? b.envelope_id!,
        custodio:   env?.custodio ?? 'Sin custodio',
        amount:     Number(q === 1 ? b.q1_amount : b.q2_amount) || 0,
        budgetType: b.budget_type,
        qDone:      !!qDone,
      }
    })
    .filter(l => l.amount > 0)

  const byCustomer = new Map<string, typeof lines>()
  for (const l of lines) {
    const arr = byCustomer.get(l.custodio) ?? []
    arr.push(l)
    byCustomer.set(l.custodio, arr)
  }
  const custodios = [...byCustomer.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const total = lines.reduce((s, l) => s + l.amount, 0)

  if (lines.length === 0) return null

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronUp size={12} className="text-zinc-500 shrink-0" /> : <ChevronDown size={12} className="text-zinc-500 shrink-0" />}
          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.16em]">Plan de transferencias</span>
          <span className="text-[9px] text-zinc-600">·</span>
          <span className="text-xs font-bold text-white">₡{Math.round(total).toLocaleString('es-CR')}</span>
        </div>
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5" onClick={e => e.stopPropagation()}>
          {([1, 2] as const).map(qi => (
            <button key={qi} onClick={() => setQ(qi)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${q === qi ? 'bg-[#a3e635] text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>
              Q{qi}
            </button>
          ))}
        </div>
      </button>
      {open && (
        <table className="w-full text-xs border-collapse border-t border-white/[0.06]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="w-7" />
              <th className="text-left px-2 py-1.5 text-[9px] font-semibold text-zinc-600 uppercase tracking-widest w-[38%]">Línea</th>
              <th className="text-left px-2 py-1.5 text-[9px] font-semibold text-zinc-600 uppercase tracking-widest">Sobre</th>
              <th className="text-right px-4 py-1.5 text-[9px] font-semibold text-zinc-600 uppercase tracking-widest w-28">Monto</th>
            </tr>
          </thead>
          <tbody>
            {custodios.map(([custodio, items]) => (
              <CustodioRow
                key={custodio}
                custodio={custodio}
                items={items}
                envelopes={envelopes}
                q={q}
                year={year}
                month={month}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
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
  envelopes:    Envelope[]
  txCategories: TxCategory[]
  accounts:     FinancialAccount[]
}

export function PresupuestoClient({
  budgets, actualQ1, actualQ2, history, incomeActual, year, month, suggestions, envelopes, txCategories, accounts,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  type OptAction =
    | { type: 'toggle'; id: string; q: 1 | 2; done: boolean }
    | { type: 'bulk';   q: 1 | 2; done: boolean }

  const [optimisticBudgets, dispatchOptimistic] = useOptimistic(
    budgets,
    (state: Budget[], action: OptAction) => {
      if (action.type === 'toggle') {
        return state.map(b => b.id === action.id
          ? { ...b, [action.q === 1 ? 'q1_done' : 'q2_done']: action.done }
          : b
        )
      }
      return state.map(b => ({ ...b, [action.q === 1 ? 'q1_done' : 'q2_done']: action.done }))
    },
  )

  const [editId, setEditId]                       = useState<string | null>(null)
  const [editName, setEditName]                   = useState('')
  const [editQ1, setEditQ1]                       = useState('')
  const [editQ2, setEditQ2]                       = useState('')
  const [editBudgetType, setEditBudgetType]       = useState<BudgetType>('expense')
  const [editEnvelopeId, setEditEnvelopeId]       = useState<string>('')
  const [editAutoTxCat, setEditAutoTxCat]         = useState<string>('')
  const [editAutoTxAccount, setEditAutoTxAccount] = useState<string>('')

  const [showAdd, setShowAdd]                     = useState(false)
  const [newName, setNewName]                     = useState('')
  const [newQ1, setNewQ1]                         = useState('')
  const [newQ2, setNewQ2]                         = useState('')
  const [newType, setNewType]                     = useState<BudgetType>('expense')
  const [newEnvelopeId, setNewEnvelopeId]         = useState<string>('')
  const [newAutoTxCat, setNewAutoTxCat]           = useState<string>('')
  const [newAutoTxAccount, setNewAutoTxAccount]   = useState<string>('')

  const [editError, setEditError]         = useState<string | null>(null)
  const [addError, setAddError]           = useState<string | null>(null)

  const [collapsed, setCollapsed]         = useState<Set<string>>(new Set())
  const [sortKey, setSortKey]             = useState<SortKey | null>(null)
  const [sortDir, setSortDir]             = useState<'asc' | 'desc'>('asc')
  const [showNoLimit, setShowNoLimit]     = useState(false)
  const [editRealCell, setEditRealCell]   = useState<{ id: string; q: 1 | 2 } | null>(null)
  const [editRealVal, setEditRealVal]     = useState('')

  const now             = new Date()
  const isCurrentMonth  = year === now.getFullYear() && month === now.getMonth() + 1
  const currentDay      = isCurrentMonth ? now.getDate() : 31
  const isQ1Active      = currentDay <= 15
  const isQ2Active      = currentDay > 15

  // Map envelope id → name for display
  const envelopeMap = new Map(envelopes.map(e => [e.id, e]))

  // Build grouped options: top-level first, then children indented
  const topEnvelopes  = envelopes.filter(e => !e.parent_envelope_id)
  const childMap      = new Map<string, Envelope[]>()
  for (const e of envelopes) {
    if (e.parent_envelope_id) {
      const list = childMap.get(e.parent_envelope_id) ?? []
      list.push(e)
      childMap.set(e.parent_envelope_id, list)
    }
  }

  function navigate(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    router.push(`/presupuesto?m=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  function lookupHist(category: string, rec: Record<string, number>): number | undefined {
    if (rec[category] !== undefined) return rec[category]
    const lower = category.toLowerCase()
    for (const [key, val] of Object.entries(rec)) {
      const kl = key.toLowerCase()
      if (kl.includes(lower) || lower.includes(kl)) return val
    }
    return undefined
  }

  function sortLines(lines: Budget[]): Budget[] {
    if (!sortKey) return lines
    return [...lines].sort((a, b) => {
      let va: number | string
      let vb: number | string
      switch (sortKey) {
        case 'name':
          va = a.category; vb = b.category; break
        case 'q1_plan':
          va = a.q1_amount ?? 0; vb = b.q1_amount ?? 0; break
        case 'q2_plan':
          va = a.q2_amount ?? 0; vb = b.q2_amount ?? 0; break
        case 'actual':
          va = (actualQ1[resolveKey(a)] ?? 0) + (actualQ2[resolveKey(a)] ?? 0)
          vb = (actualQ1[resolveKey(b)] ?? 0) + (actualQ2[resolveKey(b)] ?? 0); break
        case 'history':
          va = lookupHist(resolveKey(a), history) ?? 0
          vb = lookupHist(resolveKey(b), history) ?? 0; break
        case 'pct': {
          const planA = (a.q1_amount ?? 0) + (a.q2_amount ?? 0)
          const planB = (b.q1_amount ?? 0) + (b.q2_amount ?? 0)
          const actA  = (actualQ1[a.category] ?? 0) + (actualQ2[a.category] ?? 0)
          const actB  = (actualQ1[b.category] ?? 0) + (actualQ2[b.category] ?? 0)
          va = planA > 0 ? actA / planA : 0
          vb = planB > 0 ? actB / planB : 0; break
        }
        default: va = 0; vb = 0
      }
      const cmp = typeof va === 'string'
        ? (va as string).localeCompare(vb as string)
        : (va as number) - (vb as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function toggleSection(label: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  const expenseLines = sortLines(optimisticBudgets.filter(b => b.budget_type === 'expense'))
  const savingsLines = sortLines(optimisticBudgets.filter(b => b.budget_type === 'savings'))
  const incomeLines  = sortLines(optimisticBudgets.filter(b => b.budget_type === 'income'))

  const allQ1Done = optimisticBudgets.length > 0 && optimisticBudgets.every(b => b.q1_done)
  const allQ2Done = optimisticBudgets.length > 0 && optimisticBudgets.every(b => b.q2_done)

  // Resolve lookup key for actualQ1/Q2 maps.
  // Priority: exact auto_tx_category_code → exact category name → prefix fuzzy match
  // (e.g., "Supermercado/ab..." startsWith "Supermercado" → match)
  function resolveKey(b: Budget) {
    if (b.auto_tx_category_code) return b.auto_tx_category_code
    if (actualQ1[b.category] !== undefined || actualQ2[b.category] !== undefined) return b.category
    const catLower = b.category.toLowerCase()
    const allKeys  = [...new Set([...Object.keys(actualQ1), ...Object.keys(actualQ2)])]
    const hit = allKeys.find(k => {
      const kl = k.toLowerCase()
      return catLower.startsWith(kl) || kl.startsWith(catLower)
    })
    return hit ?? b.category
  }

  // Manual override > transaction actual > plan-if-done fallback
  function effActQ1(b: Budget) {
    if (b.q1_actual !== null && b.q1_actual !== undefined) return b.q1_actual
    const raw = actualQ1[resolveKey(b)]
    return raw !== undefined ? raw : (b.q1_done ? (b.q1_amount ?? 0) : 0)
  }
  function effActQ2(b: Budget) {
    if (b.q2_actual !== null && b.q2_actual !== undefined) return b.q2_actual
    const raw = actualQ2[resolveKey(b)]
    return raw !== undefined ? raw : (b.q2_done ? (b.q2_amount ?? 0) : 0)
  }

  const incomeExpected = incomeLines.reduce((s, b) => s + (b.monthly_limit ?? 0), 0)
  const totalPlanQ1    = [...expenseLines, ...savingsLines].reduce((s, b) => s + (b.q1_amount ?? 0), 0)
  const totalPlanQ2    = [...expenseLines, ...savingsLines].reduce((s, b) => s + (b.q2_amount ?? 0), 0)
  const totalPlan      = totalPlanQ1 + totalPlanQ2

  const budgetedGroups = new Set<string>()
  for (const b of optimisticBudgets) {
    budgetedGroups.add(b.category)
    if (b.auto_tx_category_code) budgetedGroups.add(getGroupLabel(b.auto_tx_category_code))
  }
  const totalActQ1 = [...expenseLines, ...savingsLines].reduce((s, b) => s + effActQ1(b), 0)
  const totalActQ2 = [...expenseLines, ...savingsLines].reduce((s, b) => s + effActQ2(b), 0)
  const totalAct   = totalActQ1 + totalActQ2
  const totalPct   = totalPlan > 0 ? totalAct / totalPlan * 100 : 0

  // Income per quincena (plan + effective)
  const incQ1Plan = incomeLines.reduce((s, b) => s + (b.q1_amount ?? 0), 0)
  const incQ2Plan = incomeLines.reduce((s, b) => s + (b.q2_amount ?? 0), 0)
  const incQ1Eff  = incomeLines.reduce((s, b) => s + effActQ1(b), 0)
  const incQ2Eff  = incomeLines.reduce((s, b) => s + effActQ2(b), 0)

  // Gap = income – egresos, per quincena
  const gapQ1Plan = incQ1Plan - totalPlanQ1
  const gapQ2Plan = incQ2Plan - totalPlanQ2
  const gapQ1Real = incQ1Eff  - totalActQ1
  const gapQ2Real = incQ2Eff  - totalActQ2

  function fmtGap(n: number) { return `${n >= 0 ? '+' : ''}${fmt(n)}` }
  function gapCls(n: number)  { return n >= 0 ? 'text-emerald-400' : 'text-rose-400' }

  const allActual: Record<string, number> = {}
  for (const [g, v] of Object.entries(actualQ1)) allActual[g] = (allActual[g] ?? 0) + v
  for (const [g, v] of Object.entries(actualQ2)) allActual[g] = (allActual[g] ?? 0) + v
  const unbudgeted = Object.entries(allActual)
    .filter(([g]) => !budgetedGroups.has(g))
    .sort((a, b) => b[1] - a[1])

  // ── helpers ──────────────────────────────────────────────────────────────────

  function startEdit(b: Budget) {
    setEditId(b.id); setEditName(b.category)
    setEditQ1(String(b.q1_amount ?? '')); setEditQ2(String(b.q2_amount ?? ''))
    setEditBudgetType(b.budget_type as BudgetType)
    setEditEnvelopeId(b.envelope_id ?? '')
    setEditAutoTxCat(b.auto_tx_category_code ?? '')
    setEditAutoTxAccount(b.auto_tx_account_id ?? '')
    setEditError(null)
  }

  // First day of the currently viewed month — edits apply from here forward
  const effectiveFrom = `${year}-${String(month).padStart(2, '0')}-01`

  function saveEdit(b: Budget) {
    const q1   = parseFloat(editQ1) || 0
    const q2   = parseFloat(editQ2) || 0
    const name = editName.trim() || b.category
    setEditError(null)
    startTransition(async () => {
      const { error } = await upsertBudget(name, q1, q2, editBudgetType,
        editEnvelopeId || null,
        editAutoTxCat || null,
        editAutoTxAccount || null,
        effectiveFrom,
      )
      if (error) { setEditError(error); return }
      if (name !== b.category) await deleteBudget(b.id)
      setEditId(null)
    })
  }

  function handleAdd() {
    const q1 = parseFloat(newQ1) || 0
    const q2 = parseFloat(newQ2) || 0
    if (!newName.trim()) return
    setAddError(null)
    startTransition(async () => {
      const { error } = await upsertBudget(newName.trim(), q1, q2, newType,
        newEnvelopeId || null,
        newAutoTxCat || null,
        newAutoTxAccount || null,
        effectiveFrom,
      )
      if (error) { setAddError(error); return }
      setShowAdd(false); setNewName(''); setNewQ1(''); setNewQ2('')
      setNewType('expense'); setNewEnvelopeId(''); setNewAutoTxCat(''); setNewAutoTxAccount('')
    })
  }

  function handleToggle(id: string, q: 1 | 2, done: boolean) {
    startTransition(async () => {
      dispatchOptimistic({ type: 'toggle', id, q, done })
      await toggleQuincena(id, q, done, year, month)
    })
  }

  function handleBulkToggle(q: 1 | 2) {
    const allDone = optimisticBudgets.every(b => (q === 1 ? b.q1_done : b.q2_done))
    const done = !allDone
    startTransition(async () => {
      dispatchOptimistic({ type: 'bulk', q, done })
      await bulkToggleQuincena(q, done, year, month)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => { await deleteBudget(id) })
  }

  function handleSaveReal(b: Budget, q: 1 | 2) {
    const val    = parseFloat(editRealVal)
    const actual = isNaN(val) ? null : val
    setEditRealCell(null)
    startTransition(async () => {
      await updateBudgetActual(b.category, q, actual, year, month)
    })
  }

  // ── envelope select ───────────────────────────────────────────────────────────

  function EnvelopeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-[#a3e635]">
        <option value="">Sin sobre</option>
        {topEnvelopes.map(e => (
          <>
            <option key={e.id} value={e.id}>{e.name}</option>
            {(childMap.get(e.id) ?? []).map(child => (
              <>
                <option key={child.id} value={child.id}>{'  └ '}{child.name}</option>
                {(childMap.get(child.id) ?? []).map(grandchild => (
                  <option key={grandchild.id} value={grandchild.id}>{'    └ '}{grandchild.name}</option>
                ))}
              </>
            ))}
          </>
        ))}
      </select>
    )
  }

  function TxCategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-400">
        <option value="">Sin tx automática</option>
        {txCategories.map(c => (
          <option key={c.code} value={c.code}>{c.name}</option>
        ))}
      </select>
    )
  }

  function AccountSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-400">
        <option value="">Sin cuenta específica</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>
        ))}
      </select>
    )
  }

  // ── sort icon ─────────────────────────────────────────────────────────────────

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown size={10} className="ml-0.5 opacity-30" />
    return sortDir === 'asc'
      ? <ArrowUp size={10} className="ml-0.5 text-[#a3e635]" />
      : <ArrowDown size={10} className="ml-0.5 text-[#a3e635]" />
  }

  function Th({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) {
    return (
      <th
        onClick={() => handleSort(k)}
        className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none hover:text-zinc-200 transition-colors ${right ? 'text-right' : 'text-left'} ${sortKey === k ? 'text-zinc-200' : 'text-zinc-500'}`}
      >
        <span className={`inline-flex items-center ${right ? 'justify-end w-full' : ''}`}>
          {children}<SortIcon k={k} />
        </span>
      </th>
    )
  }

  // ── egresos parent header (expense + savings combined) ───────────────────────

  function renderEgresosHeader() {
    const egCollapsed = collapsed.has('egresos')
    const q1Plan = totalPlanQ1, q2Plan = totalPlanQ2
    const q1Real = totalActQ1,  q2Real = totalActQ2
    const pct    = totalPct
    return (
      <tr key="egresos-header"
        onClick={() => toggleSection('egresos')}
        className="cursor-pointer select-none border-b border-zinc-600 hover:bg-zinc-800/40 transition-colors"
      >
        <td className="px-3 py-2 bg-zinc-900/80">
          <span className="flex items-center gap-1.5 text-[11px] font-black text-zinc-300 uppercase tracking-widest">
            {egCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            Egresos
            <span className="text-zinc-600 font-normal normal-case tracking-normal text-[10px]">
              ({expenseLines.length + savingsLines.length})
            </span>
          </span>
        </td>
        <td className="px-3 py-2 bg-zinc-900/80 text-right tabular-nums text-xs font-bold text-zinc-200">{fmt(q1Plan)}</td>
        <td className={`px-3 py-2 bg-zinc-900/80 text-right tabular-nums text-xs font-bold ${pctCls(q1Plan > 0 ? q1Real / q1Plan * 100 : 0)}`}>{fmt(q1Real)}</td>
        <td className="bg-zinc-900/80" />
        <td className="px-3 py-2 bg-zinc-900/80 text-right tabular-nums text-xs font-bold text-zinc-200">{fmt(q2Plan)}</td>
        <td className={`px-3 py-2 bg-zinc-900/80 text-right tabular-nums text-xs font-bold ${pctCls(q2Plan > 0 ? q2Real / q2Plan * 100 : 0)}`}>{fmt(q2Real)}</td>
        <td className="bg-zinc-900/80" />
        <td className="bg-zinc-900/80" />
        <td className="px-2 py-2 bg-zinc-900/80">
          <div className="flex items-center gap-1 justify-end">
            <strong className={`text-xs tabular-nums ${pctCls(pct)}`}>{Math.round(pct)}%</strong>
            <div className="w-10 h-1 bg-zinc-800 rounded-full overflow-hidden shrink-0">
              <div className={`h-full rounded-full ${barCls(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        </td>
      </tr>
    )
  }

  // ── section renderer (called as function, not component, to avoid remount) ────

  function renderSection(label: string, lines: Budget[]) {
    const isCollapsed = collapsed.has(label)
    const sectionPlanQ1 = lines.reduce((s, b) => s + (b.q1_amount ?? 0), 0)
    const sectionPlanQ2 = lines.reduce((s, b) => s + (b.q2_amount ?? 0), 0)
    const sectionActQ1  = lines.reduce((s, b) => s + effActQ1(b), 0)
    const sectionActQ2  = lines.reduce((s, b) => s + effActQ2(b), 0)

    const sectionPlan = sectionPlanQ1 + sectionPlanQ2
    const sectionAct  = sectionActQ1  + sectionActQ2
    const sectionPct  = sectionPlan > 0 ? sectionAct / sectionPlan * 100 : 0

    return (
      <>
        <tr
          key={`section-${label}`}
          onClick={() => toggleSection(label)}
          className="cursor-pointer select-none border-b border-zinc-700/60 hover:bg-zinc-800/30 transition-colors"
        >
          <td className="px-3 py-1.5 bg-zinc-900/50">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              {isCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
              {label}
              <span className="text-zinc-600 font-normal normal-case tracking-normal">({lines.length})</span>
            </span>
          </td>
          <td className="px-3 py-1.5 bg-zinc-900/50 text-right tabular-nums text-xs font-semibold text-zinc-300">
            {sectionPlanQ1 ? fmt(sectionPlanQ1) : ''}
          </td>
          <td className={`px-3 py-1.5 bg-zinc-900/50 text-right tabular-nums text-xs font-semibold ${pctCls(sectionPlanQ1 > 0 ? sectionActQ1 / sectionPlanQ1 * 100 : 0)}`}>
            {sectionActQ1 ? fmt(sectionActQ1) : ''}
          </td>
          <td className="bg-zinc-900/50" />
          <td className="px-3 py-1.5 bg-zinc-900/50 text-right tabular-nums text-xs font-semibold text-zinc-300">
            {sectionPlanQ2 ? fmt(sectionPlanQ2) : ''}
          </td>
          <td className={`px-3 py-1.5 bg-zinc-900/50 text-right tabular-nums text-xs font-semibold ${pctCls(sectionPlanQ2 > 0 ? sectionActQ2 / sectionPlanQ2 * 100 : 0)}`}>
            {sectionActQ2 ? fmt(sectionActQ2) : ''}
          </td>
          <td className="bg-zinc-900/50" />
          <td className="bg-zinc-900/50" />
          <td className="px-2 py-1.5 bg-zinc-900/50">
            {sectionPlan > 0 && (
              <div className="flex items-center gap-1 justify-end">
                <strong className={`text-xs tabular-nums ${pctCls(sectionPct)}`}>{Math.round(sectionPct)}%</strong>
                <div className="w-10 h-1 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                  <div className={`h-full rounded-full ${barCls(sectionPct)}`}
                    style={{ width: `${Math.min(sectionPct, 100)}%` }} />
                </div>
              </div>
            )}
          </td>
        </tr>
        {!isCollapsed && lines.map(b => renderBudgetRow(b))}
      </>
    )
  }

  // ── budget row (called as function, not component, to avoid remount) ──────────

  function renderBudgetRow(b: Budget) {
    const key    = resolveKey(b)
    const q1Act  = actualQ1[key]
    const q2Act  = actualQ2[key]
    const histVal = lookupHist(key, history)
    const q1Plan = b.q1_amount ?? 0
    const q2Plan = b.q2_amount ?? 0
    const effQ1  = effActQ1(b)
    const effQ2  = effActQ2(b)
    const plan   = q1Plan + q2Plan
    const act    = effQ1 + effQ2
    const pct    = plan > 0 ? act / plan * 100 : 0
    const isEdit = editId === b.id
    const envName  = b.envelope_id ? envelopeMap.get(b.envelope_id)?.name : undefined
    const hasTxAuto = !!b.auto_tx_category_code

    const q1HasOverride = b.q1_actual !== null && b.q1_actual !== undefined
    const q2HasOverride = b.q2_actual !== null && b.q2_actual !== undefined
    const q1HasData  = q1HasOverride || q1Act !== undefined || b.q1_done
    const q2HasData  = q2HasOverride || q2Act !== undefined || b.q2_done
    const q1Fallback = b.q1_done && q1Act === undefined && !q1HasOverride
    const q2Fallback = b.q2_done && q2Act === undefined && !q2HasOverride

    const q1Cls = !q1HasData ? 'text-zinc-700'
      : q1Fallback ? 'text-zinc-500'
      : (q1Plan && effQ1 > q1Plan ? 'text-rose-400' : 'text-emerald-400')
    const q2Cls = !q2HasData ? 'text-zinc-700'
      : q2Fallback ? 'text-zinc-500'
      : (q2Plan && effQ2 > q2Plan ? 'text-rose-400' : 'text-emerald-400')

    if (isEdit) return (
      <>
      <tr key={b.id} className="bg-zinc-800/50 border-b border-zinc-700">
        <td className="px-2 py-2 space-y-1.5">
          <input value={editName} onChange={e => setEditName(e.target.value)} list="budget-cat-list"
            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#a3e635]" />
          <select value={editBudgetType} onChange={e => setEditBudgetType(e.target.value as BudgetType)}
            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#a3e635]">
            <option value="expense">Gasto (débita sobre)</option>
            <option value="savings">Ahorro/Inversión (acredita sobre)</option>
            <option value="income">Ingreso esperado</option>
          </select>
          <EnvelopeSelect value={editEnvelopeId} onChange={setEditEnvelopeId} />
          <TxCategorySelect value={editAutoTxCat} onChange={setEditAutoTxCat} />
          {editAutoTxCat && <AccountSelect value={editAutoTxAccount} onChange={setEditAutoTxAccount} />}
        </td>
        <td className="px-2 py-2" colSpan={3}>
          <input type="number" value={editQ1} onChange={e => setEditQ1(e.target.value)}
            placeholder="Q1 ₡"
            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#a3e635] [appearance:textfield]" />
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
      {editError && (
        <tr>
          <td colSpan={12} className="px-3 pb-2">
            <p className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-1.5 leading-snug">
              ⚠ {editError}
            </p>
          </td>
        </tr>
      )}
      </>
    )

    return (
      <tr key={b.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 group transition-colors">
        <td className="px-3 py-2 text-xs font-medium text-white">
          <span className="flex items-center gap-1.5 min-w-0">
            <button onClick={() => startEdit(b)}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300">
              <Pencil size={10} />
            </button>
            <span className="truncate max-w-[110px]" title={b.category}>{b.category}</span>
            {envName && (
              <span className="shrink-0 flex items-center gap-0.5 text-[9px] text-violet-400 bg-violet-400/10 rounded px-1 py-0.5"
                title={`Sobre: ${envName}`}>
                <Link2 size={8} />{envName}
              </span>
            )}
            {hasTxAuto && (
              <span className="shrink-0 text-amber-400/70" title="Crea transacción al marcar ✓">
                <Receipt size={9} />
              </span>
            )}
          </span>
        </td>
        <td className={`px-3 py-2 text-xs text-right tabular-nums ${isQ1Active ? 'text-zinc-200' : 'text-zinc-500'}`}>
          {q1Plan ? fmt(q1Plan) : <span className="text-zinc-700">—</span>}
        </td>
        <td className={`px-2 py-2 text-xs text-right tabular-nums group/q1r ${q1Cls}`}>
          {editRealCell?.id === b.id && editRealCell.q === 1 ? (
            <input autoFocus type="number" value={editRealVal}
              onChange={e => setEditRealVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveReal(b, 1); if (e.key === 'Escape') setEditRealCell(null) }}
              onBlur={() => handleSaveReal(b, 1)}
              className="w-16 bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-xs text-white text-right focus:outline-none focus:border-[#a3e635] [appearance:textfield]" />
          ) : (
            <span className="inline-flex items-center gap-0.5 justify-end w-full">
              <span>{q1HasData ? fmt(effQ1) : '—'}</span>
              <button
                onClick={() => {
                  const pre = b.q1_actual !== null ? String(b.q1_actual) : q1Act !== undefined ? String(Math.round(q1Act)) : String(q1Plan)
                  setEditRealCell({ id: b.id, q: 1 }); setEditRealVal(pre)
                }}
                className="opacity-0 group-hover/q1r:opacity-100 text-zinc-600 hover:text-zinc-300 transition-opacity shrink-0 ml-0.5">
                <Pencil size={7} />
              </button>
            </span>
          )}
        </td>
        <td className="px-2 py-2 text-center">
          <button onClick={() => handleToggle(b.id, 1, !b.q1_done)} disabled={isPending}
            title={b.q1_done
              ? [envName && `undo retira de "${envName}"`, hasTxAuto && 'undo elimina tx del ledger'].filter(Boolean).join(' · ') || 'Marcar pendiente'
              : [envName && `registra en "${envName}"`, hasTxAuto && 'crea tx en ledger'].filter(Boolean).join(' · ') || 'Marcar listo'}
            className={`inline-flex items-center justify-center w-4 h-4 rounded border transition-colors ${
              b.q1_done ? 'bg-[#a3e635] border-[#a3e635] text-black' : 'border-zinc-700 hover:border-zinc-400'
            }`}>
            {b.q1_done && <Check size={9} />}
          </button>
        </td>
        <td className={`px-3 py-2 text-xs text-right tabular-nums ${isQ2Active ? 'text-zinc-200' : 'text-zinc-500'}`}>
          {q2Plan ? fmt(q2Plan) : <span className="text-zinc-700">—</span>}
        </td>
        <td className={`px-2 py-2 text-xs text-right tabular-nums group/q2r ${q2Cls}`}>
          {editRealCell?.id === b.id && editRealCell.q === 2 ? (
            <input autoFocus type="number" value={editRealVal}
              onChange={e => setEditRealVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveReal(b, 2); if (e.key === 'Escape') setEditRealCell(null) }}
              onBlur={() => handleSaveReal(b, 2)}
              className="w-16 bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-xs text-white text-right focus:outline-none focus:border-[#a3e635] [appearance:textfield]" />
          ) : (
            <span className="inline-flex items-center gap-0.5 justify-end w-full">
              <span>{q2HasData ? fmt(effQ2) : '—'}</span>
              <button
                onClick={() => {
                  const pre = b.q2_actual !== null ? String(b.q2_actual) : q2Act !== undefined ? String(Math.round(q2Act)) : String(q2Plan)
                  setEditRealCell({ id: b.id, q: 2 }); setEditRealVal(pre)
                }}
                className="opacity-0 group-hover/q2r:opacity-100 text-zinc-600 hover:text-zinc-300 transition-opacity shrink-0 ml-0.5">
                <Pencil size={7} />
              </button>
            </span>
          )}
        </td>
        <td className="px-2 py-2 text-center">
          <button onClick={() => handleToggle(b.id, 2, !b.q2_done)} disabled={isPending}
            title={b.q2_done
              ? [envName && `undo retira de "${envName}"`, hasTxAuto && 'undo elimina tx del ledger'].filter(Boolean).join(' · ') || 'Marcar pendiente'
              : [envName && `registra en "${envName}"`, hasTxAuto && 'crea tx en ledger'].filter(Boolean).join(' · ') || 'Marcar listo'}
            className={`inline-flex items-center justify-center w-4 h-4 rounded border transition-colors ${
              b.q2_done ? 'bg-[#a3e635] border-[#a3e635] text-black' : 'border-zinc-700 hover:border-zinc-400'
            }`}>
            {b.q2_done && <Check size={9} />}
          </button>
        </td>
        <td className={`px-3 py-2 text-xs text-right tabular-nums ${histVal !== undefined ? 'text-zinc-400' : 'text-zinc-700'}`}
          title={histVal !== undefined ? `Avg/Q 3m: ${fmtFull(histVal)}` : 'Sin historial'}>
          {histVal !== undefined ? fmt(histVal) : '—'}
        </td>
        <td className="px-2 py-2">
          {plan > 0 && (
            <div className="flex items-center gap-1.5 justify-end">
              <span className={`text-xs tabular-nums font-semibold ${pctCls(pct)}`}>
                {Math.round(pct)}%
              </span>
              <div className="w-10 h-1 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                <div className={`h-full rounded-full ${barCls(pct)}`}
                  style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
            </div>
          )}
        </td>
      </tr>
    )
  }

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <datalist id="budget-cat-list">
        {suggestions.map(s => <option key={s} value={s} />)}
      </datalist>

      {/* Header */}
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

      {/* Income summary cards */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-zinc-500 mb-0.5">Ing. esperado</p>
          <p className="text-sm font-black text-white">{fmt(incomeExpected || 0)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5 truncate">
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
          ) : <p className="text-sm font-black text-zinc-600">—</p>}
        </div>
      </div>

      {/* Transfer summary */}
      <TransferSummary budgets={optimisticBudgets} envelopes={envelopes} year={year} month={month} />

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full border-collapse text-left" style={{ minWidth: 760 }}>
          <thead>
            <tr className="bg-zinc-900/80 border-b border-zinc-800">
              <td colSpan={9} className="px-3 py-2">
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span>Plan <strong className="text-zinc-200">{fmt(totalPlan)}</strong></span>
                  <span>Real <strong className={pctCls(totalPct)}>{fmt(totalAct)}</strong></span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barCls(totalPct)}`}
                      style={{ width: `${Math.min(totalPct, 100)}%` }} />
                  </div>
                  <strong className={pctCls(totalPct)}>{Math.round(totalPct)}%</strong>
                </div>
              </td>
            </tr>
            <tr className="bg-zinc-900/50 border-b border-zinc-700">
              <Th k="name">Línea</Th>
              <Th k="q1_plan" right>
                <span className={isQ1Active ? 'text-[#a3e635]/80' : ''}>Q1 Plan</span>
              </Th>
              <Th k="actual" right>
                <span className={isQ1Active ? 'text-[#a3e635]/80' : ''}>Q1 Real</span>
              </Th>
              <th className={`px-2 py-2 text-center ${isQ1Active ? 'text-[#a3e635]/60' : 'text-zinc-600'}`}>
                <button onClick={() => handleBulkToggle(1)} disabled={isPending}
                  title={allQ1Done ? 'Desmarcar todos Q1' : 'Marcar todos Q1 listos'}
                  className={`inline-flex items-center justify-center w-4 h-4 rounded border transition-colors hover:opacity-70 ${allQ1Done ? 'bg-[#a3e635] border-[#a3e635] text-black' : 'border-current'}`}>
                  {allQ1Done && <Check size={9} />}
                </button>
              </th>
              <Th k="q2_plan" right>
                <span className={isQ2Active ? 'text-[#a3e635]/80' : ''}>Q2 Plan</span>
              </Th>
              <th className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-right ${isQ2Active ? 'text-[#a3e635]/60' : 'text-zinc-600'}`}>Q2 Real</th>
              <th className={`px-2 py-2 text-center ${isQ2Active ? 'text-[#a3e635]/60' : 'text-zinc-600'}`}>
                <button onClick={() => handleBulkToggle(2)} disabled={isPending}
                  title={allQ2Done ? 'Desmarcar todos Q2' : 'Marcar todos Q2 listos'}
                  className={`inline-flex items-center justify-center w-4 h-4 rounded border transition-colors hover:opacity-70 ${allQ2Done ? 'bg-[#a3e635] border-[#a3e635] text-black' : 'border-current'}`}>
                  {allQ2Done && <Check size={9} />}
                </button>
              </th>
              <Th k="history" right>Avg/Q</Th>
              <Th k="pct" right>%</Th>
            </tr>
          </thead>

          <tbody className="bg-zinc-900/10">
            {renderEgresosHeader()}
            {!collapsed.has('egresos') && expenseLines.length > 0 && renderSection('Gastos', expenseLines)}
            {!collapsed.has('egresos') && savingsLines.length > 0 && renderSection('Ahorros / Inversión', savingsLines)}
            {incomeLines.length > 0 && renderSection('Ingresos esperados', incomeLines)}
          </tbody>

          <tfoot>
            <tr className="border-t border-zinc-700 bg-zinc-900/60 text-xs font-bold">
              <td className="px-3 py-2 text-zinc-400">Egresos</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{fmt(totalPlanQ1)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${pctCls(totalPlanQ1 > 0 ? totalActQ1 / totalPlanQ1 * 100 : 0)}`}>{fmt(totalActQ1)}</td>
              <td />
              <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{fmt(totalPlanQ2)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${pctCls(totalPlanQ2 > 0 ? totalActQ2 / totalPlanQ2 * 100 : 0)}`}>{fmt(totalActQ2)}</td>
              <td />
              <td />
              <td className={`px-3 py-2 text-right ${pctCls(totalPct)}`}>{Math.round(totalPct)}%</td>
            </tr>
            <tr className="border-t-2 border-zinc-500 bg-zinc-900/80 text-xs font-black">
              <td className="px-3 py-2.5 text-zinc-200 tracking-wide">SOBRANTE</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${gapCls(gapQ1Plan)}`}>{fmtGap(gapQ1Plan)}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${gapCls(gapQ1Real)}`}>{fmtGap(gapQ1Real)}</td>
              <td />
              <td className={`px-3 py-2.5 text-right tabular-nums ${gapCls(gapQ2Plan)}`}>{fmtGap(gapQ2Plan)}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${gapCls(gapQ2Real)}`}>{fmtGap(gapQ2Real)}</td>
              <td />
              <td />
              <td className={`px-3 py-2.5 text-right tabular-nums ${gapCls(gapQ1Plan + gapQ2Plan)}`}>
                {fmtGap(gapQ1Plan + gapQ2Plan)}
              </td>
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
            placeholder="Nombre — escribe lo que quieras (CrossFit, Préstamo casa 2, Alquiler…)"
            value={newName} onChange={e => setNewName(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#a3e635]"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">₡ Quincena 1</label>
              <input type="number" value={newQ1} onChange={e => setNewQ1(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#a3e635] [appearance:textfield]" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">₡ Quincena 2</label>
              <input type="number" value={newQ2} onChange={e => setNewQ2(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#a3e635] [appearance:textfield]" />
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1 block">
                <Link2 size={9} /> Vincular sobre (opcional)
              </label>
              <EnvelopeSelect value={newEnvelopeId} onChange={setNewEnvelopeId} />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1 block">
                <Receipt size={9} /> Crear transacción en ledger (opcional)
              </label>
              <TxCategorySelect value={newAutoTxCat} onChange={setNewAutoTxCat} />
              {newAutoTxCat && (
                <>
                  <p className="text-[10px] text-amber-400 mt-1">
                    Al marcar ✓ se creará una transacción real que afecta el balance.
                  </p>
                  <div className="mt-1.5">
                    <label className="text-[10px] text-zinc-500 mb-1 block">Cuenta a debitar</label>
                    <AccountSelect value={newAutoTxAccount} onChange={setNewAutoTxAccount} />
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="text-[10px] text-zinc-600">
            Si el nombre coincide con un grupo de categoría (ej. "Supermercado", "Mariam") el Real y el Q1/Q2 Avg se calculan automáticamente.
          </p>
          {addError && (
            <p className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-1.5 leading-snug">
              ⚠ {addError}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!newName.trim() || isPending}
              className="flex-1 py-2 rounded-lg bg-[#a3e635] text-black text-sm font-bold disabled:opacity-40 transition-opacity">
              Agregar
            </button>
            <button onClick={() => { setShowAdd(false); setNewName(''); setNewQ1(''); setNewQ2(''); setNewEnvelopeId(''); setNewAutoTxCat(''); setNewAutoTxAccount('') }}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-zinc-700 rounded-xl text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 text-sm transition-colors">
          <PlusCircle size={14} />
          Agregar línea de presupuesto
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
            <div className="rounded-xl border border-zinc-800 overflow-hidden">
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
