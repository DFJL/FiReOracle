'use client'

import { useState, useTransition } from 'react'
import { createGoal, updateGoal, deleteGoal, type GoalType } from '@/app/actions/goals'

// ── Types ──────────────────────────────────────────────────────────────────────

type Goal = {
  id: string
  name: string
  goal_type: string
  target_amount_crc: number
  target_date: string | null
  manual_current_amount_crc: number | null
  linked_envelope_id: string | null
  linked_bucket_id: string | null
  is_active: boolean
  sort_order: number | null
  current_amount: number
  monthly_rhythm: number
}

type Envelope = {
  id: string
  name: string
  color: string | null
}

type Bucket = {
  id: string
  name: string
  current_amount: number
  currency_code: string | null
}

type Props = {
  goals: Goal[]
  envelopes: Envelope[]
  buckets: Bucket[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: 'retiro',     label: 'Retiro anticipado' },
  { value: 'compra',     label: 'Compra' },
  { value: 'educacion',  label: 'Educación' },
  { value: 'emergencia', label: 'Fondo de emergencia' },
  { value: 'viaje',      label: 'Viaje' },
  { value: 'otro',       label: 'Otro' },
]

const GOAL_TYPE_MAP: Record<string, string> = Object.fromEntries(
  GOAL_TYPES.map(t => [t.value, t.label])
)

const MONTH_NAMES_ES = [
  'Ene','Feb','Mar','Abr','May','Jun',
  'Jul','Ago','Sep','Oct','Nov','Dic'
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtMonthYear(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${MONTH_NAMES_ES[d.getMonth()]} ${d.getFullYear()}`
}

// ── Empty form state ───────────────────────────────────────────────────────────

type FundingMode = 'envelope' | 'bucket' | 'manual'

type FormState = {
  name: string
  goal_type: GoalType
  target_amount_crc: string
  target_date: string
  funding_mode: FundingMode
  linked_envelope_id: string
  linked_bucket_id: string
  manual_current_amount_crc: string
}

function emptyForm(): FormState {
  return {
    name: '',
    goal_type: 'otro',
    target_amount_crc: '',
    target_date: '',
    funding_mode: 'manual',
    linked_envelope_id: '',
    linked_bucket_id: '',
    manual_current_amount_crc: '',
  }
}

function goalToForm(g: Goal): FormState {
  let funding_mode: FundingMode = 'manual'
  if (g.linked_envelope_id) funding_mode = 'envelope'
  else if (g.linked_bucket_id) funding_mode = 'bucket'

  return {
    name: g.name,
    goal_type: g.goal_type as GoalType,
    target_amount_crc: g.target_amount_crc > 0 ? String(g.target_amount_crc) : '',
    target_date: g.target_date ?? '',
    funding_mode,
    linked_envelope_id: g.linked_envelope_id ?? '',
    linked_bucket_id: g.linked_bucket_id ?? '',
    manual_current_amount_crc: g.manual_current_amount_crc != null ? String(g.manual_current_amount_crc) : '',
  }
}

// ── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onEdit,
  onDelete,
  isPending,
}: {
  goal: Goal
  onEdit: () => void
  onDelete: () => void
  isPending: boolean
}) {
  const pct = goal.target_amount_crc > 0
    ? Math.min(goal.current_amount / goal.target_amount_crc, 1)
    : 0
  const pctDisplay = (pct * 100).toFixed(1)

  // Projection
  let projectionEl: React.ReactNode = null
  if (goal.target_date && goal.monthly_rhythm > 0) {
    const today = new Date()
    const target = new Date(goal.target_date + 'T12:00:00')
    const monthsRemaining = Math.max(
      (target.getFullYear() - today.getFullYear()) * 12 +
      (target.getMonth() - today.getMonth()),
      0
    )
    const projected = goal.current_amount + goal.monthly_rhythm * monthsRemaining
    const onTrack = projected >= goal.target_amount_crc

    projectionEl = (
      <p className={`text-[10px] font-bold mt-1 ${onTrack ? 'text-[#a3e635]' : 'text-rose-400'}`}>
        {onTrack
          ? '✓ En camino'
          : `✗ Déficit de ${fmtCRC(goal.target_amount_crc - projected)}`}
      </p>
    )
  } else if (goal.target_date && goal.monthly_rhythm === 0) {
    // Has target date but no rhythm data
    projectionEl = (
      <p className="text-[10px] text-zinc-600 mt-1">Sin historial de depósitos</p>
    )
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-black text-white leading-tight truncate">{goal.name}</h2>
          <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.12em] bg-white/[0.06] text-zinc-400">
            {GOAL_TYPE_MAP[goal.goal_type] ?? goal.goal_type}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            disabled={isPending}
            className="px-2.5 py-1 text-[10px] font-black text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors disabled:opacity-40"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            disabled={isPending}
            className="px-2.5 py-1 text-[10px] font-black text-rose-400 hover:text-rose-300 bg-rose-500/[0.08] hover:bg-rose-500/[0.14] rounded-lg transition-colors disabled:opacity-40"
          >
            Eliminar
          </button>
        </div>
      </div>

      {/* Amount display */}
      <div>
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1">Progreso</p>
        <p className="text-[10px] text-zinc-400">
          {fmtCRC(goal.current_amount)}
          <span className="text-zinc-600"> de </span>
          {fmtCRC(goal.target_amount_crc)}
        </p>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${(pct * 100).toFixed(1)}%`,
              backgroundColor: pct >= 1 ? '#a3e635' : pct >= 0.5 ? '#84cc16' : '#4d7c0f',
            }}
          />
        </div>
      </div>

      {/* % funded */}
      <div className="flex items-end justify-between gap-2">
        <p
          className="text-3xl font-black leading-none"
          style={{ color: pct >= 1 ? '#a3e635' : pct >= 0.5 ? '#84cc16' : '#71717a' }}
        >
          {pctDisplay}%
        </p>
        <div className="text-right">
          {goal.target_date && (
            <p className="text-[10px] text-zinc-500">
              Para {fmtMonthYear(goal.target_date)}
            </p>
          )}
          {projectionEl}
        </div>
      </div>
    </div>
  )
}

