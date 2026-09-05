'use client'

import { useState, useTransition } from 'react'
import { createBucket, updateBucket, deactivateBucket, type BucketFormData } from '@/app/actions/investmentBuckets'
import { AccountSyncPanel } from './AccountSyncPanel'

type Bucket = {
  id: string
  bucket_type: string
  name: string
  industry: string | null
  color: string | null
  vendors: string[] | null
  concept_map: unknown
  account_id: string | null
  sort_order: number | null
}

type Account = { id: string; name: string; account_type: string; currency_code?: string }

const PRESET_COLORS = [
  '#f59e0b', '#3b82f6', '#a855f7', '#22d3ee',
  '#a3e635', '#f472b6', '#fb923c', '#34d399',
]

const BUCKET_TYPE_LABELS: Record<string, string> = {
  vendor_based:    'Por proveedor',
  concept_based:   'Por concepto',
  snapshot_based:  'Por cuenta (snapshot)',
}

function BucketForm({
  initial,
  accounts,
  onSave,
  onCancel,
}: {
  initial?: Partial<Bucket>
  accounts: Account[]
  onSave: (data: BucketFormData) => Promise<void>
  onCancel: () => void
}) {
  const isEdit = !!initial?.id
  const [type, setType]       = useState<BucketFormData['bucket_type']>(
    (initial?.bucket_type as BucketFormData['bucket_type']) ?? 'vendor_based'
  )
  const [name, setName]       = useState(initial?.name ?? '')
  const [industry, setIndustry] = useState(initial?.industry ?? '')
  const [color, setColor]     = useState(initial?.color ?? PRESET_COLORS[0])
  const [vendors, setVendors] = useState((initial?.vendors ?? []).join(', '))

  type CM = { depositConcepts: string[]; rendimientosConcepts: string[]; valorizacionConcepts: string[]; liquidacionConcepts: string[] }
  const cm = initial?.concept_map as CM | null | undefined
  const [depositC, setDepositC]         = useState(cm?.depositConcepts?.join('\n') ?? '')
  const [rendimientosC, setRendimientosC] = useState(cm?.rendimientosConcepts?.join('\n') ?? '')
  const [valorizacionC, setValorizacionC] = useState(cm?.valorizacionConcepts?.join('\n') ?? '')
  const [liquidacionC, setLiquidacionC] = useState(cm?.liquidacionConcepts?.join('\n') ?? '')
  const [accountId, setAccountId] = useState(initial?.account_id ?? '')
  const [error, setError]     = useState('')
  const [isPending, start]    = useTransition()

  function splitLines(s: string) { return s.split('\n').map(l => l.trim()).filter(Boolean) }

  function submit() {
    if (!name.trim()) { setError('Nombre requerido'); return }
    if (type === 'snapshot_based' && !accountId) { setError('Seleccioná una cuenta'); return }
    setError('')
    const data: BucketFormData = {
      bucket_type: type,
      name, industry, color,
      vendors: type === 'vendor_based' ? vendors.split(',').map((v: string) => v.trim()).filter(Boolean) : [],
      concept_map: type === 'concept_based' ? {
        depositConcepts:       splitLines(depositC),
        rendimientosConcepts:  splitLines(rendimientosC),
        valorizacionConcepts:  splitLines(valorizacionC),
        liquidacionConcepts:   splitLines(liquidacionC),
      } : null,
      account_id: type === 'snapshot_based' ? accountId : null,
    }
    start(async () => { await onSave(data) })
  }

  return (
    <div className="space-y-3">
      {/* Type selector — only for new buckets */}
      {!isEdit && (
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1.5">Tipo</p>
          <div className="flex gap-1 flex-wrap">
            {(['vendor_based', 'concept_based', 'snapshot_based'] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  type === t ? 'bg-[#a3e635] text-black' : 'bg-white/[0.06] text-zinc-400 hover:text-zinc-200'
                }`}>
                {BUCKET_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Nombre</p>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="TRANSCOMER"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Industria</p>
          <input value={industry} onChange={e => setIndustry(e.target.value)}
            placeholder="Bienes Raíces"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
      </div>

      <div>
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1.5">Color</p>
        <div className="flex gap-1.5 flex-wrap">
          {PRESET_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full transition-all ${
                color === c ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-[#080c08] scale-110' : 'opacity-60 hover:opacity-100'
              }`}
              style={{ background: c }} />
          ))}
        </div>
      </div>

      {/* Type-specific fields */}
      {type === 'vendor_based' && (
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Proveedores (separados por coma)</p>
          <input value={vendors} onChange={e => setVendors(e.target.value)}
            placeholder="TRANSCOMER, Otro Vendor"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40" />
        </div>
      )}

      {type === 'concept_based' && (
        <div className="space-y-2">
          {([
            ['Conceptos de depósito', depositC, setDepositC],
            ['Conceptos de rendimientos', rendimientosC, setRendimientosC],
            ['Conceptos de valorización', valorizacionC, setValorizacionC],
            ['Conceptos de liquidación', liquidacionC, setLiquidacionC],
          ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
            <div key={label}>
              <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{label} (uno por línea)</p>
              <textarea value={val} onChange={e => setter(e.target.value)} rows={3}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40 resize-none" />
            </div>
          ))}
        </div>
      )}

      {type === 'snapshot_based' && (
        <div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Cuenta financiera</p>
          <select value={accountId} onChange={e => setAccountId(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40">
            <option value="">— seleccioná una cuenta —</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>
            ))}
          </select>
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

export function BucketManager({ buckets: initial, accounts }: { buckets: Bucket[]; accounts: Account[] }) {
  const [buckets, setBuckets]   = useState(initial)
  const [showAdd, setShowAdd]   = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [syncId, setSyncId]     = useState<string | null>(null)
  const [isPending, start]      = useTransition()
  const accountById = Object.fromEntries(accounts.map(a => [a.id, a]))

  async function handleCreate(data: BucketFormData) {
    const res = await createBucket(data)
    if (res?.error) return
    setShowAdd(false)
  }

  async function handleUpdate(id: string, data: BucketFormData) {
    const res = await updateBucket(id, data)
    if (res?.error) return
    setEditId(null)
  }

  function handleDeactivate(id: string) {
    start(async () => {
      const res = await deactivateBucket(id)
      if (res?.error) return
      setConfirmId(null)
      setBuckets(prev => prev.filter(b => b.id !== id))
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black text-zinc-300">Productos de inversión</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">{buckets.length} activos</p>
        </div>
        {!showAdd && (
          <button onClick={() => { setShowAdd(true); setEditId(null) }}
            className="px-3 py-1.5 rounded-lg bg-[#a3e635]/10 text-[#a3e635] text-[10px] font-black hover:bg-[#a3e635]/20 transition-all">
            + Nuevo producto
          </button>
        )}
      </div>

      {showAdd && (
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-4">
          <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-widest mb-3">Nuevo producto</p>
          <BucketForm accounts={accounts} onSave={handleCreate} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {buckets.length === 0 && !showAdd && (
        <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center">
          <p className="text-sm text-zinc-600">Sin productos configurados</p>
        </div>
      )}

      <div className="space-y-1">
        {buckets.map(b => (
          <div key={b.id} className="rounded-xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
            {editId === b.id ? (
              <div className="p-4">
                <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-widest mb-3">Editar producto</p>
                <BucketForm
                  initial={b}
                  accounts={accounts}
                  onSave={(data) => handleUpdate(b.id, data)}
                  onCancel={() => setEditId(null)}
                />
              </div>
            ) : syncId === b.id && b.account_id ? (
              <AccountSyncPanel
                accountId={b.account_id}
                currencyCode={accountById[b.account_id]?.currency_code ?? 'CRC'}
                onClose={() => setSyncId(null)}
              />
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color ?? '#888' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200 font-semibold truncate">{b.name}</p>
                  <p className="text-[10px] text-zinc-600">
                    {b.industry ?? ''}
                    {b.industry ? ' · ' : ''}{BUCKET_TYPE_LABELS[b.bucket_type] ?? b.bucket_type}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {b.bucket_type === 'snapshot_based' && b.account_id && (
                    <button onClick={() => { setSyncId(b.id); setEditId(null) }}
                      className="px-2.5 py-1 rounded-lg bg-blue-400/10 text-blue-300 text-[10px] font-bold hover:bg-blue-400/20 transition-colors">
                      Sincronizar
                    </button>
                  )}
                  <button onClick={() => { setEditId(b.id); setShowAdd(false) }}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-zinc-500 text-[10px] hover:text-zinc-200 transition-colors">
                    Editar
                  </button>
                  {confirmId === b.id ? (
                    <>
                      <button onClick={() => handleDeactivate(b.id)} disabled={isPending}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-400 text-[10px] font-bold disabled:opacity-50">
                        Confirmar
                      </button>
                      <button onClick={() => setConfirmId(null)}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-zinc-500 text-[10px]">
                        No
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmId(b.id)}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-zinc-600 text-[10px] hover:text-rose-400 transition-colors">
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
