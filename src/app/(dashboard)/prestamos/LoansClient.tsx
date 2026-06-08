'use client'

import { useState, useTransition } from 'react'
import { ChevronUp, ChevronDown, Plus, X, Loader2, Pencil } from 'lucide-react'
import {
  computeSchedule,
  simulateCombined,
  type AmortizationResult,
  type ScheduleRow,
} from './amortization'
import { createLoan, updateLoanSortOrder, updateLoanBalance, recordLoanPayment, updateLoanPayment } from '@/app/actions/loans'
import { createTransaction } from '@/app/actions/transactions'

type Payment = {
  id: string
  payment_date: string
  payment_type: string
  amount: number
  principal: number
  interest: number
  insurance: number
  balance_before: number
  balance_after: number
  rate_applied: number
  notes: string | null
}

type RateEntry = {
  effective_date: string
  rate: number
  notes: string | null
}

type LoanData = {
  id: string
  name: string
  lender: string
  currencyCode: string
  originalAmount: number
  currentBalance: number
  interestRate: number
  monthlyInsurance: number
  startDate: string
  endDate: string
  paymentDay: number
  notes: string | null
  sortOrder: number
  remainingMonths: number
  startYearMonth: string
  payments: Payment[]
  rateHistory: RateEntry[]
}

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtCRC(v: number, abbreviated = false): string {
  if (abbreviated) {
    if (v >= 1_000_000) return `₡${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000)    return `₡${(v / 1_000).toFixed(0)}K`
  }
  return `₡${Math.round(v).toLocaleString('es-CR')}`
}

function fmtUSD(v: number): string {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fmtYM(ym: string, yearFull = false): string {
  const d = new Date(ym + '-01T12:00:00')
  return d.toLocaleDateString('es', {
    month: 'short',
    year: yearFull ? 'numeric' : '2-digit',
  })
}

function paymentLabel(t: string): string {
  if (t === 'extra') return 'Abono'
  return 'Normal'
}

const PAYMENT_COLOR: Record<string, string> = {
  normal:  '#a3e635',
  partial: '#a3e635',
  extra:   '#f59e0b',
}

// ── Root component ──────────────────────────────────────────────────────────

export function LoansClient({ loans: initialLoans }: { loans: LoanData[] }) {
  const [loans, setLoans]           = useState<LoanData[]>(initialLoans)
  const [showForm, setShowForm]     = useState(false)
  const [selectedId, setSelectedId] = useState<string>(initialLoans[0]?.id ?? '')
  const [, startTransition]         = useTransition()

  const selectedLoan = loans.find(l => l.id === selectedId) ?? loans[0] ?? null

  function moveUp(index: number) {
    if (index === 0) return
    const next    = [...loans]
    const above   = next[index - 1]
    const current = next[index]
    const tmp     = above.sortOrder
    next[index - 1] = { ...above,   sortOrder: current.sortOrder }
    next[index]     = { ...current, sortOrder: tmp }
    setLoans(next)
    startTransition(async () => {
      await Promise.all([
        updateLoanSortOrder(above.id, current.sortOrder),
        updateLoanSortOrder(current.id, tmp),
      ])
    })
  }

  function moveDown(index: number) {
    if (index === loans.length - 1) return
    moveUp(index + 1)
  }

  function onCreated(loan: LoanData) {
    setLoans([loan, ...loans])
    setSelectedId(loan.id)
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-2xl font-black text-white">Préstamos</p>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] transition-colors"
        >
          <Plus size={14} strokeWidth={3} />
          Nuevo préstamo
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <CreateLoanForm onCreated={onCreated} onCancel={() => setShowForm(false)} />
      )}

      {loans.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center gap-3">
          <p className="text-sm text-zinc-500">Sin préstamos registrados.</p>
          <p className="text-xs text-zinc-600">Usá el botón "Nuevo préstamo" para agregar uno.</p>
        </div>
      )}

      {/* ── Loan selector strip ── */}
      {loans.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {loans.map((loan, i) => {
            const isSelected = loan.id === selectedId
            const isUSD      = loan.currencyCode === 'USD'
            const balFmt     = isUSD ? fmtUSD(loan.currentBalance) : fmtCRC(loan.currentBalance, true)
            const paidPct    = Math.min(100,
              ((loan.originalAmount - loan.currentBalance) / loan.originalAmount) * 100
            )
            return (
              <div key={loan.id} className="flex items-center gap-0.5">
                <button
                  onClick={() => setSelectedId(loan.id)}
                  className={`text-left rounded-2xl border px-4 py-3 transition-all min-w-[160px] ${
                    isSelected
                      ? 'bg-[#a3e635]/[0.08] border-[#a3e635]/30'
                      : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
                  }`}
                >
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">{loan.lender}</p>
                  <p className={`text-sm font-black mt-0.5 leading-tight ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                    {loan.name}
                  </p>
                  <p className={`text-xs font-black mt-1 ${isSelected ? 'text-[#a3e635]' : 'text-zinc-500'}`}>
                    {balFmt}
                  </p>
                  {/* Mini progress */}
                  <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isSelected ? 'bg-[#a3e635]' : 'bg-zinc-600'}`}
                      style={{ width: `${paidPct.toFixed(1)}%` }}
                    />
                  </div>
                </button>
                {/* Reorder arrows */}
                {loans.length > 1 && (
                  <div className="flex flex-col gap-0.5 ml-0.5">
                    <button
                      onClick={() => moveUp(i)}
                      disabled={i === 0}
                      className="p-1 rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      onClick={() => moveDown(i)}
                      disabled={i === loans.length - 1}
                      className="p-1 rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown size={12} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Selected loan detail ── */}
      {selectedLoan && <LoanCard key={selectedLoan.id} loan={selectedLoan} />}
    </div>
  )
}

// ── Create loan form ─────────────────────────────────────────────────────────

function CreateLoanForm({
  onCreated,
  onCancel,
}: {
  onCreated: (loan: LoanData) => void
  onCancel: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)

  const inputCls = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40'
  const lbl      = 'block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1'

  const [name, setName]           = useState('')
  const [lender, setLender]       = useState('')
  const [loanType, setLoanType]   = useState('mortgage')
  const [currency, setCurrency]   = useState('USD')
  const [original, setOriginal]   = useState('')
  const [balance, setBalance]     = useState('')
  const [rate, setRate]           = useState('')
  const [insurance, setInsurance] = useState('0')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [payDay, setPayDay]       = useState('5')
  const [notes, setNotes]         = useState('')

  function currentYM() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  function remainingMonths(ed: string) {
    const end = new Date(ed + 'T12:00:00')
    const now = new Date()
    const m   = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
    return Math.max(0, m)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const orig = parseFloat(original)
    const bal  = parseFloat(balance)
    const r    = parseFloat(rate)
    if (!name.trim() || !lender.trim()) { setError('Nombre y entidad son requeridos'); return }
    if (!orig || orig <= 0)             { setError('Monto original inválido'); return }
    if (isNaN(bal) || bal < 0)          { setError('Saldo actual inválido'); return }
    if (!r || r <= 0)                   { setError('Tasa inválida'); return }
    if (!startDate || !endDate)         { setError('Fechas requeridas'); return }

    startTransition(async () => {
      const res = await createLoan({
        name, lender, loan_type: loanType, currency_code: currency,
        original_amount: orig, current_balance: bal,
        interest_rate: r, monthly_insurance: parseFloat(insurance) || 0,
        start_date: startDate, end_date: endDate,
        payment_day: parseInt(payDay) || 5,
        notes: notes || undefined,
      })
      if (res.error) { setError(res.error); return }

      const newLoan: LoanData = {
        id: res.id!,
        name, lender, currencyCode: currency,
        originalAmount: orig, currentBalance: bal,
        interestRate: r, monthlyInsurance: parseFloat(insurance) || 0,
        startDate, endDate, paymentDay: parseInt(payDay) || 5,
        notes: notes || null, sortOrder: 0,
        remainingMonths: remainingMonths(endDate),
        startYearMonth: currentYM(),
        payments: [], rateHistory: [],
      }
      onCreated(newLoan)
    })
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white/[0.03] border border-[#a3e635]/20 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-[0.18em]">Nuevo préstamo</p>
        <button type="button" onClick={onCancel} className="text-zinc-600 hover:text-zinc-300 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className={lbl}>Nombre / Descripción</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Casa Vila del Sendero" className={inputCls} required />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={lbl}>Entidad / Banco</label>
          <input type="text" value={lender} onChange={e => setLender(e.target.value)}
            placeholder="Banco Popular, BAC…" className={inputCls} required />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={lbl}>Tipo</label>
          <select value={loanType} onChange={e => setLoanType(e.target.value)} className={inputCls}>
            <option value="mortgage">Hipoteca</option>
            <option value="auto">Vehículo</option>
            <option value="personal">Personal</option>
            <option value="other">Otro</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Moneda</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
            <option value="USD">USD ($)</option>
            <option value="CRC">CRC (₡)</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Día de pago</label>
          <input type="number" min="1" max="31" value={payDay}
            onChange={e => setPayDay(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={lbl}>Monto original</label>
          <input type="number" min="0" step="any" value={original}
            onChange={e => setOriginal(e.target.value)} placeholder="0" className={inputCls} required />
        </div>
        <div>
          <label className={lbl}>Saldo actual</label>
          <input type="number" min="0" step="any" value={balance}
            onChange={e => setBalance(e.target.value)} placeholder="0" className={inputCls} required />
        </div>
        <div>
          <label className={lbl}>Tasa anual (%)</label>
          <input type="number" min="0" step="0.01" value={rate}
            onChange={e => setRate(e.target.value)} placeholder="6.50" className={inputCls} required />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={lbl}>Seguro mensual</label>
          <input type="number" min="0" step="any" value={insurance}
            onChange={e => setInsurance(e.target.value)} placeholder="0" className={inputCls} />
        </div>
        <div>
          <label className={lbl}>Fecha inicio</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className={lbl}>Fecha fin</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} required />
        </div>
      </div>

      <div>
        <label className={lbl}>Notas <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Garantía, condiciones especiales…" className={inputCls} />
      </div>

      {error && <p className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-white/[0.08] text-zinc-400 text-xs font-black hover:text-zinc-200 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={isPending}
          className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors">
          {isPending ? <><Loader2 size={12} className="animate-spin" /> Guardando…</> : 'Guardar préstamo'}
        </button>
      </div>
    </form>
  )
}

// ── Record payment form ──────────────────────────────────────────────────────

function RecordPaymentForm({
  loan,
  onSaved,
  onCancel,
}: {
  loan: LoanData
  onSaved: (payment: Payment, newBalance: number) => void
  onCancel: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const isUSD = loan.currencyCode === 'USD'
  const fmt   = isUSD ? fmtUSD : (v: number) => fmtCRC(v)

  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)
  const [date, setDate]              = useState(today)
  const [type, setType]              = useState<'normal' | 'extra'>('normal')
  const [amountStr, setAmountStr]    = useState('')
  const [balAfterStr, setBalAfterStr] = useState('')
  const [notes, setNotes]            = useState('')
  const [createLedgerTx, setCreateLedgerTx] = useState(true)
  const [txConcept, setTxConcept]    = useState(`Pago ${type === 'extra' ? 'extra ' : ''}préstamo ${loan.name}`)

  // keep concept in sync with type
  const conceptDefault = `Pago ${type === 'extra' ? 'extra ' : ''}préstamo ${loan.name}`

  const inputCls = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40'
  const lbl      = 'block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1'

  const amount    = parseFloat(amountStr)
  const balAfter  = parseFloat(balAfterStr)
  const balBefore = loan.currentBalance
  const principal = !isNaN(balAfter) ? Math.max(0, balBefore - balAfter) : null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isNaN(amount) || amount <= 0) { setError('Monto inválido'); return }
    if (isNaN(balAfter) || balAfter < 0) { setError('Saldo después inválido'); return }
    if (balAfter > balBefore) { setError(`Saldo después no puede ser mayor al saldo actual (${fmt(balBefore)})`); return }
    setError(null)
    startTransition(async () => {
      // Optionally create the ledger transaction first to get its ID
      let txId: string | undefined
      if (createLedgerTx) {
        const txRes = await createTransaction({
          type: 'gasto',
          date,
          amount,
          vendor: loan.lender,
          concept: txConcept.trim() || conceptDefault,
          expense_group: 'necesario',
          category_code: 'LOAN_PAYMENT',
          currency_code: 'CRC',
          notes: notes.trim() || undefined,
        })
        if (txRes.error) { setError(txRes.error); return }
        txId = txRes.id
      }

      const res = await recordLoanPayment(loan.id, {
        payment_date:   date,
        payment_type:   type,
        amount,
        balance_before: balBefore,
        balance_after:  balAfter,
        rate_applied:   loan.interestRate,
        notes:          notes.trim() || undefined,
        transaction_id: txId,
      })
      if (res.error) { setError(res.error); return }

      const p: Payment = {
        id:             res.id ?? crypto.randomUUID(),
        payment_date:   date,
        payment_type:   type,
        amount,
        principal:      Math.max(0, balBefore - balAfter),
        interest:       Math.max(0, amount - Math.max(0, balBefore - balAfter)),
        insurance:      0,
        balance_before: balBefore,
        balance_after:  balAfter,
        rate_applied:   loan.interestRate,
        notes:          notes.trim() || null,
      }
      onSaved(p, balAfter)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white/[0.03] border border-[#a3e635]/[0.12] p-4 space-y-4">
      <p className="text-[9px] font-black text-[#a3e635]/70 uppercase tracking-[0.14em]">Registrar pago</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Fecha</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className={lbl}>Tipo</label>
          <select value={type} onChange={e => {
            setType(e.target.value as 'normal' | 'extra')
            setTxConcept(`Pago ${e.target.value === 'extra' ? 'extra ' : ''}préstamo ${loan.name}`)
          }} className={inputCls}>
            <option value="normal">Normal</option>
            <option value="extra">Abono extra</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Monto pagado ({isUSD ? 'USD' : 'CRC'})</label>
          <input type="number" min="0" step="any" value={amountStr}
            onChange={e => setAmountStr(e.target.value)}
            placeholder={isUSD ? '838.50' : '593 000'}
            className={inputCls} required />
        </div>
        <div>
          <label className={lbl}>Saldo después del pago</label>
          <input type="number" min="0" step="any" value={balAfterStr}
            onChange={e => setBalAfterStr(e.target.value)}
            placeholder={fmt(balBefore)}
            className={inputCls} required />
          {principal !== null && (
            <p className="text-[9px] text-zinc-600 mt-1">Capital: {fmt(principal)}</p>
          )}
        </div>
      </div>

      <div>
        <label className={lbl}>Saldo actual en sistema</label>
        <p className="text-sm font-black text-zinc-300">{fmt(balBefore)}</p>
        <p className="text-[9px] text-zinc-600">Ingresá el saldo real del estado de cuenta como "saldo después"</p>
      </div>

      {/* Ledger transaction toggle */}
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={createLedgerTx} onChange={e => setCreateLedgerTx(e.target.checked)}
            className="accent-[#a3e635] w-3.5 h-3.5" />
          <span className="text-[10px] font-black text-zinc-300 uppercase tracking-wider">
            Registrar también en ledger de transacciones
          </span>
        </label>
        {createLedgerTx && (
          <div>
            <label className={lbl}>Concepto en ledger</label>
            <input type="text" value={txConcept} onChange={e => setTxConcept(e.target.value)}
              placeholder={conceptDefault} className={inputCls} />
          </div>
        )}
      </div>

      <div>
        <label className={lbl}>Notas <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Pago junio 2026…" className={inputCls} />
      </div>

      {error && <p className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-white/[0.08] text-zinc-400 text-xs font-black hover:text-zinc-200 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={isPending}
          className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors">
          {isPending ? <><Loader2 size={12} className="animate-spin" /> Guardando…</> : 'Registrar'}
        </button>
      </div>
    </form>
  )
}

// ── Per-loan card ────────────────────────────────────────────────────────────

function LoanCard({ loan: initialLoan }: { loan: LoanData }) {
  const [loan, setLoan]         = useState<LoanData>(initialLoan)
  const [tab, setTab]           = useState<'proyeccion' | 'historial' | 'simulador'>('proyeccion')
  const [showAll, setShowAll]   = useState(false)
  const [editingBal, setEditingBal] = useState(false)
  const [newBalStr, setNewBalStr]   = useState('')
  const [balErr, setBalErr]         = useState<string | null>(null)
  const [isPendingBal, startBal]    = useTransition()
  const [showPayForm, setShowPayForm] = useState(false)
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)

  const schedule = computeSchedule(
    loan.currentBalance,
    loan.interestRate,
    loan.remainingMonths,
    loan.monthlyInsurance,
    0,
    loan.startYearMonth,
  )

  const paidPct = Math.min(100,
    ((loan.originalAmount - loan.currentBalance) / loan.originalAmount) * 100,
  )

  const isUSD = loan.currencyCode === 'USD'
  const fmt   = isUSD ? fmtUSD : (v: number) => fmtCRC(v, true)

  const displayRows: ScheduleRow[] = showAll ? schedule.rows : schedule.rows.slice(0, 24)

  const TABS = [
    { id: 'proyeccion' as const, label: 'Proyección' },
    { id: 'historial'  as const, label: 'Historial'  },
    { id: 'simulador'  as const, label: 'Simulador'  },
  ]

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">{loan.lender}</p>
            <p className="text-2xl font-black text-white mt-0.5">{loan.name}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Saldo actual</p>
            <div className="flex items-baseline gap-2 justify-end mt-0.5">
              <p className="text-3xl font-black text-[#a3e635] leading-none">{fmt(loan.currentBalance)}</p>
              <button
                onClick={() => { setEditingBal(v => !v); setNewBalStr(String(loan.currentBalance)); setBalErr(null) }}
                className="text-[9px] text-zinc-600 hover:text-zinc-300 transition-colors font-black uppercase tracking-wider"
              >
                {editingBal ? 'Cancelar' : 'Editar'}
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-0.5">de {fmt(loan.originalAmount)} original</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#a3e635]/50 to-[#a3e635] transition-all duration-700"
              style={{ width: `${paidPct.toFixed(1)}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-zinc-600">
            <span>{paidPct.toFixed(1)}% cancelado</span>
            <span>{(100 - paidPct).toFixed(1)}% pendiente</span>
          </div>
        </div>

        {/* Manual balance correction */}
        {editingBal && (
          <div className="pt-3 border-t border-white/[0.06] space-y-2">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">
              Corregir saldo real
              <span className="text-zinc-700 normal-case tracking-normal font-normal ml-1">
                — usá el saldo exacto del estado de cuenta del banco
              </span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-lg overflow-hidden">
                <span className="pl-3 text-zinc-500 text-sm">{isUSD ? '$' : '₡'}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newBalStr}
                  onChange={e => setNewBalStr(e.target.value)}
                  className="w-40 bg-transparent px-2 py-2 text-sm text-white focus:outline-none"
                  autoFocus
                />
              </div>
              <button
                disabled={isPendingBal || !newBalStr}
                onClick={() => {
                  const val = parseFloat(newBalStr)
                  if (isNaN(val) || val < 0) { setBalErr('Saldo inválido'); return }
                  setBalErr(null)
                  startBal(async () => {
                    const res = await updateLoanBalance(loan.id, val)
                    if (res.error) { setBalErr(res.error); return }
                    setEditingBal(false)
                    // optimistic: page will revalidate
                  })
                }}
                className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors"
              >
                {isPendingBal ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            {balErr && <p className="text-xs text-rose-400">{balErr}</p>}
          </div>
        )}

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile label="Tasa"         value={`${loan.interestRate.toFixed(2)}%`}                                    sub="anual" />
          <Tile label="Cuota base"   value={fmt(schedule.baseMonthlyPayment)}                                      sub="capital + interés" />
          <Tile label="Total mensual" value={fmt(schedule.baseMonthlyPayment + loan.monthlyInsurance)}             sub="incl. seguro" />
          <Tile label="Cancelación"  value={fmtYM(schedule.payoffYearMonth, true)}                                sub={`${schedule.monthsRemaining} meses`} />
        </div>

        {/* Rate history */}
        {loan.rateHistory.length > 0 && (
          <div className="pt-3 border-t border-white/[0.04]">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider mb-2">Historial de tasa</p>
            <div className="flex gap-2 flex-wrap">
              {[...loan.rateHistory].reverse().map((r, i) => (
                <div key={i}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 border ${
                    i === 0
                      ? 'bg-[#a3e635]/[0.06] border-[#a3e635]/20 text-[#a3e635]'
                      : 'bg-white/[0.02] border-white/[0.05] text-zinc-500'
                  }`}>
                  <span className="text-[9px]">{r.effective_date.slice(0, 10)}</span>
                  <span className="text-[10px] font-black">{r.rate.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 bg-white/[0.03] rounded-xl p-0.5 border border-white/[0.05] w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all ${
              tab === t.id ? 'bg-white/[0.10] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Proyección tab */}
      {tab === 'proyeccion' && (
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['#', 'Mes', 'Saldo inicio', 'Interés', 'Capital', 'Seguro', 'Total', 'Saldo fin'].map(h => (
                    <th key={h} className={`px-3 py-2.5 text-[9px] font-black text-zinc-500 uppercase tracking-wider whitespace-nowrap ${
                      h === '#' || h === 'Mes' ? 'text-left' : 'text-right'
                    }`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
                  <tr key={row.month}
                    className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.02] ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                    <td className="px-3 py-1.5 text-[10px] text-zinc-600 tabular-nums">{row.month}</td>
                    <td className="px-3 py-1.5 text-[10px] text-zinc-400 whitespace-nowrap">{fmtYM(row.yearMonth)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-zinc-500 tabular-nums">{fmt(row.balanceStart)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-rose-400/70 tabular-nums">{fmt(row.interest)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-[#a3e635]/70 tabular-nums">{fmt(row.principal)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-zinc-600 tabular-nums">{fmt(row.insurance)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-zinc-300 font-semibold tabular-nums">{fmt(row.totalPayment)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-zinc-500 tabular-nums">{fmt(row.balanceEnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {schedule.rows.length > 24 && (
            <div className="px-4 py-3 border-t border-white/[0.05] flex items-center justify-between">
              <span className="text-[10px] text-zinc-600">
                {schedule.rows.length} cuotas · interés total {fmt(schedule.totalInterest)}
              </span>
              <button onClick={() => setShowAll(v => !v)}
                className="text-[10px] text-[#a3e635]/70 hover:text-[#a3e635] transition-colors font-black">
                {showAll ? 'Mostrar menos ↑' : `Ver todas (${schedule.rows.length}) ↓`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Historial tab */}
      {tab === 'historial' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">
              {loan.payments.length} pago{loan.payments.length !== 1 ? 's' : ''} registrado{loan.payments.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => setShowPayForm(v => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#a3e635]/10 border border-[#a3e635]/20 text-[#a3e635] text-[10px] font-black hover:bg-[#a3e635]/20 transition-colors"
            >
              <Plus size={11} strokeWidth={3} />
              Registrar pago
            </button>
          </div>

          {showPayForm && (
            <RecordPaymentForm
              loan={loan}
              onSaved={(payment, newBalance) => {
                setLoan(prev => ({
                  ...prev,
                  currentBalance: newBalance,
                  payments: [payment, ...prev.payments],
                }))
                setShowPayForm(false)
              }}
              onCancel={() => setShowPayForm(false)}
            />
          )}

        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
          {loan.payments.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-8">Sin pagos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Fecha', 'Tipo', 'Saldo antes', 'Cancelado', 'Capital', 'Saldo después', 'Tasa', ''].map(h => (
                      <th key={h} className={`px-3 py-2.5 text-[9px] font-black text-zinc-500 uppercase tracking-wider whitespace-nowrap ${
                        h === 'Fecha' || h === 'Tipo' || h === '' ? 'text-left' : 'text-right'
                      }`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loan.payments.map((p, i) => {
                    const col = PAYMENT_COLOR[p.payment_type] ?? '#818cf8'
                    const isEditing = editingPaymentId === p.id
                    return isEditing ? (
                      <tr key={p.id + '-edit'} className="border-b border-[#a3e635]/10">
                        <td colSpan={8} className="px-2 py-2">
                          <EditPaymentForm
                            payment={p}
                            loan={loan}
                            isFirst={i === 0}
                            onSaved={(updated, newLoanBalance) => {
                              setLoan(prev => ({
                                ...prev,
                                currentBalance: newLoanBalance ?? prev.currentBalance,
                                payments: prev.payments.map(x => x.id === updated.id ? updated : x),
                              }))
                              setEditingPaymentId(null)
                            }}
                            onCancel={() => setEditingPaymentId(null)}
                          />
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id}
                        className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.02] ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                        <td className="px-3 py-2 text-[10px] text-zinc-400 whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                        <td className="px-3 py-2">
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap"
                            style={{ color: col, backgroundColor: col + '1a' }}>
                            {paymentLabel(p.payment_type)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-right text-zinc-500 tabular-nums">{fmt(p.balance_before)}</td>
                        <td className="px-3 py-2 text-[10px] text-right text-zinc-300 font-semibold tabular-nums">{fmt(p.amount)}</td>
                        <td className="px-3 py-2 text-[10px] text-right text-[#a3e635]/70 tabular-nums">{fmt(p.balance_before - p.balance_after)}</td>
                        <td className="px-3 py-2 text-[10px] text-right text-zinc-500 tabular-nums">{fmt(p.balance_after)}</td>
                        <td className="px-3 py-2 text-[10px] text-right text-zinc-600 tabular-nums">{p.rate_applied.toFixed(2)}%</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setEditingPaymentId(p.id)}
                            className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
                            title="Editar pago"
                          >
                            <Pencil size={12} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Simulador tab */}
      {tab === 'simulador' && <SimuladorTab loan={loan} schedule={schedule} />}
    </div>
  )
}

// ── Edit payment inline form ─────────────────────────────────────────────────

function EditPaymentForm({
  payment,
  loan,
  isFirst,
  onSaved,
  onCancel,
}: {
  payment: Payment
  loan: LoanData
  isFirst: boolean
  onSaved: (updated: Payment, newLoanBalance?: number) => void
  onCancel: () => void
}) {
  const isUSD = loan.currencyCode === 'USD'
  const fmt   = isUSD ? fmtUSD : (v: number) => fmtCRC(v)

  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)
  const [date,     setDate]          = useState(payment.payment_date.slice(0, 10))
  const [type,     setType]          = useState<'normal' | 'extra' | 'partial'>(
    payment.payment_type as 'normal' | 'extra' | 'partial',
  )
  const [amountStr,   setAmountStr]   = useState(String(payment.amount))
  const [balBefStr,   setBalBefStr]   = useState(String(payment.balance_before))
  const [balAftStr,   setBalAftStr]   = useState(String(payment.balance_after))
  const [rateStr,     setRateStr]     = useState(String(payment.rate_applied))
  const [notes,       setNotes]       = useState(payment.notes ?? '')

  const inputCls = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40'
  const lbl      = 'block text-[9px] font-black text-zinc-500 uppercase tracking-[0.12em] mb-1'

  const amount   = parseFloat(amountStr)
  const balBef   = parseFloat(balBefStr)
  const balAft   = parseFloat(balAftStr)
  const rate     = parseFloat(rateStr)
  const principal = !isNaN(balBef) && !isNaN(balAft) ? Math.max(0, balBef - balAft) : null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (isNaN(amount) || amount <= 0)    { setError('Monto inválido'); return }
    if (isNaN(balBef) || balBef < 0)     { setError('Saldo antes inválido'); return }
    if (isNaN(balAft) || balAft < 0)     { setError('Saldo después inválido'); return }
    if (isNaN(rate)   || rate <= 0)      { setError('Tasa inválida'); return }
    setError(null)

    startTransition(async () => {
      const res = await updateLoanPayment(
        payment.id,
        {
          payment_date: date,
          payment_type: type,
          amount,
          balance_before: balBef,
          balance_after:  balAft,
          rate_applied:   rate,
          notes: notes.trim() || undefined,
        },
        isFirst ? balAft : undefined,
      )
      if (res.error) { setError(res.error); return }

      const updated: Payment = {
        ...payment,
        payment_date:   date,
        payment_type:   type,
        amount,
        principal:      Math.max(0, balBef - balAft),
        interest:       Math.max(0, amount - Math.max(0, balBef - balAft)),
        balance_before: balBef,
        balance_after:  balAft,
        rate_applied:   rate,
        notes:          notes.trim() || null,
      }
      onSaved(updated, isFirst ? balAft : undefined)
    })
  }

  return (
    <form onSubmit={submit} className="rounded-xl bg-[#a3e635]/[0.03] border border-[#a3e635]/10 p-3 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className={lbl}>Fecha</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className={lbl}>Tipo</label>
          <select value={type} onChange={e => setType(e.target.value as typeof type)} className={inputCls}>
            <option value="normal">Normal</option>
            <option value="extra">Abono extra</option>
            <option value="partial">Parcial</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Monto ({isUSD ? 'USD' : 'CRC'})</label>
          <input type="number" min="0" step="any" value={amountStr}
            onChange={e => setAmountStr(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className={lbl}>Tasa anual (%)</label>
          <input type="number" min="0" step="0.01" value={rateStr}
            onChange={e => setRateStr(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className={lbl}>Saldo antes</label>
          <input type="number" min="0" step="any" value={balBefStr}
            onChange={e => setBalBefStr(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className={lbl}>Saldo después</label>
          <input type="number" min="0" step="any" value={balAftStr}
            onChange={e => setBalAftStr(e.target.value)} className={inputCls} required />
          {principal !== null && (
            <p className="text-[9px] text-zinc-600 mt-0.5">Capital: {fmt(principal)}</p>
          )}
        </div>
        <div className="col-span-2">
          <label className={lbl}>Notas</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="(opcional)" className={inputCls} />
        </div>
      </div>

      {isFirst && (
        <p className="text-[9px] text-zinc-600">
          Al guardar, el saldo actual del préstamo se actualizará al nuevo "saldo después".
        </p>
      )}

      {error && <p className="text-[10px] text-rose-400 bg-rose-400/10 rounded px-2 py-1">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-zinc-400 text-[10px] font-black hover:text-zinc-200 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={isPending}
          className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-[#a3e635] text-black text-[10px] font-black hover:bg-[#b4f040] disabled:opacity-50 transition-colors">
          {isPending ? <><Loader2 size={10} className="animate-spin" /> Guardando…</> : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.05] px-3 py-2.5">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-black text-zinc-200 leading-tight">{value}</p>
      <p className="text-[9px] text-zinc-600 mt-0.5">{sub}</p>
    </div>
  )
}

// ── Simulador ────────────────────────────────────────────────────────────────

function AmountPicker({
  label, hint, presets, value, inputVal, fmt,
  onPick, onInput, onClear,
}: {
  label: string
  hint: string
  presets: number[]
  value: number
  inputVal: string
  fmt: (v: number) => string
  onPick: (p: number) => void
  onInput: (raw: string) => void
  onClear: () => void
}) {
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-wider">{label}</p>
        <p className="text-[9px] text-zinc-600 mt-0.5">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {presets.map(p => (
          <button key={p} onClick={() => onPick(p)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border ${
              value === p
                ? 'bg-[#a3e635]/20 text-[#a3e635] border-[#a3e635]/30'
                : 'bg-white/[0.04] text-zinc-400 border-white/[0.06] hover:text-zinc-200'
            }`}>
            {fmt(p)}
          </button>
        ))}
        <input
          type="number"
          value={inputVal}
          onChange={e => onInput(e.target.value)}
          placeholder="Otro"
          className="w-28 bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
        />
        {value > 0 && (
          <button onClick={onClear} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
            Limpiar
          </button>
        )}
      </div>
    </div>
  )
}

