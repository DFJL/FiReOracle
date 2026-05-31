'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { createTransaction, type TxEntryType } from '@/app/actions/transactions'

type Envelope = { id: string; name: string; custodio: string; parent_envelope_id: string | null }

const EXPENSE_GROUPS = [
  { value: 'personal',             label: 'Personal / Discrecional' },
  { value: 'necesario',            label: 'Necesario / Esencial' },
  { value: 'objetivos_financieros',label: 'Ahorro / Inversión (sin sobre)' },
  { value: 'na',                   label: 'Otro / Sin categoría' },
]

const TYPE_OPTIONS: { value: TxEntryType; label: string; desc: string; color: string }[] = [
  { value: 'gasto',   label: 'Gasto',              desc: 'Registro en transacciones',                    color: 'text-rose-400' },
  { value: 'ingreso', label: 'Ingreso',             desc: 'Registro en transacciones',                    color: 'text-[#a3e635]' },
  { value: 'ahorro',  label: 'Ahorro → Sobre',      desc: 'Transacción + movimiento de sobre',             color: 'text-blue-400' },
  { value: 'traslado',label: 'Traslado de sobres',  desc: 'Solo movimientos internos, sin transacción',   color: 'text-amber-400' },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function TransactionEntryFAB({ envelopes }: { envelopes: Envelope[] }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<TxEntryType>('gasto')
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [concept, setConcept] = useState('')
  const [expenseGroup, setExpenseGroup] = useState('personal')
  const [isPassive, setIsPassive] = useState(false)
  const [envelopeId, setEnvelopeId] = useState('')
  const [fromEnvelopeId, setFromEnvelopeId] = useState('')
  const [toEnvelopeId, setToEnvelopeId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)

  // Leaf envelopes only (for envelope pickers)
  const parentIds = new Set(envelopes.filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string))
  const leafEnvelopes = envelopes.filter(e => !parentIds.has(e.id))

  function reset() {
    setType('gasto'); setDate(today()); setAmount(''); setVendor('')
    setConcept(''); setExpenseGroup('personal'); setIsPassive(false)
    setEnvelopeId(''); setFromEnvelopeId(''); setToEnvelopeId('')
    setNotes(''); setError(null)
  }

  function close() { reset(); setOpen(false) }

  // Close on backdrop click
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Monto inválido'); return }

    startTransition(async () => {
      let result: { error: string | null } | undefined

      if (type === 'gasto') {
        result = await createTransaction({ type: 'gasto', date, amount: amt, vendor, concept, expense_group: expenseGroup, notes: notes || undefined })
      } else if (type === 'ingreso') {
        result = await createTransaction({ type: 'ingreso', date, amount: amt, vendor, concept, is_passive_income: isPassive, notes: notes || undefined })
      } else if (type === 'ahorro') {
        if (!envelopeId) { setError('Seleccioná un sobre'); return }
        result = await createTransaction({ type: 'ahorro', date, amount: amt, envelope_id: envelopeId, notes: notes || undefined })
      } else if (type === 'traslado') {
        if (!fromEnvelopeId || !toEnvelopeId) { setError('Seleccioná origen y destino'); return }
        result = await createTransaction({ type: 'traslado', date, amount: amt, from_envelope_id: fromEnvelopeId, to_envelope_id: toEnvelopeId, notes: notes || undefined })
      }

      if (result?.error) { setError(result.error); return }
      close()
    })
  }

  const inputCls = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40'
  const labelCls = 'block text-[9px] font-black text-zinc-500 uppercase tracking-[0.16em] mb-1'

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 rounded-full bg-[#a3e635] text-black flex items-center justify-center shadow-lg hover:bg-[#b4f040] transition-colors"
        aria-label="Registrar movimiento"
      >
        <Plus size={22} strokeWidth={3} />
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

          {/* Panel */}
          <div
            ref={panelRef}
            className="relative w-full md:max-w-md bg-[#0d120d] border border-[#a3e635]/[0.12] rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Nuevo movimiento</p>
              </div>
              <button onClick={close} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Type selector */}
            <div className="grid grid-cols-2 gap-1.5">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                    type === opt.value
                      ? 'bg-white/[0.06] border-white/[0.12]'
                      : 'border-transparent hover:bg-white/[0.03]'
                  }`}
                >
                  <p className={`text-xs font-bold ${opt.color}`}>{opt.label}</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-3">
              {/* Date + Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Fecha</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Monto (₡)</label>
                  <input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0" className={inputCls} required />
                </div>
              </div>

              {/* Gasto fields */}
              {type === 'gasto' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Comercio / Vendor</label>
                      <input type="text" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Spoon, PriceSmart…" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Concepto</label>
                      <input type="text" value={concept} onChange={e => setConcept(e.target.value)} placeholder="Almuerzo, Supermercado…" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Categoría</label>
                    <select value={expenseGroup} onChange={e => setExpenseGroup(e.target.value)} className={inputCls}>
                      {EXPENSE_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* Ingreso fields */}
              {type === 'ingreso' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Fuente</label>
                      <input type="text" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Empresa, cliente…" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Descripción</label>
                      <input type="text" value={concept} onChange={e => setConcept(e.target.value)} placeholder="Salario, dividendo…" className={inputCls} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={isPassive} onChange={e => setIsPassive(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-[#a3e635]" />
                    <span className="text-xs text-zinc-400">Ingreso pasivo (dividendo, rendimiento, alquiler…)</span>
                  </label>
                </>
              )}

              {/* Ahorro fields */}
              {type === 'ahorro' && (
                <div>
                  <label className={labelCls}>Sobre destino</label>
                  <select value={envelopeId} onChange={e => setEnvelopeId(e.target.value)} className={inputCls} required>
                    <option value="">Seleccioná un sobre…</option>
                    {leafEnvelopes.map(env => (
                      <option key={env.id} value={env.id}>{env.custodio} — {env.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Traslado fields */}
              {type === 'traslado' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Desde</label>
                    <select value={fromEnvelopeId} onChange={e => setFromEnvelopeId(e.target.value)} className={inputCls} required>
                      <option value="">Origen…</option>
                      {leafEnvelopes.map(env => (
                        <option key={env.id} value={env.id}>{env.custodio} — {env.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Hacia</label>
                    <select value={toEnvelopeId} onChange={e => setToEnvelopeId(e.target.value)} className={inputCls} required>
                      <option value="">Destino…</option>
                      {leafEnvelopes.filter(e => e.id !== fromEnvelopeId).map(env => (
                        <option key={env.id} value={env.id}>{env.custodio} — {env.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Notes (all types) */}
              <div>
                <label className={labelCls}>Notas <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Nota libre…" className={inputCls} />
              </div>

              {error && (
                <p className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3 rounded-xl bg-[#a3e635] text-black text-sm font-black tracking-wide hover:bg-[#b4f040] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Guardando…' : 'Guardar movimiento'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