// ── GoalForm (create/edit modal) ───────────────────────────────────────────────

function GoalForm({
  initial,
  envelopes,
  buckets,
  onCancel,
  onSubmit,
  isPending,
  submitLabel,
}: {
  initial: FormState
  envelopes: Envelope[]
  buckets: Bucket[]
  onCancel: () => void
  onSubmit: (f: FormState) => void
  isPending: boolean
  submitLabel: string
}) {
  const [form, setForm] = useState<FormState>(initial)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 space-y-4"
    >
      {/* Nombre */}
      <div>
        <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1.5">
          Nombre
        </label>
        <input
          type="text"
          required
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Ej: Fondo de emergencia"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40 transition-colors"
        />
      </div>

      {/* Tipo */}
      <div>
        <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1.5">
          Tipo de meta
        </label>
        <select
          value={form.goal_type}
          onChange={e => set('goal_type', e.target.value as GoalType)}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#a3e635]/40 transition-colors appearance-none"
        >
          {GOAL_TYPES.map(t => (
            <option key={t.value} value={t.value} className="bg-zinc-900">{t.label}</option>
          ))}
        </select>
      </div>

      {/* Monto objetivo */}
      <div>
        <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1.5">
          Monto objetivo (₡ CRC)
        </label>
        <input
          type="number"
          required
          min={1}
          value={form.target_amount_crc}
          onChange={e => set('target_amount_crc', e.target.value)}
          placeholder="Ej: 5000000"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40 transition-colors"
        />
      </div>

      {/* Fecha objetivo */}
      <div>
        <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1.5">
          Fecha objetivo <span className="text-zinc-600 normal-case font-normal">(opcional)</span>
        </label>
        <input
          type="date"
          value={form.target_date}
          onChange={e => set('target_date', e.target.value)}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#a3e635]/40 transition-colors"
        />
      </div>

      {/* Capital actual: radio options */}
      <div>
        <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-2">
          Capital actual
        </label>
        <div className="space-y-2">
          {/* Envelope option */}
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="radio"
              name="funding_mode"
              value="envelope"
              checked={form.funding_mode === 'envelope'}
              onChange={() => set('funding_mode', 'envelope')}
              className="accent-[#a3e635]"
            />
            <span className="text-xs text-zinc-300 group-hover:text-white transition-colors">
              Vinculado a sobre de ahorro
            </span>
          </label>
          {form.funding_mode === 'envelope' && (
            <div className="ml-5">
              <select
                value={form.linked_envelope_id}
                onChange={e => set('linked_envelope_id', e.target.value)}
                required={form.funding_mode === 'envelope'}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40 transition-colors appearance-none"
              >
                <option value="" className="bg-zinc-900">Seleccionar sobre...</option>
                {envelopes.map(e => (
                  <option key={e.id} value={e.id} className="bg-zinc-900">{e.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Bucket option */}
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="radio"
              name="funding_mode"
              value="bucket"
              checked={form.funding_mode === 'bucket'}
              onChange={() => set('funding_mode', 'bucket')}
              className="accent-[#a3e635]"
            />
            <span className="text-xs text-zinc-300 group-hover:text-white transition-colors">
              Vinculado a bucket de ahorro
            </span>
          </label>
          {form.funding_mode === 'bucket' && (
            <div className="ml-5">
              <select
                value={form.linked_bucket_id}
                onChange={e => set('linked_bucket_id', e.target.value)}
                required={form.funding_mode === 'bucket'}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40 transition-colors appearance-none"
              >
                <option value="" className="bg-zinc-900">Seleccionar bucket...</option>
                {buckets.map(b => (
                  <option key={b.id} value={b.id} className="bg-zinc-900">
                    {b.name} ({fmtCRC(b.current_amount)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Manual option */}
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="radio"
              name="funding_mode"
              value="manual"
              checked={form.funding_mode === 'manual'}
              onChange={() => set('funding_mode', 'manual')}
              className="accent-[#a3e635]"
            />
            <span className="text-xs text-zinc-300 group-hover:text-white transition-colors">
              Ingreso manual
            </span>
          </label>
          {form.funding_mode === 'manual' && (
            <div className="ml-5">
              <input
                type="number"
                min={0}
                value={form.manual_current_amount_crc}
                onChange={e => set('manual_current_amount_crc', e.target.value)}
                placeholder="Capital actual en ₡"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40 transition-colors"
              />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-[#a3e635] text-black text-xs font-black rounded-xl hover:bg-[#b4f040] transition-colors disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function MetasView({ goals, envelopes, buckets }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function buildInput(form: FormState) {
    return {
      name: form.name,
      goal_type: form.goal_type,
      target_amount_crc: parseFloat(form.target_amount_crc) || 0,
      target_date: form.target_date || null,
      linked_envelope_id: form.funding_mode === 'envelope' ? form.linked_envelope_id || null : null,
      linked_bucket_id: form.funding_mode === 'bucket' ? form.linked_bucket_id || null : null,
      manual_current_amount_crc:
        form.funding_mode === 'manual'
          ? parseFloat(form.manual_current_amount_crc) || 0
          : null,
    }
  }

  function handleCreate(form: FormState) {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await createGoal(buildInput(form))
      if (result.error) {
        setErrorMsg(result.error)
      } else {
        setShowCreate(false)
      }
    })
  }

  function handleUpdate(id: string, form: FormState) {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await updateGoal(id, { ...buildInput(form), is_active: true })
      if (result.error) {
        setErrorMsg(result.error)
      } else {
        setEditingId(null)
      }
    })
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar la meta "${name}"? Esta acción no se puede deshacer.`)) return
    setErrorMsg(null)
    startTransition(async () => {
      const result = await deleteGoal(id)
      if (result.error) setErrorMsg(result.error)
    })
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Planificación</p>
          <h1 className="text-xl font-black text-white">Metas Financieras</h1>
        </div>
        {!showCreate && (
          <button
            onClick={() => { setShowCreate(true); setEditingId(null) }}
            className="px-3 py-1.5 bg-[#a3e635] text-black text-xs font-black rounded-xl hover:bg-[#b4f040] transition-colors"
          >
            + Nueva meta
          </button>
        )}
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          {errorMsg}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <GoalForm
          initial={emptyForm()}
          envelopes={envelopes}
          buckets={buckets}
          onCancel={() => setShowCreate(false)}
          onSubmit={handleCreate}
          isPending={isPending}
          submitLabel="Crear meta"
        />
      )}

      {/* Empty state */}
      {goals.length === 0 && !showCreate && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
            <span className="text-2xl">🎯</span>
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-400">Sin metas todavía</p>
            <p className="text-xs text-zinc-600 mt-1">Crea tu primera meta financiera para comenzar a hacer seguimiento</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-[#a3e635] text-black text-xs font-black rounded-xl hover:bg-[#b4f040] transition-colors"
          >
            Crear primera meta
          </button>
        </div>
      )}

      {/* Goals grid */}
      {goals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map(goal => (
            <div key={goal.id}>
              {editingId === goal.id ? (
                <GoalForm
                  initial={goalToForm(goal)}
                  envelopes={envelopes}
                  buckets={buckets}
                  onCancel={() => setEditingId(null)}
                  onSubmit={form => handleUpdate(goal.id, form)}
                  isPending={isPending}
                  submitLabel="Guardar cambios"
                />
              ) : (
                <GoalCard
                  goal={goal}
                  onEdit={() => { setEditingId(goal.id); setShowCreate(false) }}
                  onDelete={() => handleDelete(goal.id, goal.name)}
                  isPending={isPending}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
