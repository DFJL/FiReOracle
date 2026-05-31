'use client'

import { useState, useTransition } from 'react'
import type { Envelope } from './page'
import type { SelfLoan } from './page'
import { createSelfLoan, recordSelfLoanPayment } from '@/app/actions/selfLoans'

function fmtCRC(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)     return `₡${Math.round(n / 1_000)}K`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function NewLoanForm({ envelopes, onClose }: { envelopes: Envelope[]; onClose: () => void }) {
  const [description, setDescription] = useState('')
  const [amount, setAmount]           = useState('')
  const [date, setDate]               = useState(new Date().toISOString().slice(0, 10))
  const [envelopeId, setEnvelopeId]   = useState<string>('')
  const [notes, setNotes]             = useState('')
  const [error, setError]             = useState('')
  const [isPending, start]            = useTransition()

  function submit() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!description.trim()) { setError('Descripción requerida'); return }
    if (!amt || amt <= 0)    { setError('Monto inválido'); return }
    setError('')
    start(async () => {
      const res = await createSelfLoan({
        description: description.trim(),
        original_amount: amt,
        loan_date: date,
        source_envelope_id: envelopeId || null,
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

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Rubro / descripción</p>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="ej. Celular Sita"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Monto ₡</p>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Fecha</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40" />
        </div>
        <div className="col-span-2">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Fuente (sobre)</p>
          <select value={envelopeId} onChange={e => setEnvelopeId(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40">
            <option value="">— sin sobre vinculado —</option>
            {envelopes.map(e => (
              <option key={e.id} value={e.id}>{e.name} ({e.custodio})</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Notas (opcional)</p>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="..."
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50">
          {isPending ? '...' : 'Registrar'}
        </button>
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function PaymentPanel({ loan, onClose }: { loan: SelfLoan; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]   = useState('')
  const [error, setError]   = useState('')
  const [isPending, start]  = useTransition()

  const remaining = loan.original_amount - loan.amount_repaid

  function submit() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!amt || amt <= 0)       { setError('Monto inválido'); return }
    if (amt > remaining + 0.01) { setError(`Máximo ₡${Math.round(remaining).toLocaleString('es-CR')}`); return }
    setError('')
    start(async () => {
      const res = await recordSelfLoanPayment(loan.id, { amount: amt, date, notes })
      if (res?.error) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <div className="mx-4 mb-2 mt-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] p-4 space-y-3">
      <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">
        Registrar abono · saldo {fmtCRC(remaining)}
        {loan.source_envelope_name && (
          <span className="text-[#a3e635]/70"> → {loan.source_envelope_name}</span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Monto ₡</p>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Fecha</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40" />
        </div>
        <div className="col-span-2">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Notas (opcional)</p>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="..."
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50">
          {isPending ? '...' : 'Abonar'}
        </button>
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs">
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function SelfLoansSection({ loans, envelopes }: { loans: SelfLoan[]; envelopes: Envelope[] }) {
  const [showNew, setShowNew]   = useState(false)
  const [openId, setOpenId]     = useState<string | null>(null)
  const [showPaid, setShowPaid] = useState(false)

  const active = loans.filter(l => l.status !== 'paid')
  const paid   = loans.filter(l => l.status === 'paid')
  const totalBalance = active.reduce((s, l) => s + (l.original_amount - l.amount_repaid), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Autopréstamos</p>
          <p className="text-xl font-black text-white mt-0.5">
            {fmtCRC(totalBalance)}
            <span className="text-sm font-normal text-zinc-500 ml-2">saldo pendiente</span>
          </p>
        </div>
        {!showNew && (
          <button onClick={() => setShowNew(true)}
            className="px-3 py-1.5 rounded-lg bg-[#a3e635]/10 text-[#a3e635] text-[10px] font-black hover:bg-[#a3e635]/20 transition-all">
            + Préstamo
          </button>
        )}
      </div>

      {showNew && <NewLoanForm envelopes={envelopes} onClose={() => setShowNew(false)} />}

      {/* Active loans table */}
      {active.length > 0 && (
        <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-2 border-b border-white/[0.04]">
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider">Rubro</p>
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider text-right">Monto</p>
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider text-right">Cancelado</p>
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider text-right">Saldo</p>
            <p className="w-3" />
          </div>

          {active.map((loan, i) => {
            const balance = loan.original_amount - loan.amount_repaid
            const pct     = loan.original_amount > 0 ? (loan.amount_repaid / loan.original_amount) * 100 : 0
            const isOpen  = openId === loan.id
            return (
              <div key={loan.id} className={i > 0 ? 'border-t border-white/[0.03]' : ''}>
                <button
                  onClick={() => setOpenId(isOpen ? null : loan.id)}
                  className={`w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-4 py-2.5 text-left transition-colors ${
                    isOpen ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{loan.description}</p>
                    {loan.source_envelope_name && (
                      <p className="text-[9px] text-zinc-600">{loan.source_envelope_name}</p>
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

                {isOpen && (
                  <PaymentPanel loan={loan} onClose={() => setOpenId(null)} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {loans.length === 0 && !showNew && (
        <p className="text-xs text-zinc-600 text-center py-4">Sin autopréstamos registrados.</p>
      )}

      {/* Paid loans toggle */}
      {paid.length > 0 && (
        <button onClick={() => setShowPaid(v => !v)}
          className="text-[9px] text-zinc-600 hover:text-zinc-400 uppercase tracking-wider transition-colors">
          {showPaid ? '▲' : '▼'} {paid.length} préstamo{paid.length !== 1 ? 's' : ''} saldado{paid.length !== 1 ? 's' : ''}
        </button>
      )}

      {showPaid && paid.length > 0 && (
        <div className="rounded-2xl bg-[#0d120d]/50 border border-white/[0.05] overflow-hidden">
          {paid.map((loan, i) => (
            <div key={loan.id}
              className={`grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5 ${i > 0 ? 'border-t border-white/[0.03]' : ''}`}>
              <div>
                <p className="text-xs text-zinc-500 line-through">{loan.description}</p>
                {loan.source_envelope_name && (
                  <p className="text-[9px] text-zinc-700">{loan.source_envelope_name}</p>
                )}
              </div>
              <span className="text-[10px] tabular-nums text-zinc-700 text-right self-center">{fmtCRC(loan.original_amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
