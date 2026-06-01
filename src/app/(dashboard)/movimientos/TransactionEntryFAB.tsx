'use client'

import { useState, useTransition, useEffect } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import { createTransaction, type TxEntryType } from '@/app/actions/transactions'

type Envelope = { id: string; name: string; custodio: string; parent_envelope_id: string | null }
type Category = {
  code: string; name: string; parent_code: string | null
  category_type: string; group_gasto: string | null; is_passive_income: boolean
}

// ─── helpers ────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10) }

function envelopeLabel(env: Envelope, all: Envelope[]) {
  if (!env.parent_envelope_id) return `${env.custodio} › ${env.name}`
  const parent = all.find(e => e.id === env.parent_envelope_id)
  return parent
    ? `${env.custodio} › ${parent.name} › ${env.name}`
    : `${env.custodio} › ${env.name}`
}

// Build grouped <optgroup> for category picker
function CategorySelect({
  categories, value, onChange, typeFilter, className,
}: {
  categories: Category[]; value: string; onChange: (v: string) => void
  typeFilter: 'expense' | 'income'; className: string
}) {
  const parents = categories.filter(c => !c.parent_code && c.category_type === typeFilter)
  const children = categories.filter(c => c.parent_code && c.category_type === typeFilter)
  // Also include parent-level items that have no children as standalone
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">Sin categoría</option>
      {parents.map(p => {
        const kids = children.filter(c => c.parent_code === p.code)
        return kids.length > 0 ? (
          <optgroup key={p.code} label={p.name}>
            {kids.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </optgroup>
        ) : (
          <option key={p.code} value={p.code}>{p.name}</option>
        )
      })}
    </select>
  )
}

// ─── main component ──────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: TxEntryType; label: string; desc: string; color: string }[] = [
  { value: 'gasto',    label: 'Gasto',             desc: 'Solo en transacciones',                  color: 'text-rose-400' },
  { value: 'ingreso',  label: 'Ingreso',            desc: 'Solo en transacciones',                  color: 'text-[#a3e635]' },
  { value: 'ahorro',   label: 'Ahorro → Sobre',     desc: 'Transacción + movimiento de sobre',       color: 'text-blue-400' },
  { value: 'traslado', label: 'Traslado de sobres', desc: 'Solo movimientos internos, sin tx',       color: 'text-amber-400' },
]

