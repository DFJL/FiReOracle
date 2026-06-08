'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { upsertPaymentReminder, deletePaymentReminder } from '@/app/actions/inbox'
import type { PaymentReminder, ReminderSuggestion } from '@/app/actions/inbox'
import { Bell, BellOff, Plus, Trash2, Loader2, CalendarClock, Sparkles, Check, X } from 'lucide-react'

type Loan = { id: string; name: string; payment_day: number | null; currency_code: string | null }

const EMPTY = { name: '', amount: '', currency_code: 'CRC', due_day: '', notes: '' }

function fmtAmt(amount: number, currency: string) {
  return `${currency === 'USD' ? '$' : '₡'}${Math.round(amount).toLocaleString('es-CR')}`
}

export function PaymentRemindersManager({
  initialReminders,
  loans,
  suggestions: initialSuggestions,
}: {
  initialReminders: PaymentReminder[]
  loans: Loan[]
  suggestions: ReminderSuggestion[]
}) {
  const router = useRouter()
  const [reminders,    setReminders]    = useState(initialReminders)
  const [suggestions,  setSuggestions]  = useState(initialSuggestions)
  const [form,         setForm]         = useState(EMPTY)
  const [showAdd,      setShowAdd]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null)
  const [deleting,     setDeleting]     = useState<string | null>(null)
  const [err,          setErr]          = useState<string | null>(null)

  async function handleAdd(data = form) {
    if (!data.name || !data.due_day) return
    setSaving(true); setErr(null)
    const res = await upsertPaymentReminder({
      name:          data.name,
      amount:        data.amount ? parseFloat(data.amount) : null,
      currency_code: data.currency_code,
      due_day:       parseInt(data.due_day),
      notes:         null,
    })
    setSaving(false)
    if (res.error) { setErr(res.error); return }
    setForm(EMPTY); setShowAdd(false)
    router.refresh()
  }

  async function handleAcceptSuggestion(s: ReminderSuggestion, idx: number) {
    setAcceptingIdx(idx)
    const res = await upsertPaymentReminder({
      name:          s.vendor,
      amount:        s.amount,
      currency_code: s.currency_code,
      due_day:       s.due_day,
      notes:         null,
    })
    setAcceptingIdx(null)
    if (!res.error) {
      setSuggestions(ss => ss.filter((_, i) => i !== idx))
      router.refresh()
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await deletePaymentReminder(id)
    setReminders(r => r.filter(x => x.id !== id))
    setDeleting(null)
  }

  const loansWithDay = loans.filter(l => l.payment_day != null)

  return (
    <div className="space-y-5">

      {/* ── Loan payment days (read-only) ── */}
      {loansWithDay.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em]">Préstamos</p>
          {loansWithDay.map(l => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <CalendarClock size={12} className="text-zinc-600 shrink-0" />
              <p className="flex-1 text-xs text-zinc-300 truncate">{l.name}</p>
              <span className="text-[10px] text-zinc-500">día {l.payment_day}</span>
            </div>
          ))}
          <p className="text-[9px] text-zinc-700 px-1">Los días de pago se editan en el módulo de Préstamos.</p>
        </div>
      )}

      {/* ── AI suggestions ── */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-amber-400" />
            <p className="text-[9px] font-black text-amber-400/80 uppercase tracking-[0.14em]">Sugeridos del historial</p>
          </div>
          <div className="space-y-1.5">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
                <Bell size={11} className="text-amber-400/60 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200 font-semibold truncate">{s.vendor}</p>
                  <p className="text-[9px] text-zinc-500">{fmtAmt(s.amount, s.currency_code)} · día {s.due_day} · {s.frequency}x en 6m</p>
                </div>
                <button
                  onClick={() => handleAcceptSuggestion(s, i)}
                  disabled={acceptingIdx === i}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#a3e635]/20 text-[#a3e635] text-[9px] font-bold hover:bg-[#a3e635]/30 transition-colors disabled:opacity-40"
                >
                  {acceptingIdx === i ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />}
                  Agregar
                </button>
                <button
                  onClick={() => setSuggestions(ss => ss.filter((_, j) => j !== i))}
                  className="p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Custom reminders ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em]">Personalizados</p>
          <button
            onClick={() => setShowAdd(o => !o)}
            className="flex items-center gap-1 text-[9px] text-zinc-500 hover:text-[#a3e635] transition-colors"
          >
            <Plus size={10} /> Agregar
          </button>
        </div>

        {reminders.length === 0 && !showAdd && (
          <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <BellOff size={12} className="text-zinc-700 shrink-0" />
            <p className="text-[10px] text-zinc-600">Sin recordatorios personalizados todavía.</p>
          </div>
        )}

        {reminders.map(r => (
          <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <Bell size={12} className="text-zinc-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-200 font-semibold truncate">{r.name}</p>
              {r.amount && <p className="text-[9px] text-zinc-600">{fmtAmt(r.amount, r.currency_code)}</p>}
            </div>
            <span className="text-[10px] text-zinc-500 shrink-0">día {r.due_day}</span>
            <button
              onClick={() => handleDelete(r.id)}
              disabled={deleting === r.id}
              className="p-1 rounded hover:bg-white/[0.08] text-zinc-600 hover:text-rose-400 transition-colors disabled:opacity-40"
            >
              {deleting === r.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            </button>
          </div>
        ))}

        {showAdd && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2.5">
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nombre (ej: Internet KÖLBI, Agua)"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-[#a3e635]/40"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="Monto"
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-[#a3e635]/40"
              />
              <select
                value={form.currency_code}
                onChange={e => setForm(f => ({ ...f, currency_code: e.target.value }))}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="CRC" className="bg-[#111]">₡ CRC</option>
                <option value="USD" className="bg-[#111]">$ USD</option>
              </select>
              <input
                type="number"
                value={form.due_day}
                onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))}
                placeholder="Día (1-31)"
                min={1} max={31}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-[#a3e635]/40"
              />
            </div>
            {err && <p className="text-[10px] text-rose-400">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => handleAdd()}
                disabled={saving || !form.name || !form.due_day}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] transition-colors disabled:opacity-40"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Guardar
              </button>
              <button onClick={() => { setShowAdd(false); setForm(EMPTY) }} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