function SimuladorTab({ loan, schedule }: { loan: LoanData; schedule: AmortizationResult }) {
  const [lumpSum,    setLumpSum]    = useState(0)
  const [lumpInput,  setLumpInput]  = useState('')
  const [extra,      setExtra]      = useState(0)
  const [extraInput, setExtraInput] = useState('')
  const [keepPayment, setKeepPayment] = useState(false)

  const isUSD = loan.currencyCode === 'USD'
  const fmt   = isUSD ? fmtUSD : (v: number) => fmtCRC(v)

  const MONTHLY_PRESETS = isUSD ? [100, 250, 500, 1_000]        : [100_000, 250_000, 500_000, 1_000_000]
  const LUMP_PRESETS    = isUSD ? [1_000, 2_500, 5_000, 10_000] : [1_000_000, 2_500_000, 5_000_000, 10_000_000]

  const hasAny = lumpSum > 0 || extra > 0

  const sim = hasAny
    ? simulateCombined(
        loan.currentBalance, loan.interestRate, loan.remainingMonths,
        loan.monthlyInsurance, lumpSum, extra, keepPayment, loan.startYearMonth,
      )
    : null

  // Build scenario label for comparativa
  const scenarioLabel = [
    lumpSum > 0 && `único ${fmt(lumpSum)}${keepPayment ? ' + misma cuota' : ''}`,
    extra   > 0 && `+${fmt(extra)}/mes`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-5 space-y-5">

      {/* Two pickers side by side on sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
        <AmountPicker
          label="Abono único hoy"
          hint="Se aplica al saldo de inmediato"
          presets={LUMP_PRESETS}
          value={lumpSum}
          inputVal={lumpInput}
          fmt={fmt}
          onPick={p  => { setLumpSum(p);  setLumpInput(String(p)) }}
          onInput={s => { setLumpInput(s); setLumpSum(Number(s) || 0) }}
          onClear={() => { setLumpSum(0);  setLumpInput('') }}
        />
        <AmountPicker
          label="Extra mensual"
          hint="Se suma a la cuota todos los meses"
          presets={MONTHLY_PRESETS}
          value={extra}
          inputVal={extraInput}
          fmt={fmt}
          onPick={p  => { setExtra(p);  setExtraInput(String(p)) }}
          onInput={s => { setExtraInput(s); setExtra(Number(s) || 0) }}
          onClear={() => { setExtra(0);  setExtraInput('') }}
        />
      </div>

      {/* Keep-payment toggle — only meaningful when there's a lump sum */}
      {lumpSum > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-0.5 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
            {([
              { val: false, label: 'Reducir cuota' },
              { val: true,  label: 'Mantener cuota' },
            ] as const).map(opt => (
              <button key={String(opt.val)} onClick={() => setKeepPayment(opt.val)}
                className={`px-3 py-1 rounded-md text-[10px] font-black tracking-wider transition-all ${
                  keepPayment === opt.val ? 'bg-white/[0.10] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-zinc-600">
            {keepPayment
              ? 'Después del abono único seguís pagando la misma cuota → menor plazo'
              : 'El abono único reduce el saldo → cuota menor, plazo igual'}
          </p>
        </div>
      )}

      {sim ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SimTile label="Meses ahorrados"   value={String(sim.monthsSaved)}             highlight />
            <SimTile label="Años ahorrados"    value={sim.yearsSaved.toFixed(1)}           />
            <SimTile label="Interés ahorrado"  value={fmt(sim.interestSaved)}              />
            <SimTile label="Nueva cancelación" value={fmtYM(sim.newPayoffYearMonth, true)} />
          </div>

          <div className="p-4 rounded-xl bg-[#a3e635]/[0.04] border border-[#a3e635]/[0.12] space-y-3">
            <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-wider">Comparativa</p>
            <div className="grid grid-cols-2 gap-4 text-[11px]">
              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider">Sin abono</p>
                <Row k="Cancela en"      v={fmtYM(schedule.payoffYearMonth, true)}                    />
                <Row k="Cuota mensual"   v={fmt(schedule.baseMonthlyPayment + loan.monthlyInsurance)} />
                <Row k="Total intereses" v={fmt(schedule.totalInterest)}                              />
              </div>
              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-wider truncate" title={scenarioLabel}>
                  {scenarioLabel}
                </p>
                <Row k="Cancela en"      v={fmtYM(sim.newPayoffYearMonth, true)}             accent />
                <Row k="Cuota mensual"   v={fmt(sim.newMonthlyTotal)}                        accent />
                <Row k="Total intereses" v={fmt(schedule.totalInterest - sim.interestSaved)} accent />
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-zinc-600 text-center py-6">
          Ingresá un abono único, un extra mensual, o ambos para ver la proyección.
        </p>
      )}
    </div>
  )
}

function SimTile({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.05] px-3 py-2.5">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-black leading-tight ${highlight ? 'text-[#a3e635]' : 'text-zinc-200'}`}>{value}</p>
    </div>
  )
}

function Row({ k, v, accent = false }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-zinc-500 text-[10px]">{k}</span>
      <span className={`font-black text-[11px] ${accent ? 'text-[#a3e635]' : 'text-zinc-300'}`}>{v}</span>
    </div>
  )
}