export function TransactionEntryFAB({
  envelopes, categories,
}: {
  envelopes: Envelope[]; categories: Category[]
}) {
  const [open, setOpen]               = useState(false)
  const [type, setType]               = useState<TxEntryType>('gasto')
  // common
  const [date, setDate]               = useState(today())
  const [amount, setAmount]           = useState('')
  const [notes, setNotes]             = useState('')
  // currency
  const [currency, setCurrency]       = useState<'CRC' | 'USD'>('CRC')
  const [amountUSD, setAmountUSD]     = useState('')
  const [fxRate, setFxRate]           = useState('')
  // gasto / ingreso
  const [vendor, setVendor]           = useState('')
  const [concept, setConcept]         = useState('')
  const [categoryCode, setCategoryCode] = useState('')
  const [expenseGroup, setExpenseGroup] = useState('personal')
  // flags
  const [isPassive, setIsPassive]     = useState(false)
  const [isSettlement, setIsSettlement] = useState(false)
  const [isSurvival, setIsSurvival]   = useState(false)
  // envelopes
  const [envelopeId, setEnvelopeId]           = useState('')
  const [fromEnvelopeId, setFromEnvelopeId]   = useState('')
  const [toEnvelopeId, setToEnvelopeId]       = useState('')
  // ahorro extras
  const [ahorroVendor, setAhorroVendor] = useState('')
  const [ahorroConcepto, setAhorroConcepto] = useState('')

  const [error, setError]             = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  // Leaf-only envelopes; parents only used for display label
  const parentIds = new Set(envelopes.filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string))
  const leafEnvelopes = envelopes.filter(e => !parentIds.has(e.id))

  // Auto-derive expense_group from selected category
  useEffect(() => {
    if (!categoryCode) return
    const cat = categories.find(c => c.code === categoryCode)
    if (cat?.group_gasto && cat.group_gasto !== 'na') setExpenseGroup(cat.group_gasto)
    if (cat?.is_passive_income) setIsPassive(true)
  }, [categoryCode, categories])

  function reset() {
    setType('gasto'); setDate(today()); setAmount(''); setNotes('')
    setCurrency('CRC'); setAmountUSD(''); setFxRate('')
    setVendor(''); setConcept(''); setCategoryCode(''); setExpenseGroup('personal')
    setIsPassive(false); setIsSettlement(false); setIsSurvival(false)
    setEnvelopeId(''); setFromEnvelopeId(''); setToEnvelopeId('')
    setAhorroVendor(''); setAhorroConcepto('')
    setError(null)
  }

  function close() { reset(); setOpen(false) }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Compute CRC amount when user enters USD amount + rate
  const crcFromUSD = amountUSD && fxRate
    ? (parseFloat(amountUSD) * parseFloat(fxRate)).toFixed(0)
    : ''

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amtCRC = currency === 'USD' ? parseFloat(crcFromUSD || '0') : parseFloat(amount)
    if (!amtCRC || amtCRC <= 0) { setError('Monto inválido'); return }

    startTransition(async () => {
      let result: { error: string | null } | undefined

      if (type === 'gasto') {
        result = await createTransaction({
          type: 'gasto', date, amount: amtCRC,
          currency_code: currency,
          amount_usd: currency === 'USD' ? parseFloat(amountUSD) : undefined,
          exchange_rate_used: currency === 'USD' ? parseFloat(fxRate) : undefined,
          vendor, concept,
          expense_group: expenseGroup || 'na',
          category_code: categoryCode || undefined,
          is_settlement: isSettlement,
          is_survival_expense: isSurvival,
          notes: notes || undefined,
        })
      } else if (type === 'ingreso') {
        result = await createTransaction({
          type: 'ingreso', date, amount: amtCRC,
          currency_code: currency,
          amount_usd: currency === 'USD' ? parseFloat(amountUSD) : undefined,
          exchange_rate_used: currency === 'USD' ? parseFloat(fxRate) : undefined,
          vendor, concept,
          category_code: categoryCode || undefined,
          is_passive_income: isPassive,
          is_settlement: isSettlement,
          notes: notes || undefined,
        })
      } else if (type === 'ahorro') {
        if (!envelopeId) { setError('Seleccioná un sobre'); return }
        result = await createTransaction({
          type: 'ahorro', date, amount: amtCRC,
          envelope_id: envelopeId,
          vendor: ahorroVendor || undefined,
          concept: ahorroConcepto || undefined,
          notes: notes || undefined,
        })
      } else if (type === 'traslado') {
        if (!fromEnvelopeId || !toEnvelopeId) { setError('Seleccioná origen y destino'); return }
        result = await createTransaction({
          type: 'traslado', date, amount: amtCRC,
          from_envelope_id: fromEnvelopeId,
          to_envelope_id: toEnvelopeId,
          notes: notes || undefined,
        })
      }

      if (result?.error) { setError(result.error); return }
      close()
    })
  }

  function submitNext(e: React.MouseEvent) {
    e.preventDefault()
    setError(null)

    const amtCRC = currency === 'USD' ? parseFloat(crcFromUSD || '0') : parseFloat(amount)
    if (!amtCRC || amtCRC <= 0) { setError('Monto inválido'); return }

    startTransition(async () => {
      let result: { error: string | null } | undefined

      if (type === 'gasto') {
        result = await createTransaction({
          type: 'gasto', date, amount: amtCRC,
          currency_code: currency,
          amount_usd: currency === 'USD' ? parseFloat(amountUSD) : undefined,
          exchange_rate_used: currency === 'USD' ? parseFloat(fxRate) : undefined,
          vendor, concept,
          expense_group: expenseGroup || 'na',
          category_code: categoryCode || undefined,
          is_settlement: isSettlement,
          is_survival_expense: isSurvival,
          notes: notes || undefined,
        })
      } else if (type === 'ingreso') {
        result = await createTransaction({
          type: 'ingreso', date, amount: amtCRC,
          currency_code: currency,
          amount_usd: currency === 'USD' ? parseFloat(amountUSD) : undefined,
          exchange_rate_used: currency === 'USD' ? parseFloat(fxRate) : undefined,
          vendor, concept,
          category_code: categoryCode || undefined,
          is_passive_income: isPassive,
          is_settlement: isSettlement,
          notes: notes || undefined,
        })
      } else if (type === 'ahorro') {
        if (!envelopeId) { setError('Seleccioná un sobre'); return }
        result = await createTransaction({
          type: 'ahorro', date, amount: amtCRC,
          envelope_id: envelopeId,
          vendor: ahorroVendor || undefined,
          concept: ahorroConcepto || undefined,
          notes: notes || undefined,
        })
      } else if (type === 'traslado') {
        if (!fromEnvelopeId || !toEnvelopeId) { setError('Seleccioná origen y destino'); return }
        result = await createTransaction({
          type: 'traslado', date, amount: amtCRC,
          from_envelope_id: fromEnvelopeId,
          to_envelope_id: toEnvelopeId,
          notes: notes || undefined,
        })
      }

      if (result?.error) { setError(result.error); return }
      reset()
    })
  }

  const inputCls = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40'
  const lbl = 'block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1'
  const toggle = (checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded accent-[#a3e635]" />
      <span className="text-xs text-zinc-400">{label}</span>
    </label>
  )

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

      {/* Backdrop + Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

          <div className="relative w-full md:max-w-lg bg-[#0d120d] border border-[#a3e635]/[0.12] rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Nuevo movimiento</p>
              <button onClick={close} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={16} /></button>
            </div>

            {/* Type selector */}
            <div className="grid grid-cols-2 gap-1.5">
              {TYPE_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => { setType(opt.value); setError(null) }}
                  className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                    type === opt.value ? 'bg-white/[0.06] border-white/[0.12]' : 'border-transparent hover:bg-white/[0.03]'
                  }`}>
                  <p className={`text-xs font-bold ${opt.color}`}>{opt.label}</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-3">

              {/* ── Date + Amount ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Fecha</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
                </div>
                <div>
                  <label className={lbl}>Moneda</label>
                  <div className="flex gap-1">
                    {(['CRC', 'USD'] as const).map(c => (
                      <button key={c} type="button" onClick={() => setCurrency(c)}
                        className={`flex-1 py-2 rounded-lg text-xs font-black transition-all border ${
                          currency === c ? 'bg-[#a3e635] text-black border-[#a3e635]' : 'text-zinc-500 border-white/[0.08] hover:text-zinc-300'
                        }`}>
                        {c === 'CRC' ? '₡' : '$'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Amount fields depend on currency */}
              {currency === 'CRC' ? (
                <div>
                  <label className={lbl}>Monto (₡ CRC)</label>
                  <input type="number" min="0" step="any" value={amount}
                    onChange={e => setAmount(e.target.value)} placeholder="0" className={inputCls} required />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={lbl}>Monto (USD)</label>
                    <input type="number" min="0" step="any" value={amountUSD}
                      onChange={e => setAmountUSD(e.target.value)} placeholder="0" className={inputCls} required />
                  </div>
                  <div>
                    <label className={lbl}>Tipo de cambio</label>
                    <input type="number" min="0" step="any" value={fxRate}
                      onChange={e => setFxRate(e.target.value)} placeholder="530" className={inputCls} required />
                  </div>
                  <div>
                    <label className={lbl}>≈ CRC</label>
                    <div className={`${inputCls} text-zinc-400 pointer-events-none`}>
                      {crcFromUSD ? `₡${parseInt(crcFromUSD).toLocaleString('es-CR')}` : '—'}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Gasto fields ── */}
              {type === 'gasto' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Comercio / Vendor</label>
                      <input type="text" value={vendor} onChange={e => setVendor(e.target.value)}
                        placeholder="Spoon, PriceSmart…" className={inputCls} />
                    </div>
                    <div>
                      <label className={lbl}>Concepto</label>
                      <input type="text" value={concept} onChange={e => setConcept(e.target.value)}
                        placeholder="Almuerzo, Supermercado…" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Categoría <span className="text-zinc-700 normal-case tracking-normal">(auto-asigna grupo)</span></label>
                    <CategorySelect categories={categories} value={categoryCode}
                      onChange={v => { setCategoryCode(v); if (!v) setExpenseGroup('personal') }}
                      typeFilter="expense" className={inputCls} />
                  </div>
                  {!categoryCode && (
                    <div>
                      <label className={lbl}>Grupo de gasto</label>
                      <select value={expenseGroup} onChange={e => setExpenseGroup(e.target.value)} className={inputCls}>
                        <option value="personal">Personal / Discrecional</option>
                        <option value="necesario">Necesario / Esencial</option>
                        <option value="objetivos_financieros">Ahorro / Inversión</option>
                        <option value="na">Sin categoría</option>
                      </select>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4">
                    {toggle(isSettlement, setIsSettlement, 'Liquidación de inversión (is_settlement)')}
                    {toggle(isSurvival, setIsSurvival, 'Gasto de supervivencia')}
                  </div>
                </>
              )}

              {/* ── Ingreso fields ── */}
              {type === 'ingreso' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Fuente / Pagador</label>
                      <input type="text" value={vendor} onChange={e => setVendor(e.target.value)}
                        placeholder="Empresa, cliente…" className={inputCls} />
                    </div>
                    <div>
                      <label className={lbl}>Descripción / Concepto</label>
                      <input type="text" value={concept} onChange={e => setConcept(e.target.value)}
                        placeholder="Salario, dividendo…" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Categoría</label>
                    <CategorySelect categories={categories} value={categoryCode}
                      onChange={v => { setCategoryCode(v); const c = categories.find(x => x.code === v); if (c?.is_passive_income) setIsPassive(true) }}
                      typeFilter="income" className={inputCls} />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {toggle(isPassive, setIsPassive, 'Ingreso pasivo (dividendo, rendimiento, alquiler…)')}
                    {toggle(isSettlement, setIsSettlement, 'Liquidación de inversión (excluir de ingreso real)')}
                  </div>
                </>
              )}

              {/* ── Ahorro → Sobre fields ── */}
              {type === 'ahorro' && (
                <>
                  <div>
                    <label className={lbl}>Sobre destino</label>
                    <select value={envelopeId} onChange={e => setEnvelopeId(e.target.value)}
                      className={inputCls} required>
                      <option value="">Seleccioná un sobre…</option>
                      {leafEnvelopes.map(env => (
                        <option key={env.id} value={env.id}>{envelopeLabel(env, envelopes)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Vendor <span className="text-zinc-700 normal-case tracking-normal">para portafolio (opcional)</span></label>
                      <input type="text" value={ahorroVendor} onChange={e => setAhorroVendor(e.target.value)}
                        placeholder="dominion, transcomer…" className={inputCls} />
                    </div>
                    <div>
                      <label className={lbl}>Concepto <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                      <input type="text" value={ahorroConcepto} onChange={e => setAhorroConcepto(e.target.value)}
                        placeholder="Compra cuotas…" className={inputCls} />
                    </div>
                  </div>
                  <p className="text-[9px] text-zinc-600">
                    Crea una transacción + movimiento de sobre. Si el sobre corresponde a un bucket de portafolio, ingresá el vendor exacto para que aparezca en Inversiones.
                  </p>
                </>
              )}

              {/* ── Traslado fields ── */}
              {type === 'traslado' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Desde</label>
                    <select value={fromEnvelopeId} onChange={e => setFromEnvelopeId(e.target.value)}
                      className={inputCls} required>
                      <option value="">Origen…</option>
                      {leafEnvelopes.map(env => (
                        <option key={env.id} value={env.id}>{envelopeLabel(env, envelopes)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Hacia</label>
                    <select value={toEnvelopeId} onChange={e => setToEnvelopeId(e.target.value)}
                      className={inputCls} required>
                      <option value="">Destino…</option>
                      {leafEnvelopes.filter(e => e.id !== fromEnvelopeId).map(env => (
                        <option key={env.id} value={env.id}>{envelopeLabel(env, envelopes)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* ── Notes (all types) ── */}
              <div>
                <label className={lbl}>Notas <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Nota libre…" className={inputCls} />
              </div>

              {error && (
                <p className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={submitNext} disabled={isPending}
                  className="py-3 rounded-xl bg-white/[0.06] border border-white/[0.10] text-white text-sm font-black tracking-wide hover:bg-white/[0.10] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {isPending ? '…' : 'Siguiente →'}
                </button>
                <button type="submit" disabled={isPending}
                  className="py-3 rounded-xl bg-[#a3e635] text-black text-sm font-black tracking-wide hover:bg-[#b4f040] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {isPending ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
