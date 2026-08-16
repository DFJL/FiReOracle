'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import type { Envelope } from './page'
import type { SelfLoan } from './page'
import {
  createSelfLoan, recordSelfLoanPayment, updateLoanSources,
  getSelfLoanHistory, updateSelfLoanPayment, deleteSelfLoanPayment, deleteSelfLoan,
} from '@/app/actions/selfLoans'
import type { SelfLoanPayment } from '@/app/actions/selfLoans'

function fmtCRC(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(2)}M`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

type SourceRow = { envelope_id: string; amount: string }

function SourceRows({
  rows,
  envelopes,
  onChange,
}: {
  rows: SourceRow[]
  envelopes: Envelope[]
  onChange: (rows: SourceRow[]) => void
}) {
  function updateRow(i: number, field: keyof SourceRow, value: string) {
    onChange(rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function addRow() {
    onChange([...rows, { envelope_id: '', amount: '' }])
  }

  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
          <select
            value={row.envelope_id}
            onChange={e => updateRow(i, 'envelope_id', e.target.value)}
            className="bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40"
          >
            <option value="">— sobre —</option>
            {envelopes.map(e => (
              <option key={e.id} value={e.id}>{e.name} ({e.custodio})</option>
            ))}
          </select>
          <input
            type="number"
            value={row.amount}
            onChange={e => updateRow(i, 'amount', e.target.value)}
            placeholder="0"
            className="w-28 bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
          />
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-zinc-600 hover:text-rose-400 text-xs w-5 text-center"
            >
              ✕
            </button>
          ) : (
            <span className="w-5" />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.14em] hover:text-[#a3e635]/80 transition-colors"
      >
        + Agregar sobre
      </button>
    </div>
  )
}

function computedTotal(rows: SourceRow[]): number {
  return rows.reduce((s, r) => {
    const v = parseFloat(r.amount.replace(/,/g, ''))
    return s + (isNaN(v) || v <= 0 ? 0 : v)
  }, 0)
}

function toValidSources(rows: SourceRow[]): { envelope_id: string; amount: number }[] {
  return rows
    .filter(r => r.envelope_id && r.amount && parseFloat(r.amount.replace(/,/g, '')) > 0)
    .map(r => ({ envelope_id: r.envelope_id, amount: parseFloat(r.amount.replace(/,/g, '')) }))
}

function NewLoanForm({ envelopes, onClose }: { envelopes: Envelope[]; onClose: () => void }) {
  const [description, setDescription]       = useState('')
  const [date, setDate]                     = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]                   = useState('')
  const [error, setError]                   = useState('')
  const [isPending, start]                  = useTransition()
  const [rows, setRows]                     = useState<SourceRow[]>([{ envelope_id: '', amount: '' }])
  const [fallbackAmount, setFallbackAmount] = useState('')

  const total = computedTotal(rows)
  const hasSourceAmounts = total > 0

  function submit() {
    if (!description.trim()) { setError('Descripción requerida'); return }
    const srcs = toValidSources(rows)
    const amt = hasSourceAmounts ? total : parseFloat(fallbackAmount.replace(/,/g, ''))
    if (!amt || amt <= 0) { setError('Monto inválido'); return }
    setError('')
    start(async () => {
      const res = await createSelfLoan({
        description: description.trim(),
        original_amount: amt,
        loan_date: date,
        sources: srcs,
        notes,
      })
      if (res?.error) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Nuevo autopréstamo</p>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-xs">✕</button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Rubro / descripción</p>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="ej. Celular Sita"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
          />
        </div>

        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Fecha</p>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40"
          />
        </div>

        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-2">Fuentes (sobres)</p>
          <SourceRows rows={rows} envelopes={envelopes} onChange={setRows} />
        </div>

        {hasSourceAmounts ? (
          <div className="flex items-center gap-2">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Total calculado</p>
            <p className="text-sm font-black text-[#a3e635]">{fmtCRC(total)}</p>
          </div>
        ) : (
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Monto ₡ (sin sobre vinculado)</p>
            <input
              type="number"
              value={fallbackAmount}
              onChange={e => setFallbackAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
            />
          </div>
        )}

        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Notas (opcional)</p>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="..."
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
          />
        </div>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50"
        >
          {isPending ? '...' : 'Registrar'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function EditSourcesPanel({
  loan,
  envelopes,
  onClose,
}: {
  loan: SelfLoan
  envelopes: Envelope[]
  onClose: () => void
}) {
  const initialRows: SourceRow[] = loan.envelope_split
    ? loan.envelope_split.map(s => ({ envelope_id: s.envelope_id, amount: String(s.amount) }))
    : loan.source_envelope_id
      ? [{ envelope_id: loan.source_envelope_id, amount: String(loan.original_amount) }]
      : [{ envelope_id: '', amount: '' }]

  const [rows, setRows]    = useState<SourceRow[]>(initialRows)
  const [error, setError]  = useState('')
  const [isPending, start] = useTransition()

  function save() {
    const srcs = toValidSources(rows)
    if (srcs.length === 0) { setError('Al menos un sobre con monto requerido'); return }
    setError('')
    start(async () => {
      const res = await updateLoanSources(loan.id, srcs)
      if (res?.error) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <div className="mx-4 mb-2 mt-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Editar fuentes</p>
        <p className="text-[9px] text-zinc-600 text-right">No crea movimientos nuevos — solo actualiza el rastreo de qué sobre aporta qué</p>
      </div>
      <SourceRows rows={rows} envelopes={envelopes} onChange={setRows} />
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50"
        >
          {isPending ? '...' : 'Guardar'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function PaymentPanel({ loan, envelopes, onClose }: { loan: SelfLoan; envelopes: Envelope[]; onClose: () => void }) {
  const [amount, setAmount]           = useState('')
  const [date, setDate]               = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]             = useState('')
  // No default here on purpose: the loan's own origin envelope(s) already get
  // credited back via envelope_split — defaulting this to the same envelope
  // silently debits the wrong pot instead of where the repayment cash came from.
  const [fromEnvelopeId, setFromEnvelopeId] = useState('')
  const [showFromWarning, setShowFromWarning] = useState(false)
  const [fromWarningAcked, setFromWarningAcked] = useState(false)
  const [error, setError]   = useState('')
  const [isPending, start]  = useTransition()
  const fromSelectRef = useRef<HTMLSelectElement>(null)

  function needsFromConfirmation() {
    return !fromEnvelopeId && !fromWarningAcked
  }

  const remaining = loan.original_amount - loan.amount_repaid

  const previewPortions: { name: string; portion: number }[] = (() => {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!amt || amt <= 0) return []
    if (loan.envelope_split && loan.envelope_split.length > 0) {
      const totalSplit = loan.envelope_split.reduce((s, e) => s + e.amount, 0)
      if (totalSplit <= 0) return []
      let credited = 0
      return loan.envelope_split.map((e, i) => {
        const isLast = i === loan.envelope_split!.length - 1
        const portion = isLast
          ? amt - credited
          : Math.round((e.amount / totalSplit) * amt)
        credited += portion
        return { name: e.name, portion }
      })
    }
    if (loan.source_envelope_name) {
      return [{ name: loan.source_envelope_name, portion: amt }]
    }
    return []
  })()

  function submit() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!amt || amt <= 0)       { setError('Monto inválido'); return }
    if (amt > remaining + 0.01) { setError(`Máximo ₡${Math.round(remaining).toLocaleString('es-CR')}`); return }
    if (needsFromConfirmation()) { setShowFromWarning(true); return }
    setError('')
    start(async () => {
      const res = await recordSelfLoanPayment(loan.id, {
        amount: amt,
        date,
        notes,
        from_envelope_id: fromEnvelopeId || undefined,
      })
      if (res?.error) { setError(res.error); return }
      onClose()
    })
  }

  function settle() {
    if (needsFromConfirmation()) { setShowFromWarning(true); return }
    setError('')
    start(async () => {
      const res = await recordSelfLoanPayment(loan.id, {
        amount: remaining,
        date,
        notes: notes || 'Saldo total cancelado',
        from_envelope_id: fromEnvelopeId || undefined,
      })
      if (res?.error) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <div className="mx-4 mb-2 mt-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] p-4 space-y-3">
      <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">
        Registrar abono · saldo {fmtCRC(remaining)}
      </p>

      {previewPortions.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em] mb-1">Distribución del abono</p>
          {previewPortions.map((p, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">{p.name}</span>
              <span className="text-[10px] tabular-nums text-[#a3e635]/70">{fmtCRC(p.portion)}</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">¿De dónde sale esta plata? Sobre a debitar</p>
        <select
          ref={fromSelectRef}
          value={fromEnvelopeId}
          onChange={e => setFromEnvelopeId(e.target.value)}
          className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40"
        >
          <option value="">— seleccioná un sobre —</option>
          {envelopes.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {showFromWarning && !fromEnvelopeId && (
        <div className="rounded-lg border border-blue-400/20 bg-blue-400/5 p-2.5 space-y-2">
          <p className="text-[11px] text-blue-300/90 leading-snug">
            Si no elegís de qué sobre sale esta plata, el abono se acredita a {loan.envelope_split && loan.envelope_split.length > 1 ? 'los sobres de origen' : 'el sobre de origen'} pero no se debita de ningún lado — el saldo va a quedar inflado.
          </p>
          <div className="flex gap-2">
            <button type="button"
              onClick={() => { fromSelectRef.current?.focus() }}
              className="flex-1 py-1.5 rounded-lg bg-blue-400/15 text-blue-300 text-[11px] font-bold hover:bg-blue-400/25 transition-colors">
              Elegir sobre
            </button>
            <button type="button"
              onClick={() => { setFromWarningAcked(true); setShowFromWarning(false) }}
              className="flex-1 py-1.5 rounded-lg bg-white/[0.06] text-zinc-300 text-[11px] font-bold hover:bg-white/[0.10] transition-colors">
              Fue efectivo / externo
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Monto ₡</p>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
          />
        </div>
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Fecha</p>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40"
          />
        </div>
        <div className="col-span-2">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Notas (opcional)</p>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="..."
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
          />
        </div>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={submit}
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50"
        >
          {isPending ? '...' : 'Abonar'}
        </button>
        <button
          onClick={settle}
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold disabled:opacity-50 hover:bg-rose-500/30 transition-colors"
        >
          {isPending ? '...' : `Saldar · ₡${Math.round(remaining).toLocaleString('es-CR')}`}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── History panel ─────────────────────────────────────────────────────────────

function EditPaymentForm({
  payment,
  loanId,
  envelopes,
  onDone,
}: {
  payment: SelfLoanPayment
  loanId: string
  envelopes: Envelope[]
  onDone: () => void
}) {
  const [amount, setAmount]         = useState(String(payment.amount))
  const [date, setDate]             = useState(payment.payment_date)
  const [notes, setNotes]           = useState(payment.notes ?? '')
  const [fromId, setFromId]         = useState(payment.from_envelope_id ?? '')
  const [error, setError]           = useState('')
  const [isPending, start]          = useTransition()
  const [showFromWarning, setShowFromWarning] = useState(false)
  const [fromWarningAcked, setFromWarningAcked] = useState(false)

  function save() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!amt || amt <= 0) { setError('Monto inválido'); return }
    if (!fromId && !fromWarningAcked) { setShowFromWarning(true); return }
    setError('')
    start(async () => {
      const res = await updateSelfLoanPayment(payment.id, loanId, {
        amount: amt, date, notes, from_envelope_id: fromId || undefined,
      })
      if (res?.error) { setError(res.error); return }
      onDone()
    })
  }

  const lbl = 'text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1'
  const inp = 'w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40'

  return (
    <div className="mt-2 space-y-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className={lbl}>Monto ₡</p>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={inp} />
        </div>
        <div>
          <p className={lbl}>Fecha</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
        </div>
        <div className="col-span-2">
          <p className={lbl}>Notas</p>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="..." className={inp} />
        </div>
        <div className="col-span-2">
          <p className={lbl}>¿De dónde sale esta plata? Sobre debitado</p>
          <select value={fromId} onChange={e => setFromId(e.target.value)} className={inp}>
            <option value="">— seleccioná un sobre —</option>
            {envelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>
      {showFromWarning && !fromId && (
        <div className="rounded-lg border border-blue-400/20 bg-blue-400/5 p-2.5 space-y-2">
          <p className="text-[11px] text-blue-300/90 leading-snug">
            Sin sobre elegido, este abono se acredita al sobre de origen pero no se debita de ningún lado.
          </p>
          <button type="button"
            onClick={() => { setFromWarningAcked(true); setShowFromWarning(false) }}
            className="w-full py-1.5 rounded-lg bg-white/[0.06] text-zinc-300 text-[11px] font-bold hover:bg-white/[0.10] transition-colors">
            Fue efectivo / externo
          </button>
        </div>
      )}
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={isPending}
          className="px-3 py-1.5 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50">
          {isPending ? '...' : 'Guardar'}
        </button>
        <button onClick={onDone}
          className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-zinc-400 text-xs">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function HistoryPanel({
  loan,
  envelopes,
  onNewPayment,
}: {
  loan: SelfLoan
  envelopes: Envelope[]
  onNewPayment: () => void
}) {
  const [payments, setPayments]   = useState<SelfLoanPayment[]>([])
  const [loading, setLoading]     = useState(true)
  const [editId, setEditId]       = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError]         = useState('')
  const [, startDel]              = useTransition()

  useEffect(() => {
    getSelfLoanHistory(loan.id).then(p => { setPayments(p); setLoading(false) })
  }, [loan.id])

  function handleDelete(p: SelfLoanPayment) {
    if (!window.confirm(`¿Eliminar abono de ${fmtCRC(p.amount)} del ${p.payment_date}? Se revertirán los movimientos de sobre asociados.`)) return
    setDeletingId(p.id)
    setError('')
    startDel(async () => {
      const res = await deleteSelfLoanPayment(p.id, loan.id)
      if (res?.error) { setError(res.error); setDeletingId(null); return }
      setPayments(prev => prev.filter(x => x.id !== p.id))
      setDeletingId(null)
    })
  }

  const envelopeNameById = Object.fromEntries(envelopes.map(e => [e.id, e.name]))

  return (
    <div className="mx-4 mb-2 mt-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Historial de abonos</p>
        <button
          onClick={onNewPayment}
          className="text-[9px] font-black text-[#a3e635]/70 uppercase tracking-[0.14em] hover:text-[#a3e635] transition-colors"
        >
          + Nuevo abono
        </button>
      </div>

      {loading && <p className="text-[10px] text-zinc-600">Cargando…</p>}

      {!loading && payments.length === 0 && (
        <p className="text-[10px] text-zinc-600">Sin abonos registrados.</p>
      )}

      {!loading && payments.length > 0 && (
        <div className="space-y-1">
          {payments.map(p => (
            <div key={p.id}>
              <div className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <p className="text-xs tabular-nums text-zinc-200 font-semibold">{fmtCRC(p.amount)}</p>
                  <p className="text-[9px] text-zinc-600">
                    {new Date(p.payment_date + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {p.from_envelope_id && envelopeNameById[p.from_envelope_id] && (
                      <span className="ml-1.5 text-zinc-700">· {envelopeNameById[p.from_envelope_id]}</span>
                    )}
                    {p.notes && <span className="ml-1.5 text-zinc-700">· {p.notes}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditId(editId === p.id ? null : p.id)}
                    className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.12em] hover:text-[#a3e635]/70 transition-colors"
                  >
                    {editId === p.id ? 'Cerrar' : 'Editar'}
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    disabled={deletingId === p.id}
                    className="text-[9px] font-black text-zinc-700 uppercase tracking-[0.12em] hover:text-rose-400 transition-colors disabled:opacity-40"
                  >
                    {deletingId === p.id ? '…' : 'Borrar'}
                  </button>
                </div>
              </div>
              {editId === p.id && (
                <EditPaymentForm
                  payment={p}
                  loanId={loan.id}
                  envelopes={envelopes}
                  onDone={() => {
                    setEditId(null)
                    getSelfLoanHistory(loan.id).then(setPayments)
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}

type ActivePanel = { type: 'history' } | { type: 'payment' } | { type: 'edit-sources' }

export function SelfLoansSection({ loans, envelopes }: { loans: SelfLoan[]; envelopes: Envelope[] }) {
  const [showNew, setShowNew]       = useState(false)
  const [openId, setOpenId]         = useState<string | null>(null)
  const [openPanel, setOpenPanel]   = useState<ActivePanel | null>(null)
  const [showPaid, setShowPaid]     = useState(false)
  const [deletingLoanId, setDeletingLoanId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [, startDeleteLoan]         = useTransition()

  function handleDeleteLoan(loan: SelfLoan) {
    if (!window.confirm(`¿Eliminar el autopréstamo "${loan.description}" (${fmtCRC(loan.original_amount)})? Se revertirán todos los movimientos de sobre asociados, incluyendo abonos ya registrados. Esto no se puede deshacer.`)) return
    setDeletingLoanId(loan.id)
    setDeleteError('')
    startDeleteLoan(async () => {
      const res = await deleteSelfLoan(loan.id)
      if (res?.error) { setDeleteError(res.error); setDeletingLoanId(null); return }
      setDeletingLoanId(null)
      closePanel()
    })
  }

  const active       = loans.filter(l => l.status !== 'paid')
  const paid         = loans.filter(l => l.status === 'paid')
  const totalBalance = active.reduce((s, l) => s + (l.original_amount - l.amount_repaid), 0)

  function toggleLoan(id: string) {
    if (openId === id) {
      setOpenId(null)
      setOpenPanel(null)
    } else {
      setOpenId(id)
      setOpenPanel({ type: 'history' })
    }
  }

  function openEditSources(id: string) {
    setOpenId(id)
    setOpenPanel({ type: 'edit-sources' })
  }

  function closePanel() {
    setOpenId(null)
    setOpenPanel(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Autopréstamos</p>
          <p className="text-xl font-black text-white mt-0.5">
            {fmtCRC(totalBalance)}
            <span className="text-sm font-normal text-zinc-500 ml-2">saldo pendiente</span>
          </p>
        </div>
        {!showNew && (
          <button
            onClick={() => setShowNew(true)}
            className="px-3 py-1.5 rounded-lg bg-[#a3e635]/10 text-[#a3e635] text-[10px] font-black hover:bg-[#a3e635]/20 transition-all"
          >
            + Préstamo
          </button>
        )}
      </div>

      {showNew && <NewLoanForm envelopes={envelopes} onClose={() => setShowNew(false)} />}

      {active.length > 0 && (
        <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-2 border-b border-white/[0.04]">
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider">Rubro</p>
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider text-right">Monto</p>
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider text-right">Cancelado</p>
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider text-right">Saldo</p>
            <p className="w-3" />
          </div>

          {active.map((loan, i) => {
            const balance  = loan.original_amount - loan.amount_repaid
            const pct      = loan.original_amount > 0 ? (loan.amount_repaid / loan.original_amount) * 100 : 0
            const isOpen   = openId === loan.id
            const srcLabel = loan.envelope_split && loan.envelope_split.length > 0
              ? loan.envelope_split.map(s => s.name).join(', ')
              : loan.source_envelope_name ?? null

            return (
              <div key={loan.id} className={i > 0 ? 'border-t border-white/[0.03]' : ''}>
                <button
                  onClick={() => toggleLoan(loan.id)}
                  className={`w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-4 py-2.5 text-left transition-colors ${
                    isOpen ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{loan.description}</p>
                    {srcLabel && (
                      <p className="text-[9px] text-zinc-600 truncate">{srcLabel}</p>
                    )}
                    {loan.linked_transaction && (
                      <p className="text-[9px] text-[#a3e635]/50 truncate">
                        ↳ {loan.linked_transaction.concept || loan.linked_transaction.vendor || 'tx vinculada'}
                      </p>
                    )}
                    <div className="mt-1 h-1 bg-white/[0.04] rounded-full overflow-hidden w-24">
                      <div className="h-full rounded-full bg-[#a3e635]" style={{ width: `${pct}%`, opacity: 0.6 }} />
                    </div>
                  </div>
                  <span className="text-[10px] tabular-nums text-zinc-500 text-right">{fmtCRC(loan.original_amount)}</span>
                  <span className="text-[10px] tabular-nums text-[#a3e635]/70 text-right">{fmtCRC(loan.amount_repaid)}</span>
                  <span className={`text-xs font-black tabular-nums text-right ${balance > 0 ? 'text-rose-400' : 'text-[#a3e635]'}`}>
                    {fmtCRC(balance)}
                  </span>
                  <span className="text-zinc-600 text-[10px] w-3 text-center">{isOpen ? '−' : '+'}</span>
                </button>

                {isOpen && openPanel?.type === 'history' && (
                  <div>
                    <div className="px-4 pb-1 flex items-center gap-3">
                      <button
                        onClick={e => { e.stopPropagation(); openEditSources(loan.id) }}
                        className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] hover:text-[#a3e635]/70 transition-colors"
                      >
                        Editar fuentes
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteLoan(loan) }}
                        disabled={deletingLoanId === loan.id}
                        className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em] hover:text-rose-400 transition-colors disabled:opacity-40"
                      >
                        {deletingLoanId === loan.id ? 'Borrando…' : 'Borrar autopréstamo'}
                      </button>
                    </div>
                    {deleteError && <p className="px-4 pb-2 text-[10px] text-rose-400">{deleteError}</p>}
                    <HistoryPanel
                      loan={loan}
                      envelopes={envelopes}
                      onNewPayment={() => { setOpenId(loan.id); setOpenPanel({ type: 'payment' }) }}
                    />
                  </div>
                )}

                {isOpen && openPanel?.type === 'payment' && (
                  <div>
                    <div className="px-4 pb-1 flex items-center gap-3">
                      <button
                        onClick={e => { e.stopPropagation(); setOpenPanel({ type: 'history' }) }}
                        className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] hover:text-[#a3e635]/70 transition-colors"
                      >
                        ← Historial
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); openEditSources(loan.id) }}
                        className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] hover:text-[#a3e635]/70 transition-colors"
                      >
                        Editar fuentes
                      </button>
                    </div>
                    <PaymentPanel loan={loan} envelopes={envelopes} onClose={() => setOpenPanel({ type: 'history' })} />
                  </div>
                )}

                {isOpen && openPanel?.type === 'edit-sources' && (
                  <EditSourcesPanel loan={loan} envelopes={envelopes} onClose={closePanel} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {loans.length === 0 && !showNew && (
        <p className="text-xs text-zinc-600 text-center py-4">Sin autopréstamos registrados.</p>
      )}

      {paid.length > 0 && (
        <button
          onClick={() => setShowPaid(v => !v)}
          className="text-[9px] text-zinc-600 hover:text-zinc-400 uppercase tracking-wider transition-colors"
        >
          {showPaid ? '▲' : '▼'} {paid.length} préstamo{paid.length !== 1 ? 's' : ''} saldado{paid.length !== 1 ? 's' : ''}
        </button>
      )}

      {showPaid && paid.length > 0 && (
        <div className="rounded-2xl bg-[#0d120d]/50 border border-white/[0.05] overflow-hidden">
          {paid.map((loan, i) => {
            const srcLabel = loan.envelope_split && loan.envelope_split.length > 0
              ? loan.envelope_split.map(s => s.name).join(', ')
              : loan.source_envelope_name ?? null
            return (
              <div
                key={loan.id}
                className={`grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5 ${i > 0 ? 'border-t border-white/[0.03]' : ''}`}
              >
                <div>
                  <p className="text-xs text-zinc-500 line-through">{loan.description}</p>
                  {srcLabel && (
                    <p className="text-[9px] text-zinc-700">{srcLabel}</p>
                  )}
                </div>
                <span className="text-[10px] tabular-nums text-zinc-700 text-right self-center">{fmtCRC(loan.original_amount)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
