'use client'

import { useState, useTransition } from 'react'
import { addAguinaldoAllocation, updateAguinaldoAllocation, deleteAguinaldoAllocation } from '@/app/actions/aguinaldo'
import type { AguinaldoAllocation } from '@/app/actions/aguinaldo'
import type { Envelope } from './PresupuestoClient'

function fmtCRC(n: number) {
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function AllocationRow({
  alloc, envelopes,
}: {
  alloc: AguinaldoAllocation
  envelopes: Envelope[]
}) {
  const [editing, setEditing]   = useState(false)
  const [label, setLabel]       = useState(alloc.label)
  const [amount, setAmount]     = useState(String(Math.round(alloc.amount)))
  const [envelopeId, setEnvelopeId] = useState(alloc.envelope_id ?? '')
  const [isDone, setIsDone]     = useState(alloc.is_done)
  const [error, setError]       = useState('')
  const [isPending, start]      = useTransition()

  const envelopeName = alloc.envelope_id ? envelopes.find(e => e.id === alloc.envelope_id)?.name : null

  function toggleDone() {
    const next = !isDone
    setIsDone(next)
    start(async () => {
      const res = await updateAguinaldoAllocation(alloc.id, { is_done: next })
      if (res?.error) setIsDone(!next)
    })
  }

  function save() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!label.trim())   { setError('Nombre requerido'); return }
    if (!amt || amt <= 0) { setError('Monto inválido'); return }
    setError('')
    start(async () => {
      const res = await updateAguinaldoAllocation(alloc.id, {
        label: label.trim(), amount: amt, envelope_id: envelopeId || null,
      })
      if (res?.error) { setError(res.error); return }
      setEditing(false)
    })
  }

  function remove() {
    if (!window.confirm(`¿Eliminar "${alloc.label}"?`)) return
    start(async () => {
      const res = await deleteAguinaldoAllocation(alloc.id)
      if (res?.error) setError(res.error)
    })
  }

  if (editing) {
    return (
      <div className="grid grid-cols-[1fr_auto] gap-2 items-start py-1.5 border-b border-white/[0.04] last:border-0">
        <div className="space-y-1.5">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="ej. Regalos niños"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40"
          />
          <div className="flex gap-1.5">
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-28 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40"
            />
            <select
              value={envelopeId}
              onChange={e => setEnvelopeId(e.target.value)}
              className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400/40"
            >
              <option value="">— sin sobre —</option>
              {envelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          {error && <p className="text-[10px] text-rose-400">{error}</p>}
          <div className="flex gap-1.5">
            <button onClick={save} disabled={isPending}
              className="px-2.5 py-1 rounded-md bg-amber-400 text-black text-[10px] font-black disabled:opacity-50">
              {isPending ? '...' : 'Guardar'}
            </button>
            <button onClick={() => setEditing(false)}
              className="px-2.5 py-1 rounded-md bg-white/[0.06] text-zinc-400 text-[10px]">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
      <button
        onClick={toggleDone}
        disabled={isPending}
        role="checkbox"
        aria-checked={isDone}
        title={isDone ? 'Hecho' : 'Pendiente'}
        className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[9px] font-black transition-all ${
          isDone ? 'bg-amber-400 border-amber-400 text-black' : 'border-zinc-700 text-transparent hover:border-zinc-500'
        }`}
      >
        ✓
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-xs truncate ${isDone ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{alloc.label}</p>
        {envelopeName && <p className="text-[9px] text-zinc-600 truncate">→ {envelopeName}</p>}
      </div>
      <span className="text-xs font-bold tabular-nums text-amber-400/90 shrink-0">{fmtCRC(alloc.amount)}</span>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => setEditing(true)} className="text-[9px] font-black text-zinc-600 uppercase hover:text-amber-400/70 transition-colors">
          Editar
        </button>
        <button onClick={remove} disabled={isPending} className="text-[9px] font-black text-zinc-700 uppercase hover:text-rose-400 transition-colors disabled:opacity-40">
          Borrar
        </button>
      </div>
    </div>
  )
}

function AddAllocationForm({
  year, envelopes, nextSortOrder,
}: {
  year: number
  envelopes: Envelope[]
  nextSortOrder: number
}) {
  const [label, setLabel]   = useState('')
  const [amount, setAmount] = useState('')
  const [envelopeId, setEnvelopeId] = useState('')
  const [error, setError]   = useState('')
  const [isPending, start]  = useTransition()

  function submit() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!label.trim())   { setError('Nombre requerido'); return }
    if (!amt || amt <= 0) { setError('Monto inválido'); return }
    setError('')
    start(async () => {
      const res = await addAguinaldoAllocation(year, label.trim(), amt, envelopeId || null, nextSortOrder)
      if (res?.error) { setError(res.error); return }
      setLabel(''); setAmount(''); setEnvelopeId('')
    })
  }

  return (
    <div className="pt-2 space-y-1.5">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="ej. Regalos niños, cena, deuda tarjeta..."
          className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40"
        />
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0"
          className="w-24 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40"
        />
      </div>
      <div className="flex gap-1.5">
        <select
          value={envelopeId}
          onChange={e => setEnvelopeId(e.target.value)}
          className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400/40"
        >
          <option value="">— sin sobre —</option>
          {envelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button onClick={submit} disabled={isPending}
          className="px-3 py-1.5 rounded-lg bg-amber-400/15 text-amber-400 text-[10px] font-black hover:bg-amber-400/25 transition-colors disabled:opacity-50 shrink-0">
          {isPending ? '...' : '+ Agregar'}
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-400">{error}</p>}
    </div>
  )
}

export function AguinaldoSection({
  year, periodStart, periodEnd, estimatedAmount, receivedAmount, allocations, envelopes,
}: {
  year: number
  periodStart: string
  periodEnd: string
  estimatedAmount: number
  receivedAmount: number
  allocations: AguinaldoAllocation[]
  envelopes: Envelope[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const isActual = receivedAmount > 0
  const totalAmount = isActual ? receivedAmount : estimatedAmount

  const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0)
  const remaining = totalAmount - totalAllocated
  const pctAllocated = totalAmount > 0 ? Math.min((totalAllocated / totalAmount) * 100, 100) : 0

  if (totalAmount <= 0 && allocations.length === 0) return null

  return (
    <div className="bg-amber-400/[0.04] rounded-2xl border border-amber-400/[0.12] overflow-hidden">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <p className="text-[9px] font-black text-amber-400/60 uppercase tracking-[0.18em]">
            🎄 Aguinaldo {year}
          </p>
          <p className="text-xl font-black text-white mt-0.5">
            {fmtCRC(totalAmount)}
            <span className="text-xs font-normal text-zinc-500 ml-2">
              {isActual ? 'depositado' : 'estimado'}
            </span>
          </p>
        </div>
        <span className="text-zinc-600 text-xs">{collapsed ? '▾' : '▴'}</span>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 space-y-4">
          <p className="text-[9px] text-zinc-600">
            {isActual
              ? `Ya depositado en diciembre ${year}.`
              : `Calculado por ley: salario + bonos de ${fmtDate(periodStart)} a ${fmtDate(periodEnd)} ÷ 12. Se reemplaza por el monto real en cuanto se deposite.`}
          </p>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Asignado</p>
              <p className="text-[10px] text-zinc-500 tabular-nums">
                {fmtCRC(totalAllocated)} / {fmtCRC(totalAmount)}
                {remaining < -0.5 && <span className="text-rose-400 ml-1">(excede por {fmtCRC(-remaining)})</span>}
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className={`h-full rounded-full ${remaining < -0.5 ? 'bg-rose-500' : 'bg-amber-400'}`}
                style={{ width: `${pctAllocated}%`, opacity: 0.7 }}
              />
            </div>
          </div>

          <div>
            {allocations.length === 0 ? (
              <p className="text-[10px] text-zinc-600 py-2">Sin asignaciones todavía — agregá a qué va cada colón.</p>
            ) : (
              allocations.map(a => (
                <AllocationRow key={a.id} alloc={a} envelopes={envelopes} />
              ))
            )}
          </div>

          <AddAllocationForm
            year={year}
            envelopes={envelopes}
            nextSortOrder={allocations.length}
          />
        </div>
      )}
    </div>
  )
}
