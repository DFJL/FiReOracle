'use client'

import { useState, useTransition } from 'react'
import type { Envelope, SubEnvelope } from './page'
import { addMovement, distributeInterest } from './actions'
import { createEnvelope, createSubEnvelope, deleteSubEnvelope } from '@/app/actions/envelopes'

function fmtCRC(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)     return `₡${Math.round(n / 1_000)}K`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

type MovType = 'deposito' | 'retiro' | 'interes' | 'traslado_in' | 'traslado_out'

const MOV_TYPES: { v: MovType; l: string }[] = [
  { v: 'deposito',     l: 'Depósito' },
  { v: 'retiro',       l: 'Retiro' },
  { v: 'interes',      l: 'Interés' },
  { v: 'traslado_in',  l: 'Traslado ↓' },
  { v: 'traslado_out', l: 'Traslado ↑' },
]

function AddMovementPanel({ envelope, onClose }: { envelope: Envelope | SubEnvelope; onClose: () => void }) {
  const [type, setType]     = useState<MovType>('deposito')
  const [amount, setAmount] = useState('')
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]   = useState('')
  const [error, setError]   = useState('')
  const [isPending, start]  = useTransition()

  function submit() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!amt || amt <= 0) { setError('Monto inválido'); return }
    setError('')
    start(async () => {
      const res = await addMovement(envelope.id, { date, amount: amt, type, notes })
      if (res?.error) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <div className="mx-4 mb-2 mt-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] p-4 space-y-3">
      <div className="flex gap-1 flex-wrap">
        {MOV_TYPES.map(({ v, l }) => (
          <button key={v} onClick={() => setType(v)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              type === v ? 'bg-[#a3e635] text-black' : 'bg-white/[0.06] text-zinc-400 hover:text-zinc-200'
            }`}>{l}</button>
        ))}
      </div>
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
      </div>
      <div>
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Notas (opcional)</p>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="..."
          className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50">
          {isPending ? '...' : 'Guardar'}
        </button>
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function InterestModal({
  custodio, envelopes, onClose,
}: { custodio: string; envelopes: (Envelope | SubEnvelope)[]; onClose: () => void }) {
  const [total, setTotal]  = useState('')
  const [date, setDate]    = useState(new Date().toISOString().slice(0, 10))
  const [error, setError]  = useState('')
  const [isPending, start] = useTransition()

  const totalBalance  = envelopes.reduce((s, e) => s + Math.max(e.balance, 0), 0)
  const totalInterest = parseFloat(total) || 0
  const allocations   = envelopes.map(e => ({
    envelopeId: e.id,
    name: e.name,
    amount: totalBalance > 0 ? (Math.max(e.balance, 0) / totalBalance) * totalInterest : 0,
  }))

  function submit() {
    if (!totalInterest || totalInterest <= 0) { setError('Monto inválido'); return }
    setError('')
    start(async () => {
      const res = await distributeInterest(allocations, date, custodio)
      if (res?.error) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0d120d] border border-[#a3e635]/[0.15] rounded-2xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Acreditar interés</p>
            <p className="text-base font-black text-white mt-0.5">{custodio}</p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-sm">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Interés total ₡</p>
            <input type="number" value={total} onChange={e => setTotal(e.target.value)}
              placeholder="0"
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
          </div>
          <div>
            <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Fecha</p>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40" />
          </div>
        </div>
        {totalInterest > 0 && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3 space-y-1.5 max-h-52 overflow-y-auto">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider mb-2">Distribución proporcional</p>
            {allocations.filter(a => a.amount > 0.01).map(a => (
              <div key={a.envelopeId} className="flex justify-between text-[10px]">
                <span className="text-zinc-400 truncate mr-2">{a.name}</span>
                <span className="text-[#a3e635] tabular-nums shrink-0">
                  +₡{a.amount.toLocaleString('es-CR', { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex gap-2">
          <button onClick={submit} disabled={isPending}
            className="flex-1 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50">
            {isPending ? '...' : 'Acreditar'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function SubEnvelopeRow({ sub, isOpen, onToggle }: {
  sub: SubEnvelope; isOpen: boolean; onToggle: () => void
}) {
  const [deleting, startDelete] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirmDel) { setConfirmDel(true); return }
    startDelete(async () => {
      await deleteSubEnvelope(sub.id)
    })
  }

  return (
    <div>
      <button onClick={onToggle}
        className={`w-full flex items-center gap-3 pl-9 pr-4 py-2 text-left transition-colors ${
          isOpen ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
        }`}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0 opacity-70" style={{ background: sub.color ?? '#888' }} />
        <span className="flex-1 text-[11px] text-zinc-400 truncate min-w-0">{sub.name}</span>
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          <span className={`text-[11px] font-black tabular-nums ${
            (sub.balance + sub.interest) > 0 ? 'text-zinc-300' : 'text-zinc-600'
          }`}>{fmtCRC(sub.balance + sub.interest)}</span>
          {sub.interest > 0 && (
            <span className="text-[8px] tabular-nums text-amber-500/50">
              +{fmtCRC(sub.interest)} int.
            </span>
          )}
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          title={confirmDel ? 'Toca de nuevo para confirmar' : 'Eliminar sub-sobre'}
          className={`text-[10px] w-5 text-center shrink-0 transition-colors ${
            confirmDel ? 'text-rose-400 hover:text-rose-300' : 'text-zinc-700 hover:text-zinc-500'
          }`}>
          {deleting ? '…' : confirmDel ? '!' : '×'}
        </button>
        <span className="text-zinc-700 text-[10px] w-3 text-center shrink-0 hover:text-zinc-500">
          {isOpen ? '−' : '+'}
        </span>
      </button>
      {isOpen && <AddMovementPanel envelope={sub} onClose={onToggle} />}
    </div>
  )
}

const SUB_PRESET_COLORS = ['#a3e635','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399','#fbbf24','#f87171']

function ReconcileModal({
  custodio, leafEnvelopes, systemTotal, onClose,
}: {
  custodio: string
  leafEnvelopes: (Envelope | SubEnvelope)[]
  systemTotal: number
  onClose: () => void
}) {
  const [realStr, setRealStr]       = useState('')
  const [targetId, setTargetId]     = useState(leafEnvelopes[0]?.id ?? '')
  const [date, setDate]             = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]           = useState('')
  const [applied, setApplied]       = useState(false)
  const [error, setError]           = useState('')
  const [isPending, start]          = useTransition()

  const real   = parseFloat(realStr.replace(/,/g, '')) || 0
  const hasVal = realStr.trim() !== ''
  const diff   = real - systemTotal  // positive = system is short; negative = system has excess

  function apply() {
    if (!diff || !targetId) return
    setError('')
    start(async () => {
      const type: 'deposito' | 'retiro' = diff > 0 ? 'deposito' : 'retiro'
      const res = await addMovement(targetId, {
        date,
        amount: Math.abs(diff),
        type,
        notes: notes.trim() || `Ajuste cuadre ${custodio} ${date}`,
      })
      if (res?.error) { setError(res.error); return }
      setApplied(true)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full sm:max-w-sm bg-zinc-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-0.5">Cuadre de cuenta</p>
            <p className="text-base font-bold text-white">{custodio}</p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* System balance */}
        <div className="flex items-center justify-between bg-white/[0.04] rounded-xl px-4 py-3">
          <span className="text-xs text-zinc-500">Sistema (sobres)</span>
          <span className="text-sm font-black tabular-nums text-zinc-200">{fmtCRC(systemTotal)}</span>
        </div>

        {/* Real balance input */}
        <div className="space-y-1">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wide">Saldo real en banco</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">₡</span>
            <input
              type="number"
              inputMode="numeric"
              autoFocus
              value={realStr}
              onChange={e => setRealStr(e.target.value)}
              placeholder="0"
              className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl pl-8 pr-4 py-3 text-xl font-bold text-white focus:outline-none focus:border-white/30 tabular-nums placeholder-zinc-700"
            />
          </div>
        </div>

        {/* Difference */}
        {hasVal && (
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${
            Math.abs(diff) < 1 ? 'bg-lime-500/10 border border-lime-500/20' :
            diff > 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-rose-500/10 border border-rose-500/20'
          }`}>
            <span className="text-xs font-bold text-zinc-400">Diferencia</span>
            <span className={`text-sm font-black tabular-nums ${
              Math.abs(diff) < 1 ? 'text-lime-400' : diff > 0 ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {Math.abs(diff) < 1 ? '✓ Cuadrado' : (diff > 0 ? '+' : '') + fmtCRC(diff)}
            </span>
          </div>
        )}

        {/* Adjustment controls — only shown when there's a gap */}
        {hasVal && Math.abs(diff) >= 1 && !applied && (
          <div className="space-y-3 border-t border-white/[0.06] pt-3">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wide">
              Aplicar ajuste de {fmtCRC(Math.abs(diff))} ({diff > 0 ? 'depósito faltante' : 'retiro no registrado'})
            </p>

            <div className="space-y-1">
              <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Sobre destino</p>
              <select
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40"
              >
                {leafEnvelopes.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Fecha</p>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Notas (opcional)</p>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Extracto bancario…"
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-[#a3e635]/40"
                />
              </div>
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-sm text-zinc-400 hover:bg-white/[0.04]">
                Cancelar
              </button>
              <button
                onClick={apply}
                disabled={isPending || !targetId}
                className="flex-1 py-3 rounded-xl bg-[#a3e635] text-black text-sm font-black disabled:opacity-40"
              >
                {isPending ? 'Aplicando…' : 'Aplicar ajuste'}
              </button>
            </div>
          </div>
        )}

        {/* Already balanced or applied */}
        {(hasVal && Math.abs(diff) < 1 || applied) && (
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-lime-500/10 text-lime-400 text-sm font-black border border-lime-500/20">
            {applied ? '✓ Ajuste aplicado — cerrar' : '✓ Cerrar'}
          </button>
        )}
      </div>
    </div>
  )
}

function AddEnvelopePanel({ onClose }: { onClose: () => void }) {
  const [name, setCustName]   = useState('')
  const [custodio, setCust]   = useState('')
  const [color, setColor]     = useState(SUB_PRESET_COLORS[0])
  const [rate, setRate]       = useState('')
  const [balance, setBalance] = useState('')
  const [error, setError]     = useState('')
  const [isPending, start]    = useTransition()

  function submit() {
    if (!name.trim())     { setError('Nombre requerido'); return }
    if (!custodio.trim()) { setError('Custodio requerido'); return }
    setError('')
    start(async () => {
      const res = await createEnvelope({
        name,
        custodio,
        color,
        annual_rate: rate ? parseFloat(rate) : null,
        initial_balance: balance ? parseFloat(balance.replace(/,/g, '')) : null,
      })
      if (res?.error) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.15] p-4 space-y-3">
      <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-widest">Nuevo sobre</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Nombre</p>
          <input value={name} onChange={e => setCustName(e.target.value)} placeholder="Fondo de emergencia"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Custodio / Banco</p>
          <input value={custodio} onChange={e => setCust(e.target.value)} placeholder="BAC, BCR…"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Tasa anual % (opcional)</p>
          <input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="4.5"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Saldo inicial ₡ (opcional)</p>
          <input type="number" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
      </div>
      <div>
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1.5">Color</p>
        <div className="flex gap-1.5 flex-wrap">
          {SUB_PRESET_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full transition-all ${color === c ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-[#080c08] scale-110' : 'opacity-60 hover:opacity-100'}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50 transition-opacity">
          {isPending ? '...' : 'Crear sobre'}
        </button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs hover:text-zinc-200 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function AddSubEnvelopePanel({ parentId, onClose }: { parentId: string; onClose: () => void }) {
  const [name, setName]       = useState('')
  const [color, setColor]     = useState(SUB_PRESET_COLORS[0])
  const [rate, setRate]       = useState('')
  const [balance, setBalance] = useState('')
  const [error, setError]     = useState('')
  const [isPending, start]    = useTransition()

  function submit() {
    if (!name.trim()) { setError('Nombre requerido'); return }
    setError('')
    start(async () => {
      const res = await createSubEnvelope(parentId, {
        name,
        color,
        annual_rate: rate ? parseFloat(rate) : null,
        initial_balance: balance ? parseFloat(balance.replace(/,/g, '')) : null,
      })
      if (res?.error) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <div className="mx-4 mb-3 mt-1 rounded-xl bg-white/[0.04] border border-[#a3e635]/[0.12] p-4 space-y-3">
      <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-widest">Nuevo sub-sobre</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Nombre</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Fondo X"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Tasa anual % (opcional)</p>
          <input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="4.5"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 items-start">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1.5">Color</p>
          <div className="flex gap-1.5 flex-wrap">
            {SUB_PRESET_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full transition-all ${color === c ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-[#080c08] scale-110' : 'opacity-60 hover:opacity-100'}`}
                style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Saldo inicial ₡ (opcional)</p>
          <input type="number" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50 transition-opacity">
          {isPending ? '...' : 'Crear sub-sobre'}
        </button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs hover:text-zinc-200 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function EnvelopeSection({
  envelopes,
  leafEnvelopes,
}: {
  envelopes: Envelope[]
  leafEnvelopes: (Envelope | SubEnvelope)[]
}) {
  const [openId, setOpenId]             = useState<string | null>(null)
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [subAddParentId, setSubAdd]     = useState<string | null>(null)
  const [subAddLeafId, setSubAddLeaf]   = useState<string | null>(null)
  const [interestCustodio, setInterest]   = useState<string | null>(null)
  const [reconcileCustodio, setReconcile] = useState<string | null>(null)
  const [showAddEnvelope, setShowAdd]     = useState(false)

  const custodios = [...new Set(envelopes.map(e => e.custodio))]
  const total     = envelopes.reduce((s, e) => s + e.balance, 0)
  const nonZero   = envelopes.filter(e => e.balance > 0).length

  // System total per custodio: includes interest for leaf envelopes; parent envelopes already sum children's interest in .balance
  function custSystemTotal(cust: string) {
    return envelopes
      .filter(e => e.custodio === cust)
      .reduce((s, e) => s + e.balance + (e.children.length === 0 ? e.interest : 0), 0)
  }

  const now        = new Date()
  const monthLabel = now.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }).toUpperCase()

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[9px] font-black text-[#a3e635]/60 tracking-[0.22em] uppercase mb-1">
          Fire Oracle · {monthLabel}
        </p>
        <p className="text-3xl font-black text-white tracking-tight leading-none">Liquidez</p>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[#a3e635]/[0.06] rounded-2xl overflow-hidden border border-[#a3e635]/[0.08]">
        <div className="bg-[#0d120d] px-4 py-4 flex flex-col gap-1.5">
          <p className="text-2xl font-black tabular-nums leading-none text-[#a3e635]">{fmtCRC(total)}</p>
          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.16em]">Total líquido</p>
        </div>
        <div className="bg-[#0d120d] px-4 py-4 flex flex-col gap-1.5">
          <p className="text-2xl font-black tabular-nums leading-none text-zinc-300">{envelopes.length}</p>
          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.16em]">
            Sobres · {nonZero} activos
          </p>
        </div>
      </div>

      {/* Custodio strip */}
      <div className="flex gap-2 flex-wrap">
        {custodios.map(cust => {
          const custTotal = custSystemTotal(cust)
          const pct       = total > 0 ? (custTotal / total) * 100 : 0
          return (
            <div key={cust} className="flex-1 min-w-[150px] flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-[#0d120d] border border-[#a3e635]/[0.10]">
              <div>
                <p className="text-xs font-black text-zinc-200">{cust}</p>
                <p className="text-[10px] tabular-nums text-zinc-500">{fmtCRC(custTotal)} · {pct.toFixed(1)}%</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => setReconcile(cust)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-zinc-400 text-[10px] font-black hover:bg-white/[0.10] transition-all">
                  Cuadrar
                </button>
                <button onClick={() => setInterest(cust)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#a3e635]/10 text-[#a3e635] text-[10px] font-black hover:bg-[#a3e635]/20 transition-all">
                  + Interés
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Envelope table */}
      <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#a3e635]/[0.08] flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Sobres de ahorro</p>
            <p className="text-xs text-zinc-500 mt-0.5">Toca un sobre para registrar movimientos</p>
          </div>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="shrink-0 text-[9px] font-black text-[#a3e635]/60 hover:text-[#a3e635] transition-colors px-2.5 py-1.5 rounded-lg border border-[#a3e635]/[0.12] hover:border-[#a3e635]/30">
            + Sobre
          </button>
        </div>
        {envelopes.map((env, i) => {
          const hasChildren = env.children.length > 0
          const isExpanded  = expandedId === env.id
          const isOpen      = openId === env.id

          return (
            <div key={env.id} className={i > 0 ? 'border-t border-white/[0.03]' : ''}>
              {/* Parent row */}
              <button
                onClick={() => {
                  if (hasChildren) setExpandedId(isExpanded ? null : env.id)
                  else setOpenId(isOpen ? null : env.id)
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isExpanded || isOpen ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                }`}>
                {hasChildren ? (
                  <span className="text-[10px] text-zinc-600 w-2.5 text-center shrink-0 transition-transform"
                    style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                    ▶
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: env.color ?? '#888' }} />
                )}
                {hasChildren && (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: env.color ?? '#888' }} />
                )}
                <span className="flex-1 text-xs text-zinc-300 truncate min-w-0">{env.name}</span>
                <span className="text-[9px] font-bold text-zinc-600 px-1.5 py-0.5 rounded bg-white/[0.04] shrink-0">
                  {env.custodio}
                </span>
                <div className="shrink-0 flex flex-col items-end gap-0.5">
                  <span className={`text-xs font-black tabular-nums ${
                    env.balance > 0 ? 'text-zinc-100' : 'text-zinc-600'
                  }`}>{fmtCRC(env.balance)}</span>
                  {env.interest > 0 && (
                    <span className="text-[8px] tabular-nums text-amber-500/50">
                      +{fmtCRC(env.interest)} int.
                    </span>
                  )}
                </div>
                {!hasChildren && (
                  <span className="text-zinc-600 text-[10px] w-3 text-center shrink-0">
                    {isOpen ? '−' : '+'}
                  </span>
                )}
              </button>

              {!hasChildren && isOpen && subAddLeafId !== env.id && (
                <>
                  <AddMovementPanel envelope={env} onClose={() => setOpenId(null)} />
                  <div className="flex justify-end pl-9 pr-4 py-1.5 bg-white/[0.02] border-t border-white/[0.03]">
                    <button
                      onClick={() => { setSubAddLeaf(env.id); setOpenId(null) }}
                      className="text-[9px] font-black text-[#a3e635]/60 hover:text-[#a3e635] transition-colors">
                      + Sub-sobre
                    </button>
                  </div>
                </>
              )}
              {!hasChildren && subAddLeafId === env.id && (
                <AddSubEnvelopePanel
                  parentId={env.id}
                  onClose={() => setSubAddLeaf(null)}
                />
              )}

              {hasChildren && isExpanded && (
                <div className="border-t border-white/[0.03]">
                  {env.children.filter(sub => sub.balance + sub.interest > 0).map(sub => (
                    <div key={sub.id} className="border-t border-white/[0.02] first:border-t-0">
                      <SubEnvelopeRow
                        sub={sub}
                        isOpen={openId === sub.id}
                        onToggle={() => setOpenId(openId === sub.id ? null : sub.id)}
                      />
                    </div>
                  ))}
                  {subAddParentId === env.id ? (
                    <div className="border-t border-white/[0.03]">
                      <AddSubEnvelopePanel
                        parentId={env.id}
                        onClose={() => setSubAdd(null)}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pl-9 pr-4 py-1.5 bg-white/[0.02] border-t border-white/[0.03]">
                      <span className="text-[9px] text-zinc-700 uppercase tracking-wider">Total</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => { setSubAdd(env.id); setOpenId(null) }}
                          className="text-[9px] font-black text-[#a3e635]/60 hover:text-[#a3e635] transition-colors">
                          + Sub-sobre
                        </button>
                        <span className="text-[9px] font-black tabular-nums text-zinc-500">{fmtCRC(env.balance + env.interest)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showAddEnvelope && (
        <AddEnvelopePanel onClose={() => setShowAdd(false)} />
      )}

      {reconcileCustodio && (
        <ReconcileModal
          custodio={reconcileCustodio}
          leafEnvelopes={leafEnvelopes.filter(e => e.custodio === reconcileCustodio)}
          systemTotal={custSystemTotal(reconcileCustodio)}
          onClose={() => setReconcile(null)}
        />
      )}

      {interestCustodio && (
        <InterestModal
          custodio={interestCustodio}
          envelopes={leafEnvelopes.filter(e => e.custodio === interestCustodio)}
          onClose={() => setInterest(null)}
        />
      )}
    </div>
  )
}
