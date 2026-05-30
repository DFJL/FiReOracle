'use client'

import { useState, useTransition } from 'react'
import { createEnvelope, updateEnvelope, deactivateEnvelope } from '@/app/actions/envelopes'

type Envelope = {
  id: string
  name: string
  custodio: string
  color: string | null
  annual_rate: number | null
  sort_order: number | null
}

const PRESET_COLORS = [
  '#a3e635',
  '#60a5fa',
  '#f472b6',
  '#fb923c',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f87171',
]

type FormData = { name: string; custodio: string; color: string; annual_rate: number | null; initial_balance?: number | null }

function EnvelopeForm({
  initial,
  existingCustodios,
  showBalance,
  onSave,
  onCancel,
}: {
  initial?: Partial<Envelope>
  existingCustodios: string[]
  showBalance?: boolean
  onSave: (data: FormData) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName]       = useState(initial?.name ?? '')
  const [custodio, setCust]   = useState(initial?.custodio ?? '')
  const [color, setColor]     = useState(initial?.color ?? PRESET_COLORS[0])
  const [rate, setRate]       = useState(initial?.annual_rate?.toString() ?? '')
  const [balance, setBalance] = useState('')
  const [error, setError]     = useState('')
  const [isPending, start]    = useTransition()

  function submit() {
    if (!name.trim())    { setError('Nombre requerido'); return }
    if (!custodio.trim()) { setError('Custodio requerido'); return }
    setError('')
    start(async () => {
      await onSave({
        name, custodio, color,
        annual_rate: rate ? parseFloat(rate) : null,
        initial_balance: showBalance && balance ? parseFloat(balance.replace(/,/g, '')) : null,
      })
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Nombre del sobre</p>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Fondo emergencias"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
          />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Custodio / Banco</p>
          <input
            value={custodio} onChange={e => setCust(e.target.value)}
            placeholder="BCR"
            list="custodio-list"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
          />
          <datalist id="custodio-list">
            {existingCustodios.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 items-start">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1.5">Color</p>
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full transition-all ${
                  color === c
                    ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-[#080c08] scale-110'
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Tasa anual % (opcional)</p>
          <input
            type="number" step="0.01"
            value={rate} onChange={e => setRate(e.target.value)}
            placeholder="4.5"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
          />
        </div>
      </div>

      {showBalance && (
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Saldo inicial ₡ (opcional)</p>
          <input
            type="number"
            value={balance} onChange={e => setBalance(e.target.value)}
            placeholder="0"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
          />
        </div>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50 transition-opacity">
          {isPending ? '...' : 'Guardar'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs hover:text-zinc-200 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function EnvelopeManager({ envelopes: initial }: { envelopes: Envelope[] }) {
  const [envelopes, setEnvelopes]         = useState(initial)
  const [showAdd, setShowAdd]             = useState(false)
  const [editId, setEditId]               = useState<string | null>(null)
  const [confirmId, setConfirmId]         = useState<string | null>(null)
  const [isPending, start]                = useTransition()

  const custodios = [...new Set(envelopes.map(e => e.custodio))]

  async function handleCreate(data: FormData) {
    const res = await createEnvelope(data)
    if (res?.error) return
    setShowAdd(false)
  }

  async function handleUpdate(id: string, data: FormData) {
    const res = await updateEnvelope(id, data)
    if (res?.error) return
    setEditId(null)
  }

  function handleDeactivate(id: string) {
    start(async () => {
      const res = await deactivateEnvelope(id)
      if (res?.error) return
      setConfirmId(null)
      setEnvelopes(prev => prev.filter(e => e.id !== id))
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black text-zinc-300">Sobres de liquidez</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">{envelopes.length} activos</p>
        </div>
        {!showAdd && (
          <button
            onClick={() => { setShowAdd(true); setEditId(null) }}
            className="px-3 py-1.5 rounded-lg bg-[#a3e635]/10 text-[#a3e635] text-[10px] font-black hover:bg-[#a3e635]/20 transition-all"
          >
            + Nuevo sobre
          </button>
        )}
      </div>

      {showAdd && (
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-4">
          <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-widest mb-3">Nuevo sobre</p>
          <EnvelopeForm
            existingCustodios={custodios}
            showBalance
            onSave={handleCreate}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {envelopes.length === 0 && !showAdd && (
        <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center">
          <p className="text-sm text-zinc-600">Sin sobres configurados</p>
          <p className="text-[10px] text-zinc-700 mt-1">Creá el primero con el botón de arriba</p>
        </div>
      )}

      <div className="space-y-1">
        {envelopes.map(env => (
          <div key={env.id} className="rounded-xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
            {editId === env.id ? (
              <div className="p-4">
                <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-widest mb-3">Editar sobre</p>
                <EnvelopeForm
                  initial={env}
                  existingCustodios={custodios}
                  onSave={(data) => handleUpdate(env.id, data)}
                  onCancel={() => setEditId(null)}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: env.color ?? '#888' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200 font-semibold truncate">{env.name}</p>
                  <p className="text-[10px] text-zinc-600">
                    {env.custodio}
                    {env.annual_rate ? ` · ${env.annual_rate}% anual` : ''}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { setEditId(env.id); setShowAdd(false) }}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-zinc-500 text-[10px] hover:text-zinc-200 transition-colors"
                  >
                    Editar
                  </button>
                  {confirmId === env.id ? (
                    <>
                      <button
                        onClick={() => handleDeactivate(env.id)}
                        disabled={isPending}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-400 text-[10px] font-bold disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-zinc-500 text-[10px]"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(env.id)}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-zinc-600 text-[10px] hover:text-rose-400 transition-colors"
                    >
                      Archivar
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
