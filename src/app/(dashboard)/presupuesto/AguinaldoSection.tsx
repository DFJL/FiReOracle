'use client'

import { useState, useTransition } from 'react'
import {
  addAguinaldoAllocation, updateAguinaldoAllocation, deleteAguinaldoAllocation,
  addGrossSalaryEntry, updateGrossSalaryEntry, deleteGrossSalaryEntry,
} from '@/app/actions/aguinaldo'
import type { AguinaldoAllocation, AguinaldoGrossSalaryEntry } from '@/app/actions/aguinaldo'
import type { Envelope, TxCategory } from './PresupuestoClient'

function fmtCRC(n: number) {
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Real/Budget completion — inverted from the regular budget page's color
// scale on purpose: here 100% means "ya se ejecutó lo planeado" (good), not
// "se pasó del límite" (bad).
function pctColor(pct: number) {
  if (pct >= 100) return 'text-emerald-400'
  if (pct >= 50)  return 'text-amber-400/80'
  if (pct > 0)    return 'text-rose-400/70'
  return 'text-zinc-700'
}

// ── Allocation row ──────────────────────────────────────────────────────────

function AllocationRow({
  alloc, envelopes, txCategories,
}: {
  alloc: AguinaldoAllocation
  envelopes: Envelope[]
  txCategories: TxCategory[]
}) {
  const [editing, setEditing]       = useState(false)
  const [label, setLabel]           = useState(alloc.label)
  const [amount, setAmount]         = useState(String(Math.round(alloc.amount)))
  const [realAmount, setRealAmount] = useState(alloc.real_amount != null ? String(Math.round(alloc.real_amount)) : '')
  const [groupName, setGroupName]   = useState(alloc.group_name ?? '')
  const [envelopeId, setEnvelopeId] = useState(alloc.envelope_id ?? '')
  const [categoryCode, setCategoryCode] = useState(alloc.category_code ?? '')
  const [error, setError]           = useState('')
  const [isPending, start]          = useTransition()

  const envelopeName = alloc.envelope_id ? envelopes.find(e => e.id === alloc.envelope_id)?.name : null
  const real = alloc.real_amount ?? 0
  const pct  = alloc.amount > 0 ? (real / alloc.amount) * 100 : 0

  function save() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    const realVal = realAmount.trim() === '' ? null : parseFloat(realAmount.replace(/,/g, ''))
    if (!label.trim())    { setError('Nombre requerido'); return }
    if (!amt || amt <= 0) { setError('Monto inválido'); return }
    setError('')
    start(async () => {
      const res = await updateAguinaldoAllocation(alloc.id, {
        label: label.trim(),
        amount: amt,
        real_amount: realVal,
        envelope_id: envelopeId || null,
        group_name: groupName.trim() || null,
        category_code: categoryCode || null,
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

  const inp = 'w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40'

  if (editing) {
    return (
      <div className="py-2 border-b border-white/[0.04] last:border-0 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Nombre" className={inp} />
          <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Grupo (ej. regalos)" className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <p className="text-[8px] text-zinc-600 uppercase mb-0.5">Budget</p>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div>
            <p className="text-[8px] text-zinc-600 uppercase mb-0.5">Real</p>
            <input type="number" value={realAmount} onChange={e => setRealAmount(e.target.value)} placeholder="0" className={inp} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <select value={envelopeId} onChange={e => setEnvelopeId(e.target.value)} className={inp}>
            <option value="">— sin sobre —</option>
            {envelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={categoryCode} onChange={e => setCategoryCode(e.target.value)} className={inp}>
            <option value="">— sin categoría —</option>
            {txCategories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
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
    )
  }

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-200 truncate">{alloc.label}</p>
        {envelopeName && <p className="text-[9px] text-zinc-600 truncate">→ {envelopeName}</p>}
      </div>
      <div className="text-right shrink-0 w-20">
        <p className="text-[10px] tabular-nums text-zinc-400">{fmtCRC(alloc.amount)}</p>
        <p className="text-[10px] tabular-nums text-zinc-500">{fmtCRC(real)}</p>
      </div>
      <span className={`text-[10px] font-bold tabular-nums w-10 text-right shrink-0 ${pctColor(pct)}`}>
        {pct.toFixed(0)}%
      </span>
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
  year, envelopes, existingGroups, nextSortOrder,
}: {
  year: number
  envelopes: Envelope[]
  existingGroups: string[]
  nextSortOrder: number
}) {
  const [label, setLabel]   = useState('')
  const [groupName, setGroupName] = useState('')
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
      const res = await addAguinaldoAllocation(year, label.trim(), amt, envelopeId || null, groupName.trim() || null, nextSortOrder)
      if (res?.error) { setError(res.error); return }
      setLabel(''); setAmount(''); setEnvelopeId('')
    })
  }

  const inp = 'bg-white/[0.06] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40'

  return (
    <div className="pt-2 space-y-1.5">
      <div className="flex gap-1.5">
        <input type="text" value={label} onChange={e => setLabel(e.target.value)}
          placeholder="ej. Regalos Emma, cena, deuda tarjeta..." className={`flex-1 ${inp}`} />
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0" className={`w-24 ${inp}`} />
      </div>
      <div className="flex gap-1.5">
        <input type="text" list="aguinaldo-groups" value={groupName} onChange={e => setGroupName(e.target.value)}
          placeholder="Grupo (ej. regalos, deudas, ahorros)" className={`flex-1 ${inp}`} />
        <datalist id="aguinaldo-groups">
          {existingGroups.map(g => <option key={g} value={g} />)}
        </datalist>
        <select value={envelopeId} onChange={e => setEnvelopeId(e.target.value)} className={inp}>
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

// ── Gross salary ledger ──────────────────────────────────────────────────────

function GrossEntryRow({ entry }: { entry: AguinaldoGrossSalaryEntry }) {
  const [editing, setEditing]   = useState(false)
  const [payDate, setPayDate]   = useState(entry.pay_date)
  const [amount, setAmount]     = useState(String(Math.round(entry.gross_amount)))
  const [notes, setNotes]       = useState(entry.notes ?? '')
  const [error, setError]       = useState('')
  const [isPending, start]      = useTransition()

  function save() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!payDate)          { setError('Fecha requerida'); return }
    if (!amt || amt <= 0)  { setError('Monto inválido'); return }
    setError('')
    start(async () => {
      const res = await updateGrossSalaryEntry(entry.id, { pay_date: payDate, gross_amount: amt, notes: notes.trim() || null })
      if (res?.error) { setError(res.error); return }
      setEditing(false)
    })
  }

  function remove() {
    if (!window.confirm(`¿Eliminar la quincena del ${fmtDate(entry.pay_date)}?`)) return
    start(async () => {
      const res = await deleteGrossSalaryEntry(entry.id)
      if (res?.error) setError(res.error)
    })
  }

  const inp = 'bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1 text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40'

  if (editing) {
    return (
      <div className="py-1.5 border-b border-white/[0.04] last:border-0 space-y-1">
        <div className="flex gap-1.5">
          <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={inp} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className={`flex-1 ${inp}`} />
        </div>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas (opcional)" className={`w-full ${inp}`} />
        {error && <p className="text-[10px] text-rose-400">{error}</p>}
        <div className="flex gap-1.5">
          <button onClick={save} disabled={isPending} className="px-2 py-1 rounded-md bg-amber-400 text-black text-[10px] font-black disabled:opacity-50">
            {isPending ? '...' : 'Guardar'}
          </button>
          <button onClick={() => setEditing(false)} className="px-2 py-1 rounded-md bg-white/[0.06] text-zinc-400 text-[10px]">
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1 border-b border-white/[0.04] last:border-0">
      <span className="text-[10px] text-zinc-500 w-20 shrink-0 tabular-nums">{fmtDate(entry.pay_date)}</span>
      <div className="min-w-0 flex-1">
        {entry.notes && <p className="text-[9px] text-zinc-600 truncate">{entry.notes}</p>}
      </div>
      <span className="text-[11px] tabular-nums text-amber-400/80 shrink-0">{fmtCRC(entry.gross_amount)}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={() => setEditing(true)} className="text-[9px] font-black text-zinc-600 uppercase hover:text-amber-400/70 transition-colors">
          Editar
        </button>
        <button onClick={remove} disabled={isPending} className="text-[9px] font-black text-zinc-700 uppercase hover:text-rose-400 transition-colors disabled:opacity-40">
          Borrar
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-400">{error}</p>}
    </div>
  )
}

function AddGrossEntryForm() {
  const [payDate, setPayDate] = useState('')
  const [amount, setAmount]   = useState('')
  const [notes, setNotes]     = useState('')
  const [error, setError]     = useState('')
  const [isPending, start]    = useTransition()

  function submit() {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!payDate)          { setError('Fecha requerida'); return }
    if (!amt || amt <= 0)  { setError('Monto inválido'); return }
    setError('')
    start(async () => {
      const res = await addGrossSalaryEntry(payDate, amt, notes.trim() || null)
      if (res?.error) { setError(res.error); return }
      setPayDate(''); setAmount(''); setNotes('')
    })
  }

  const inp = 'bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1 text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40'

  return (
    <div className="pt-2 space-y-1">
      <div className="flex gap-1.5">
        <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={inp} />
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="bruto quincena" className={`flex-1 ${inp}`} />
      </div>
      <div className="flex gap-1.5">
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas (opcional)" className={`flex-1 ${inp}`} />
        <button onClick={submit} disabled={isPending}
          className="px-3 py-1 rounded-lg bg-amber-400/15 text-amber-400 text-[10px] font-black hover:bg-amber-400/25 transition-colors disabled:opacity-50 shrink-0">
          {isPending ? '...' : '+ Quincena'}
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-400">{error}</p>}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export function AguinaldoSection({
  year, periodStart, periodEnd, estimatedAmount, estimateSource, monthsCovered,
  receivedAmount, allocations, grossSalaryEntries, envelopes, txCategories,
}: {
  year: number
  periodStart: string
  periodEnd: string
  estimatedAmount: number
  estimateSource: 'gross' | 'net'
  monthsCovered: number
  receivedAmount: number
  allocations: AguinaldoAllocation[]
  grossSalaryEntries: AguinaldoGrossSalaryEntry[]
  envelopes: Envelope[]
  txCategories: TxCategory[]
}) {
  const [collapsed, setCollapsed]       = useState(false)
  const [showLedger, setShowLedger]     = useState(false)
  const isActual = receivedAmount > 0
  const totalAmount = isActual ? receivedAmount : estimatedAmount

  const totalBudget = allocations.reduce((s, a) => s + a.amount, 0)
  const totalReal   = allocations.reduce((s, a) => s + (a.real_amount ?? 0), 0)
  const remaining   = totalAmount - totalBudget
  const pctAllocated = totalAmount > 0 ? Math.min((totalBudget / totalAmount) * 100, 100) : 0

  // Grouped rendering — ungrouped lines (group_name null) show under a
  // generic "Otros" bucket last, grouped ones keep first-seen order.
  const groupOrder: string[] = []
  const byGroup: Record<string, AguinaldoAllocation[]> = {}
  for (const a of allocations) {
    const g = a.group_name ?? 'Otros'
    if (!byGroup[g]) { byGroup[g] = []; groupOrder.push(g) }
    byGroup[g].push(a)
  }
  if (byGroup['Otros']) {
    groupOrder.splice(groupOrder.indexOf('Otros'), 1)
    groupOrder.push('Otros')
  }
  const existingGroups = groupOrder.filter(g => g !== 'Otros')

  if (totalAmount <= 0 && allocations.length === 0 && grossSalaryEntries.length === 0) return null

  return (
    <div className="bg-amber-400/[0.04] rounded-2xl border border-amber-400/[0.12] overflow-hidden">
      <button onClick={() => setCollapsed(v => !v)} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <div>
          <p className="text-[9px] font-black text-amber-400/60 uppercase tracking-[0.18em]">🎄 Aguinaldo {year}</p>
          <p className="text-xl font-black text-white mt-0.5">
            {fmtCRC(totalAmount)}
            <span className="text-xs font-normal text-zinc-500 ml-2">
              {isActual ? 'depositado' : estimateSource === 'gross' ? 'estimado (bruto registrado)' : 'estimado (aprox. desde neto)'}
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
              : estimateSource === 'gross'
                ? `Calculado por ley: bruto registrado ÷ 12${monthsCovered < 12 ? ` — cubre ${monthsCovered} de 12 meses del periodo (${fmtDate(periodStart)} a ${fmtDate(periodEnd)}), así que por ahora queda por debajo del real` : ''}.`
                : `Aproximado desde depósitos netos de SALARY + BONO (${fmtDate(periodStart)} a ${fmtDate(periodEnd)}) ÷ 12 — queda por debajo del real porque no descuenta CCSS/renta. Registrá tu salario bruto por quincena abajo para un cálculo exacto.`}
          </p>

          {/* Gross salary ledger */}
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3">
            <button onClick={() => setShowLedger(v => !v)} className="w-full flex items-center justify-between">
              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">
                Salario bruto registrado <span className="text-zinc-700 normal-case tracking-normal">({grossSalaryEntries.length} quincenas)</span>
              </p>
              <span className="text-zinc-600 text-[10px]">{showLedger ? '▾' : '▸'}</span>
            </button>
            {showLedger && (
              <div className="mt-2">
                {grossSalaryEntries.length === 0 ? (
                  <p className="text-[10px] text-zinc-600 py-1">Sin quincenas registradas — agregá el bruto de tus payslips para un cálculo exacto.</p>
                ) : (
                  grossSalaryEntries.map(e => <GrossEntryRow key={e.id} entry={e} />)
                )}
                <AddGrossEntryForm />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Asignado</p>
              <p className="text-[10px] text-zinc-500 tabular-nums">
                {fmtCRC(totalBudget)} / {fmtCRC(totalAmount)}
                {remaining < -0.5 && <span className="text-rose-400 ml-1">(excede por {fmtCRC(-remaining)})</span>}
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div className={`h-full rounded-full ${remaining < -0.5 ? 'bg-rose-500' : 'bg-amber-400'}`}
                style={{ width: `${pctAllocated}%`, opacity: 0.7 }} />
            </div>
            <div className="flex items-center justify-between mt-1 text-[9px] text-zinc-600">
              <span>Real ejecutado: <span className="text-zinc-400 tabular-nums">{fmtCRC(totalReal)}</span></span>
              <span>Diferencia vs. aguinaldo: <span className={`tabular-nums ${totalAmount - totalReal < 0 ? 'text-rose-400' : 'text-emerald-400/80'}`}>{fmtCRC(totalAmount - totalReal)}</span></span>
            </div>
          </div>

          <div>
            {allocations.length === 0 ? (
              <p className="text-[10px] text-zinc-600 py-2">Sin asignaciones todavía — agregá a qué va cada colón.</p>
            ) : (
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-0 py-1 border-b border-white/[0.06]">
                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider">Línea</p>
                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider w-20 text-right">Budget / Real</p>
                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider w-10 text-right">%</p>
              </div>
            )}
            {groupOrder.map(g => (
              <div key={g}>
                {groupOrder.length > 1 && (
                  <p className="text-[9px] font-black text-amber-400/50 uppercase tracking-wider mt-2 mb-0.5">{g}</p>
                )}
                {byGroup[g].map(a => (
                  <AllocationRow key={a.id} alloc={a} envelopes={envelopes} txCategories={txCategories} />
                ))}
              </div>
            ))}
          </div>

          <AddAllocationForm
            year={year}
            envelopes={envelopes}
            existingGroups={existingGroups}
            nextSortOrder={allocations.length}
          />
        </div>
      )}
    </div>
  )
}
