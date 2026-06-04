'use client'

import { useState, useTransition } from 'react'
import { runAudit } from '@/app/actions/audit'
import { addMovement } from '@/app/(dashboard)/liquidez/actions'
import {
  deleteTransactions,
  fixPassiveIncomeFlag,
  fixMovementType,
  fixAllNullMovementType,
  fixIsSettlement,
  fixInvestmentBucket,
  getInvestmentBuckets,
  fixCategoryCode,
  getIncomeCategories,
  clearMovementType,
  clearAllUncategorizedIncome,
  fixExpenseGroup,
  addAdjustmentTransaction,
  getAuditLog,
  revertAuditChange,
} from '@/app/actions/audit-fix'
import type { AuditLogEntry } from '@/app/actions/audit-fix'
import type { AuditReport, AuditCheck, AuditIssue, AuditSeverity, DupeTxSnapshot } from '@/app/actions/audit'
import type { CustodioInfo, FlowData } from './page'

function fmtCRC(n: number) {
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

// ── Reconcile modal ────────────────────────────────────────────────────────

function ReconcileModal({
  custodio, leafEnvelopes, systemTotal, onClose,
}: {
  custodio: string
  leafEnvelopes: { id: string; name: string }[]
  systemTotal: number
  onClose: () => void
}) {
  const [realStr, setRealStr]   = useState('')
  const [targetId, setTargetId] = useState(leafEnvelopes[0]?.id ?? '')
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]       = useState('')
  const [applied, setApplied]   = useState(false)
  const [error, setError]       = useState('')
  const [isPending, start]      = useTransition()

  const real   = parseFloat(realStr.replace(/,/g, '')) || 0
  const hasVal = realStr.trim() !== ''
  const diff   = real - systemTotal

  function apply() {
    if (!diff || !targetId) return
    setError('')
    start(async () => {
      const type: 'deposito' | 'retiro' = diff > 0 ? 'deposito' : 'retiro'
      const res = await addMovement(targetId, {
        date, amount: Math.abs(diff), type,
        notes: notes.trim() || `Ajuste cuadre ${custodio} ${date}`,
      })
      if (res?.error) { setError(res.error); return }
      setApplied(true)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full sm:max-w-sm bg-zinc-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-2xl">
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

        <div className="flex items-center justify-between bg-white/[0.04] rounded-xl px-4 py-3">
          <span className="text-xs text-zinc-500">Sistema (sobres)</span>
          <span className="text-sm font-black tabular-nums text-zinc-200">{fmtCRC(systemTotal)}</span>
        </div>

        <div className="space-y-1">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wide">Saldo real en banco</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">₡</span>
            <input
              type="number" inputMode="numeric" autoFocus
              value={realStr} onChange={e => setRealStr(e.target.value)}
              placeholder="0"
              className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl pl-8 pr-4 py-3 text-xl font-bold text-white focus:outline-none focus:border-white/30 tabular-nums placeholder-zinc-700"
            />
          </div>
        </div>

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

        {hasVal && Math.abs(diff) >= 1 && !applied && (
          <div className="space-y-3 border-t border-white/[0.06] pt-3">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wide">
              Aplicar ajuste de {fmtCRC(Math.abs(diff))} ({diff > 0 ? 'depósito faltante' : 'retiro no registrado'})
            </p>
            <div className="space-y-1">
              <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Sobre destino</p>
              <select value={targetId} onChange={e => setTargetId(e.target.value)}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40">
                {leafEnvelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Fecha</p>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a3e635]/40" />
              </div>
              <div className="space-y-1">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Notas</p>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Extracto…"
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-[#a3e635]/40" />
              </div>
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-sm text-zinc-400 hover:bg-white/[0.04]">Cancelar</button>
              <button onClick={apply} disabled={isPending || !targetId}
                className="flex-1 py-3 rounded-xl bg-[#a3e635] text-black text-sm font-black disabled:opacity-40">
                {isPending ? 'Aplicando…' : 'Aplicar ajuste'}
              </button>
            </div>
          </div>
        )}

        {(hasVal && Math.abs(diff) < 1 || applied) && (
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-lime-500/10 text-lime-400 text-sm font-black border border-lime-500/20">
            {applied ? '✓ Ajuste aplicado — cerrar' : '✓ Cerrar'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ title, subtitle, children, defaultOpen = true }: {
  title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl bg-[#0d120d] border border-white/[0.08] overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors text-left">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.16em]">{title}</p>
          {subtitle && <p className="text-[10px] text-zinc-600 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-zinc-600 text-[10px] ml-4 shrink-0">{open ? '−' : '+'}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

// ── Flow reconciliation section ────────────────────────────────────────────

function FlowSection({ flowData }: { flowData: FlowData }) {
  const [showIncome, setShowIncome]   = useState(false)
  const [showAdjust, setShowAdjust]   = useState(false)
  const [adjDate, setAdjDate]         = useState(new Date().toISOString().slice(0, 10))
  const [adjNotes, setAdjNotes]       = useState('')
  const [adjDone, setAdjDone]         = useState(false)
  const [adjError, setAdjError]       = useState('')
  const [adjPending, startAdj]        = useTransition()

  const { incomeRegular, incomeSettlement, expenseTotal, cashWithdrawals, ledgerNet, envelopeTotal, recentIncome } = flowData
  const gap = envelopeTotal - ledgerNet
  const gapAbs = Math.abs(gap)

  let gapColor  = 'text-lime-400', gapBg = 'bg-lime-500/10 border-lime-500/20'
  let gapLabel  = '✓ Flujos cuadrados'
  let gapDetail = 'El saldo del ledger coincide con los sobres.'
  if (gapAbs >= 1000) {
    if (gap > 0) {
      gapColor = 'text-amber-400'; gapBg = 'bg-amber-500/10 border-amber-500/20'
      gapLabel  = `+${fmtCRC(gap)} sin origen registrado`
      gapDetail = 'Hay dinero en sobres sin ingreso correspondiente (saldo inicial, transferencia no registrada, etc.).'
    } else {
      gapColor = 'text-rose-400'; gapBg = 'bg-rose-500/10 border-rose-500/20'
      gapLabel  = `${fmtCRC(gap)} de ingresos sin asignar a sobres`
      gapDetail = 'El sistema registra más ingresos/liquidaciones de los que aparecen en sobres. Puede haber dinero en cuentas bancarias no asignado a ningún sobre.'
    }
  }

  return (
    <div className="divide-y divide-white/[0.04]">
      <div className="px-4 py-1">
        {[
          { label: 'Ingresos regulares', sub: 'salario, alquiler, otros', val: incomeRegular, color: 'text-[#a3e635]' },
          { label: 'Liquidaciones e inversiones', sub: 'crypto, fondos, OPCs', val: incomeSettlement, color: 'text-[#a3e635]' },
          { label: 'Gastos registrados', sub: 'todos los egresos', val: -expenseTotal, color: 'text-rose-400' },
          ...(cashWithdrawals > 0 ? [{ label: 'Retiros de efectivo', sub: '', val: -cashWithdrawals, color: 'text-rose-400' }] : []),
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
            <div>
              <p className="text-xs text-zinc-400">{row.label}</p>
              {row.sub && <p className="text-[9px] text-zinc-600">{row.sub}</p>}
            </div>
            <span className={`text-sm font-black tabular-nums ml-4 ${row.color}`}>{fmtCRC(row.val)}</span>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 flex items-center justify-between bg-white/[0.02]">
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Saldo neto del ledger</p>
        <span className={`text-sm font-black tabular-nums ${ledgerNet >= 0 ? 'text-zinc-200' : 'text-rose-400'}`}>{fmtCRC(ledgerNet)}</span>
      </div>

      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Saldo en sobres</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">Suma de movimientos (sin intereses)</p>
        </div>
        <span className="text-sm font-black tabular-nums text-amber-400">{fmtCRC(envelopeTotal)}</span>
      </div>

      <div className={`mx-4 my-3 rounded-xl border px-4 py-3 space-y-1 ${gapBg}`}>
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400">Brecha</p>
          <span className={`text-sm font-black tabular-nums ${gapColor}`}>{gapLabel}</span>
        </div>
        <p className="text-[10px] text-zinc-500">{gapDetail}</p>

        {gapAbs >= 1000 && !adjDone && (
          showAdjust ? (
            <div className="border-t border-white/[0.08] pt-3 mt-2 space-y-2">
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-wide">
                Ajuste: <span className="text-zinc-200">{gap > 0 ? 'Ingreso' : 'Egreso'} no identificado</span>
                {' · '}<span className="tabular-nums">{fmtCRC(gapAbs)}</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Fecha</p>
                  <input type="date" value={adjDate} onChange={e => setAdjDate(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.10] rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-white/25" />
                </div>
                <div>
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Notas (opcional)</p>
                  <input type="text" value={adjNotes} onChange={e => setAdjNotes(e.target.value)}
                    placeholder="Ajuste de cuadre…"
                    className="w-full bg-white/[0.06] border border-white/[0.10] rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-zinc-700 focus:outline-none focus:border-white/25" />
                </div>
              </div>
              {adjError && <p className="text-[10px] text-rose-400">{adjError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAdjError('')
                    startAdj(async () => {
                      const r = await addAdjustmentTransaction({
                        amount: gapAbs,
                        movementType: gap > 0 ? 'income' : 'expense',
                        date: adjDate,
                        notes: adjNotes.trim() || undefined,
                      })
                      if ('error' in r && r.error) { setAdjError(r.error); return }
                      setShowAdjust(false)
                      setAdjDone(true)
                    })
                  }}
                  disabled={adjPending}
                  className="px-3 py-1.5 rounded-lg bg-[#a3e635] text-black text-[11px] font-black disabled:opacity-40 transition-opacity">
                  {adjPending ? '…' : 'Crear ajuste'}
                </button>
                <button onClick={() => setShowAdjust(false)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-zinc-400 text-[11px] hover:text-zinc-200 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdjust(true)}
              className="mt-1 text-[10px] font-black text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2 decoration-dotted">
              + Registrar {gap > 0 ? 'ingreso' : 'egreso'} no identificado para cuadrar
            </button>
          )
        )}

        {adjDone && (
          <p className="text-[10px] text-lime-400 mt-1 font-medium">
            ✓ Ajuste creado — recargá la página para ver el cuadre actualizado
          </p>
        )}
      </div>

      <button onClick={() => setShowIncome(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Ingresos recientes registrados</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">Últimos 30 — verificá que todo esté</p>
        </div>
        <span className="text-zinc-600 text-[10px] ml-4 shrink-0">{showIncome ? '−' : '+'}</span>
      </button>
      {showIncome && (
        <div>
          {recentIncome.length === 0 ? (
            <p className="px-4 py-3 text-[10px] text-zinc-600">Sin ingresos registrados.</p>
          ) : recentIncome.map(tx => (
            <div key={tx.id} className="flex items-center justify-between px-4 py-2 border-b border-white/[0.03] last:border-0">
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-[11px] text-zinc-300 truncate">{tx.concept || tx.vendor || '—'}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-zinc-600">{tx.date}</span>
                  {tx.is_settlement && (
                    <span className="text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">Liquidación</span>
                  )}
                </div>
              </div>
              <span className="text-[11px] font-bold tabular-nums text-[#a3e635] shrink-0">{fmtCRC(tx.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Fix types ──────────────────────────────────────────────────────────────

type FixVariant = 'lime' | 'rose' | 'amber' | 'zinc'

type FixAction = {
  label: string
  value: string
  variant?: FixVariant
}

type SelectAction = {
  label: string
  placeholder: string
  loadOptions: () => Promise<{ value: string; label: string }[]>
  onApply: (value: string, ids: string[]) => Promise<{ error?: string }>
}

type FixConfig = {
  actions: FixAction[]
  onApply: (action: string, ids: string[]) => Promise<{ error?: string }>
  onFixAll?: (action: string) => Promise<{ error?: string }>
  fixAllLabel?: string
  selectAction?: SelectAction
}

const VARIANT_CLS: Record<FixVariant, string> = {
  lime:  'bg-lime-500/20  text-lime-400  hover:bg-lime-500/30',
  rose:  'bg-rose-500/20  text-rose-400  hover:bg-rose-500/30',
  amber: 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30',
  zinc:  'bg-white/[0.08] text-zinc-300  hover:bg-white/[0.12]',
}

// ── Duplicate comparison panel ────────────────────────────────────────────

function DuplicateComparePanel({
  orig, dupe, onDeleted,
}: {
  orig: DupeTxSnapshot
  dupe: DupeTxSnapshot
  onDeleted: () => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [isPending, start]        = useTransition()
  const [error, setError]         = useState('')

  const fmtCreated = (ts: string) => ts
    ? new Date(ts).toLocaleString('es-CR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

  function handleDelete(id: string) {
    setError('')
    start(async () => {
      const r = await deleteTransactions([id])
      if ('error' in r && r.error) { setError(r.error); return }
      onDeleted()
    })
  }

  // Only show fields that can actually differ (the key fields are identical by definition)
  const cmpRows: { label: string; ov: string; dv: string }[] = [
    { label: 'Ingresado', ov: fmtCreated(orig.created_at), dv: fmtCreated(dupe.created_at) },
    { label: 'Notas',     ov: orig.notes ?? '—',           dv: dupe.notes ?? '—'           },
    { label: 'Liquid.',   ov: orig.is_settlement ? 'Sí' : 'No', dv: dupe.is_settlement ? 'Sí' : 'No' },
  ]

  return (
    <div className="ml-9 mr-4 mb-2.5 rounded-lg border border-white/[0.08] overflow-hidden text-[10px]">
      {/* Shared fields header */}
      <div className="px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-zinc-500 truncate">
        {[orig.vendor, orig.concept, orig.date, fmtCRC(orig.amount)].filter(Boolean).join(' · ')}
      </div>

      {/* Compact comparison table */}
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.04]">
            <th className="px-3 py-1 text-left text-[9px] text-zinc-600 font-black uppercase tracking-wide w-20" />
            <th className="px-3 py-1 text-left text-[9px] text-zinc-500 font-black uppercase tracking-wide">Original</th>
            <th className="px-3 py-1 text-left text-[9px] text-amber-400/60 font-black uppercase tracking-wide">Duplicado</th>
          </tr>
        </thead>
        <tbody>
          {cmpRows.map(({ label, ov, dv }) => {
            const differ = ov !== dv
            return (
              <tr key={label} className={`border-b border-white/[0.03] last:border-0 ${differ ? 'bg-amber-500/[0.05]' : ''}`}>
                <td className="px-3 py-1 text-zinc-600 font-black uppercase tracking-wide text-[9px]">{label}</td>
                <td className="px-3 py-1 text-zinc-400 tabular-nums">{ov}</td>
                <td className={`px-3 py-1 tabular-nums ${differ ? 'text-amber-300 font-medium' : 'text-zinc-400'}`}>{dv}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Delete buttons */}
      <div className="flex border-t border-white/[0.06]">
        {confirmId === orig.id ? (
          <div className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5">
            <span className="text-zinc-500">¿Eliminar original?</span>
            <button onClick={() => handleDelete(orig.id)} disabled={isPending}
              className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-black disabled:opacity-40">
              {isPending ? '…' : 'Sí'}
            </button>
            <button onClick={() => setConfirmId(null)} className="text-zinc-600 hover:text-zinc-400">No</button>
          </div>
        ) : (
          <button onClick={() => setConfirmId(orig.id)} disabled={isPending}
            className="flex-1 px-3 py-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/[0.06] transition-colors text-center">
            Elim. original
          </button>
        )}
        <div className="w-px bg-white/[0.06]" />
        {confirmId === dupe.id ? (
          <div className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5">
            <span className="text-zinc-500">¿Eliminar duplicado?</span>
            <button onClick={() => handleDelete(dupe.id)} disabled={isPending}
              className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-black disabled:opacity-40">
              {isPending ? '…' : 'Sí'}
            </button>
            <button onClick={() => setConfirmId(null)} className="text-zinc-600 hover:text-zinc-400">No</button>
          </div>
        ) : (
          <button onClick={() => setConfirmId(dupe.id)} disabled={isPending}
            className="flex-1 px-3 py-1.5 font-black text-rose-400 hover:bg-rose-500/[0.08] transition-colors text-center">
            Elim. duplicado
          </button>
        )}
      </div>
      {error && <p className="px-3 py-1 text-rose-400">{error}</p>}
    </div>
  )
}

// ── Audit log section ─────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  movement_type:       'Tipo',
  amount:              'Monto',
  date:                'Fecha',
  vendor:              'Comercio',
  concept:             'Concepto',
  expense_group:       'Grupo',
  is_passive_income:   'Pasivo',
  is_settlement:       'Liquidación',
  is_survival_expense: 'Supervivencia',
  category_code:       'Categoría',
  notes:               'Notas',
  investment_bucket_id:'Bucket',
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  return String(v)
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'ahora'
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

function AuditLogSection() {
  const [entries, setEntries]   = useState<AuditLogEntry[] | null>(null)
  const [loading, startLoad]    = useTransition()
  const [reverting, startRevert]= useTransition()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError]       = useState('')

  function load() {
    setError('')
    startLoad(async () => {
      const r = await getAuditLog(150)
      if ('error' in r) { setError(r.error); return }
      setEntries(r.entries)
    })
  }

  function doRevert(logId: string) {
    setError('')
    startRevert(async () => {
      const r = await revertAuditChange(logId)
      if (r.error) { setError(r.error); return }
      setConfirmId(null)
      // Refresh log
      const r2 = await getAuditLog(150)
      if (!('error' in r2)) setEntries(r2.entries)
    })
  }

  return (
    <div className="space-y-3">
      {entries === null ? (
        <button onClick={load} disabled={loading}
          className="w-full py-2.5 rounded-xl border border-dashed border-white/[0.08] text-[11px] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.14] transition-colors disabled:opacity-40">
          {loading ? 'Cargando…' : 'Cargar historial de cambios'}
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-zinc-600">{entries.length} cambio{entries.length !== 1 ? 's' : ''} recientes</p>
            <button onClick={load} disabled={loading}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40">
              {loading ? '…' : 'Actualizar'}
            </button>
          </div>
          {entries.length === 0 ? (
            <p className="text-[10px] text-zinc-700 text-center py-4">Sin cambios registrados todavía.</p>
          ) : (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
              {entries.map(e => (
                <div key={e.id} className={`px-4 py-2.5 ${e.operation === 'DELETE' ? 'bg-rose-500/[0.04]' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Transaction context */}
                      <p className="text-[11px] text-zinc-300 truncate">
                        {e.concept || e.vendor || e.transaction_id.slice(0, 8)}
                        {e.date ? <span className="text-zinc-600 ml-1.5">{e.date}</span> : null}
                      </p>
                      {/* Changed fields */}
                      {e.operation === 'DELETE' ? (
                        <p className="text-[10px] text-rose-400 mt-0.5">Eliminada</p>
                      ) : (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {(e.changed_fields ?? []).map(f => (
                            <span key={f} className="text-[10px] text-zinc-500">
                              <span className="text-zinc-600">{FIELD_LABELS[f] ?? f}: </span>
                              <span className="text-rose-400/80 line-through">{fmtVal(e.old_data?.[f])}</span>
                              <span className="text-zinc-600 mx-1">→</span>
                              <span className="text-lime-400/80">{fmtVal(e.new_data?.[f])}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      <p className="text-[10px] text-zinc-700">{timeAgo(e.changed_at)}</p>
                      {e.operation === 'UPDATE' && (
                        confirmId === e.id ? (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => doRevert(e.id)} disabled={reverting}
                              className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-black disabled:opacity-40">
                              {reverting ? '…' : 'Sí'}
                            </button>
                            <button onClick={() => setConfirmId(null)} className="text-[10px] text-zinc-600 hover:text-zinc-400">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmId(e.id)}
                            className="text-[10px] text-zinc-600 hover:text-amber-400 transition-colors">
                            Deshacer
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {error && <p className="text-[10px] text-rose-400">{error}</p>}
    </div>
  )
}

// ── Transaction detail panel ───────────────────────────────────────────────

function TxDetailPanel({
  issue, fix, onFixed, onIgnore,
}: {
  issue: AuditIssue
  fix?: FixConfig
  onFixed?: () => void
  onIgnore?: () => void
}) {
  const [applying, start]   = useTransition()
  const [err, setErr]       = useState('')
  const [selOptions, setSelOptions] = useState<{ value: string; label: string }[] | null>(null)
  const [selValue, setSelValue]     = useState('')
  const tx = issue.txData
  if (!tx) return null

  function apply(action: string) {
    if (!fix) return
    setErr('')
    start(async () => {
      const r = await fix.onApply(action, [issue.id])
      if (r?.error) { setErr(r.error); return }
      onFixed?.()
    })
  }

  function openSelect() {
    if (!fix?.selectAction || selOptions !== null) return
    fix.selectAction.loadOptions().then(opts => {
      setSelOptions(opts)
      const text = `${tx?.vendor ?? ''} ${tx?.concept ?? ''} ${tx?.notes ?? ''}`.toLowerCase()
      // Keyword-based suggestion first
      const keyword = (
        // More-specific crypto/farming before generic investment
        /farming|anchor|nodos|hodl/.test(text)                   ? opts.find(o => o.value === 'INVESTMENT_RETURN_CRYPTO') :
        /miner[ií]a|mining|ethereum|gpu/.test(text)              ? opts.find(o => o.value === 'INVESTMENT_RETURN_MINING') :
        // Liquidations — capital vs returns
        /liquidaci[oó]n.*laboral|liquidaci[oó]n.*laboral/.test(text) ? opts.find(o => o.value === 'LABOR_SETTLEMENT') :
        /liquidaci[oó]n.*ahorro|ahorro.*liquidaci[oó]n/.test(text)   ? opts.find(o => o.value === 'SAVINGS_LIQUIDATION') :
        /liquidaci[oó]n.*rendimiento|rendimiento.*liquidaci[oó]n/.test(text) ? opts.find(o => o.value === 'INVESTMENT_RETURN_LIQUID') :
        /liquidaci[oó]n/.test(text)                              ? opts.find(o => o.value === 'INVESTMENT_LIQUIDATION') :
        /aumento.*valor|plusval[ií]a/.test(text)                 ? opts.find(o => o.value === 'APPRECIATION') :
        // Rendimientos / returns
        /rendimiento|yield/.test(text)                           ? opts.find(o => o.value === 'INVESTMENT_RETURN') :
        // Interest / savings
        /excedente/.test(text)                                   ? opts.find(o => o.value === 'SAVINGS_EXCEDENTES') :
        /inter[eé]s.*ahorro|cdp|scotiabank/.test(text)          ? opts.find(o => o.value === 'SAVINGS_INTEREST') :
        /inter[eé]s/.test(text)                                  ? opts.find(o => o.value === 'INTEREST') :
        // Labor income
        /salario|sueldo/.test(text)                              ? opts.find(o => o.value === 'SALARY') :
        /aguinaldo/.test(text)                                   ? opts.find(o => o.value === 'AGUINALDO') :
        /vi[aá]tico|fcl|bono|freelance/.test(text)              ? opts.find(o => o.value === 'WORK_OTHER') :
        // Other
        /reembolso/.test(text)                                   ? opts.find(o => o.value === 'REIMBURSEMENT') :
        /alquiler|renta/.test(text)                              ? opts.find(o => o.value === 'RENTAL_INCOME') :
        /pr[eé]stamo/.test(text)                                 ? opts.find(o => o.value === 'LOAN_RECEIVED') :
        null
      )
      // Fallback: substring match on label
      const fallback = keyword ?? opts.find(o => {
        const lbl = o.label.toLowerCase()
        return text.split(' ').some(w => w.length > 3 && lbl.includes(w))
      })
      setSelValue(fallback?.value ?? opts[0]?.value ?? '')
    })
  }

  function applySelect() {
    if (!fix?.selectAction || !selValue) return
    setErr('')
    start(async () => {
      const r = await fix.selectAction!.onApply(selValue, [issue.id])
      if (r?.error) { setErr(r.error); return }
      onFixed?.()
    })
  }

  const rows: { label: string; value: string }[] = [
    tx.movement_type     && { label: 'Tipo',        value: tx.movement_type },
    tx.expense_group && tx.expense_group !== 'na'
                         && { label: 'Grupo',       value: tx.expense_group },
    tx.category_code     && { label: 'Categoría',   value: tx.category_code },
    tx.is_passive_income && { label: 'Pasivo',      value: 'Sí' },
    tx.is_settlement     && { label: 'Liquidación', value: 'Sí' },
    tx.notes             && { label: 'Notas',       value: tx.notes },
    tx.vendor            && { label: 'Comercio',    value: tx.vendor },
    tx.concept           && { label: 'Concepto',    value: tx.concept },
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <div className="ml-9 mr-4 mb-2.5 rounded-lg border border-white/[0.08] overflow-hidden text-[10px]">
      {rows.length > 0 && (
        <div className="px-3 py-2 grid grid-cols-2 gap-x-6 gap-y-1 bg-white/[0.02]">
          {rows.map(r => (
            <div key={r.label} className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[9px] font-black text-zinc-600 uppercase tracking-wide shrink-0">{r.label}</span>
              <span className="text-zinc-300 truncate">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {(fix || onIgnore) && (
        <div className="flex flex-wrap gap-2 px-3 py-2 border-t border-white/[0.06] bg-black/10">
          {fix?.actions.map(a => (
            <button key={a.value} onClick={() => apply(a.value)} disabled={applying}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors disabled:opacity-40 ${VARIANT_CLS[a.variant ?? 'zinc']}`}>
              {applying ? '…' : a.label}
            </button>
          ))}
          {fix?.selectAction && (
            selOptions === null ? (
              <button onClick={openSelect}
                className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-lime-500/20 text-lime-400 hover:bg-lime-500/30 transition-colors">
                {fix.selectAction.label}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <select value={selValue} onChange={e => setSelValue(e.target.value)}
                  className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-white/30 max-w-[200px]">
                  {selOptions.length === 0
                    ? <option value="">Sin opciones</option>
                    : selOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                  }
                </select>
                <button onClick={applySelect} disabled={applying || !selValue}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-lime-500/20 text-lime-400 hover:bg-lime-500/30 disabled:opacity-40 transition-colors">
                  {applying ? '…' : 'Asignar'}
                </button>
                <button onClick={() => setSelOptions(null)}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">✕</button>
                <a href="/configuracion" target="_blank"
                  className="text-[9px] text-zinc-700 hover:text-zinc-400 transition-colors underline underline-offset-2 decoration-dotted ml-1">
                  + crear bucket
                </a>
              </div>
            )
          )}
          {onIgnore && (
            <button onClick={onIgnore}
              className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-white/[0.05] text-zinc-500 hover:text-zinc-300 transition-colors ml-auto">
              Ignorar
            </button>
          )}
        </div>
      )}
      {err && <p className="px-3 py-1 text-rose-400">{err}</p>}
    </div>
  )
}

// ── Audit check card ───────────────────────────────────────────────────────

const SEV_META: Record<AuditSeverity, { dot: string; badge: string; border: string; head: string }> = {
  error:   { dot: 'bg-rose-400',  badge: 'bg-rose-500/15 text-rose-400',    border: 'border-rose-500/20',  head: 'bg-rose-500/[0.05]'  },
  warning: { dot: 'bg-amber-400', badge: 'bg-amber-500/15 text-amber-400',  border: 'border-amber-500/20', head: 'bg-amber-500/[0.05]' },
  info:    { dot: 'bg-blue-400',  badge: 'bg-blue-500/15 text-blue-400',    border: 'border-blue-500/20',  head: 'bg-blue-500/[0.05]'  },
  ok:      { dot: 'bg-lime-400',  badge: 'bg-lime-500/15 text-lime-400',    border: 'border-white/[0.06]', head: 'bg-white/[0.02]'     },
}

function CheckCard({
  check, fix, onFixed, onIgnore, ignoredTxIds, onIgnoreTxs,
}: {
  check: AuditCheck
  fix?: FixConfig
  onFixed?: () => void
  onIgnore?: () => void
  ignoredTxIds?: Set<string>
  onIgnoreTxs?: (ids: string[]) => void
}) {
  const [open, setOpen]             = useState(check.severity !== 'ok' && check.count > 0)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [applying, startApply]      = useTransition()
  const [fixError, setFixError]     = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bulkSelOpts, setBulkSelOpts] = useState<{ value: string; label: string }[] | null>(null)
  const [bulkSelVal, setBulkSelVal]   = useState('')

  const m              = SEV_META[check.severity]
  const visibleIssues  = ignoredTxIds ? check.issues.filter(i => !ignoredTxIds.has(i.id)) : check.issues
  const ignoredCount   = check.issues.length - visibleIssues.length
  const allChecked     = visibleIssues.length > 0 && selected.size === visibleIssues.length

  function toggle(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(visibleIssues.map(i => i.id)))
  }

  function applyFix(action: string, ids: string[]) {
    if (!ids.length || !fix) return
    setFixError('')
    if (action === 'suggested') {
      // Group by each issue's suggestedType, then call onApply per group
      const groups = new Map<string, string[]>()
      for (const id of ids) {
        const t = check.issues.find(i => i.id === id)?.suggestedType ?? 'expense'
        if (!groups.has(t)) groups.set(t, [])
        groups.get(t)!.push(id)
      }
      startApply(async () => {
        for (const [type, groupIds] of groups) {
          const r = await fix.onApply(type, groupIds)
          if (r?.error) { setFixError(r.error); return }
        }
        setSelected(new Set())
        onFixed?.()
      })
      return
    }
    startApply(async () => {
      const r = await fix.onApply(action, ids)
      if (r?.error) { setFixError(r.error); return }
      setSelected(new Set())
      onFixed?.()
    })
  }

  function applyFixAll(action: string) {
    if (!fix?.onFixAll) return
    setFixError('')
    startApply(async () => {
      const r = await fix.onFixAll!(action)
      if (r?.error) { setFixError(r.error); return }
      setSelected(new Set())
      onFixed?.()
    })
  }

  return (
    <div className={`rounded-xl border ${m.border} overflow-hidden`}>
      <div className={`flex items-stretch ${m.head}`}>
        <button onClick={() => setOpen(v => !v)}
          className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-zinc-200">{check.label}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{check.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {check.count > 0 && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${m.badge}`}>{check.count}</span>
            )}
            {check.severity === 'ok' && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-lime-500/15 text-lime-400">✓</span>
            )}
            <span className="text-zinc-600 text-[10px]">{open ? '−' : '+'}</span>
          </div>
        </button>
        {onIgnore && (
          <button
            onClick={onIgnore}
            title="No mostrar más este check"
            className="shrink-0 px-3 border-l border-white/[0.06] text-[9px] font-black text-zinc-700 hover:text-zinc-400 uppercase tracking-wide transition-colors"
          >
            Ignorar
          </button>
        )}
      </div>

      {open && visibleIssues.length > 0 && (
        <div className="border-t border-white/[0.04]">

          {fix && (
            <div className="flex items-center gap-3 px-4 py-2 bg-white/[0.02] border-b border-white/[0.04]">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                className="w-3.5 h-3.5 rounded accent-[#a3e635] cursor-pointer"
              />
              <span className="text-[10px] text-zinc-500 select-none">
                {selected.size > 0
                  ? `${selected.size} de ${visibleIssues.length} seleccionados`
                  : `Seleccionar los ${visibleIssues.length} mostrados`}
              </span>
              {ignoredCount > 0 && (
                <span className="text-[10px] text-zinc-700 ml-auto">{ignoredCount} ignorada{ignoredCount !== 1 ? 's' : ''}</span>
              )}
            </div>
          )}

          {visibleIssues.map((issue, i) => (
            <div key={issue.id + i} className="border-b border-white/[0.03] last:border-0">
              <div
                className={`flex items-start gap-3 px-4 py-2.5 ${issue.txData && !issue.dupeMeta ? 'cursor-pointer hover:bg-white/[0.02] transition-colors' : ''}`}
                onClick={() => { if (issue.txData && !issue.dupeMeta) setExpandedId(prev => prev === issue.id ? null : issue.id) }}
              >
                {fix && (
                  <input
                    type="checkbox"
                    checked={selected.has(issue.id)}
                    onChange={e => { e.stopPropagation(); toggle(issue.id) }}
                    onClick={e => e.stopPropagation()}
                    className="mt-0.5 w-3.5 h-3.5 rounded accent-[#a3e635] cursor-pointer shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-zinc-300">{issue.description}</p>
                  {issue.suggestedType && (
                    <p className="text-[10px] mt-0.5">
                      <span className="text-zinc-600">sugerido: </span>
                      <span className={
                        issue.suggestedType === 'income'           ? 'text-lime-400 font-bold' :
                        issue.suggestedType === 'cash_withdrawal'  ? 'text-amber-400 font-bold' :
                                                                     'text-rose-400 font-bold'
                      }>
                        {issue.suggestedType === 'income' ? 'ingreso' : issue.suggestedType === 'cash_withdrawal' ? 'retiro' : 'gasto'}
                      </span>
                    </p>
                  )}
                  {issue.action && !issue.suggestedType && <p className="text-[10px] text-zinc-600 mt-0.5">→ {issue.action}</p>}
                </div>
                <div className="shrink-0 text-right flex items-start gap-2">
                  <div>
                    {issue.date && <p className="text-[10px] text-zinc-600">{issue.date}</p>}
                    {issue.amount !== undefined && issue.amount !== 0 && (
                      <p className="text-[11px] font-bold tabular-nums text-zinc-400">{fmtCRC(issue.amount)}</p>
                    )}
                  </div>
                  {issue.txData && !issue.dupeMeta && (
                    <span className="text-[10px] text-zinc-600 mt-0.5 select-none">
                      {expandedId === issue.id ? '▴' : '▾'}
                    </span>
                  )}
                </div>
              </div>
              {issue.dupeMeta && (
                <DuplicateComparePanel
                  orig={issue.dupeMeta.orig}
                  dupe={issue.dupeMeta.dupe}
                  onDeleted={() => onFixed?.()}
                />
              )}
              {expandedId === issue.id && !issue.dupeMeta && (
                <TxDetailPanel
                  issue={issue}
                  fix={fix}
                  onFixed={() => { setExpandedId(null); onFixed?.() }}
                  onIgnore={onIgnoreTxs ? () => { setExpandedId(null); onIgnoreTxs([issue.id]) } : undefined}
                />
              )}
            </div>
          ))}

          {selected.size > 0 && (
            <div className="flex items-center flex-wrap gap-2 px-4 py-3 bg-white/[0.04] border-t border-white/[0.06]">
              <span className="text-[10px] text-zinc-400 mr-auto">
                {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
              </span>
              {fix?.actions.map(a => (
                <button
                  key={a.value}
                  onClick={() => applyFix(a.value, [...selected])}
                  disabled={applying}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors disabled:opacity-40 ${VARIANT_CLS[a.variant ?? 'zinc']}`}
                >
                  {applying ? '…' : a.label}
                </button>
              ))}
              {fix?.selectAction && (
                bulkSelOpts === null ? (
                  <button
                    onClick={() => fix.selectAction!.loadOptions().then(opts => { setBulkSelOpts(opts); setBulkSelVal(opts[0]?.value ?? '') })}
                    disabled={applying}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-lime-500/20 text-lime-400 hover:bg-lime-500/30 disabled:opacity-40 transition-colors"
                  >
                    {fix.selectAction.label}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <select value={bulkSelVal} onChange={e => setBulkSelVal(e.target.value)}
                      className="bg-white/[0.08] border border-white/[0.14] rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-white/30 max-w-[180px]">
                      {bulkSelOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button
                      onClick={() => {
                        if (!bulkSelVal) return
                        startApply(async () => {
                          const r = await fix.selectAction!.onApply(bulkSelVal, [...selected])
                          if (r?.error) { setFixError(r.error); return }
                          setSelected(new Set())
                          setBulkSelOpts(null)
                          onFixed?.()
                        })
                      }}
                      disabled={applying || !bulkSelVal}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-lime-500/20 text-lime-400 hover:bg-lime-500/30 disabled:opacity-40 transition-colors"
                    >
                      {applying ? '…' : 'Aplicar'}
                    </button>
                    <button onClick={() => setBulkSelOpts(null)} className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">✕</button>
                  </div>
                )
              )}
              {onIgnoreTxs && (
                <button
                  onClick={() => { onIgnoreTxs([...selected]); setSelected(new Set()) }}
                  disabled={applying}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
                >
                  Ignorar
                </button>
              )}
              <button onClick={() => { setSelected(new Set()); setBulkSelOpts(null) }}
                className="px-2 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                Limpiar
              </button>
            </div>
          )}

          {fix?.onFixAll && (
            <div className="flex items-center flex-wrap gap-2 px-4 py-2.5 bg-black/20 border-t border-white/[0.04]">
              <span className="text-[9px] text-zinc-600 mr-auto">
                {fix.fixAllLabel ?? 'Corregir todos (incluye no mostrados)'}
              </span>
              {fix.actions.map(a => (
                <button
                  key={a.value}
                  onClick={() => applyFixAll(a.value)}
                  disabled={applying}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors disabled:opacity-40 ${VARIANT_CLS[a.variant ?? 'zinc']}`}
                >
                  {applying ? '…' : `Todos → ${a.label}`}
                </button>
              ))}
            </div>
          )}

          {fixError && (
            <p className="px-4 py-2 text-[10px] text-rose-400 border-t border-rose-500/10 bg-rose-500/[0.04]">
              {fixError}
            </p>
          )}
        </div>
      )}

      {open && check.count === 0 && check.severity === 'ok' && (
        <div className="px-4 py-2.5 border-t border-white/[0.04]">
          <p className="text-[10px] text-lime-600">Sin problemas encontrados.</p>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function AuditView({ custodios, flowData }: {
  custodios: CustodioInfo[]
  flowData: FlowData
}) {
  const [report, setReport]           = useState<AuditReport | null>(null)
  const [auditError, setAuditError]   = useState<string | null>(null)
  const [isPending, start]            = useTransition()
  const [reconciling, setReconciling] = useState<string | null>(null)
  const [dismissed, setDismissed]     = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem('audit-dismissed-checks')
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })
  const [ignoredTxIds, setIgnoredTxIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem('audit-ignored-tx-ids')
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })

  function dismissCheck(id: string) {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem('audit-dismissed-checks', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function resetDismissed() {
    setDismissed(new Set())
    try { localStorage.removeItem('audit-dismissed-checks') } catch {}
  }

  function ignoreTxs(ids: string[]) {
    setIgnoredTxIds(prev => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      try { localStorage.setItem('audit-ignored-tx-ids', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function resetIgnoredTxs() {
    setIgnoredTxIds(new Set())
    try { localStorage.removeItem('audit-ignored-tx-ids') } catch {}
  }

  function runAuditAction() {
    setAuditError(null)
    start(async () => {
      const res = await runAudit([...ignoredTxIds])
      if ('error' in res) { setAuditError(res.error); return }
      setReport(res)
    })
  }

  const fixConfigs: Record<string, FixConfig> = {
    duplicates: {
      actions: [{ label: 'Eliminar duplicado', value: 'delete', variant: 'rose' }],
      onApply: async (_, ids) => {
        const r = await deleteTransactions(ids)
        return 'error' in r ? r : {}
      },
    },
    uncategorized_expenses: {
      actions: [
        { label: 'Personal',    value: 'personal',              variant: 'zinc' },
        { label: 'Necesario',   value: 'necesario',             variant: 'zinc' },
        { label: 'Objetivos',   value: 'objetivos_financieros', variant: 'lime' },
      ],
      onApply: async (action, ids) => {
        const r = await fixExpenseGroup(ids, action)
        return 'error' in r ? r : {}
      },
    },
    passive_income_flag: {
      actions: [{ label: 'Marcar como pasivo', value: 'mark', variant: 'lime' }],
      onApply: async (_, ids) => {
        const r = await fixPassiveIncomeFlag(ids)
        return 'error' in r ? r : {}
      },
    },
    null_movement_type: {
      actions: [
        { label: 'Aplicar sugeridos', value: 'suggested', variant: 'amber' },
        { label: 'Ingreso',           value: 'income',    variant: 'lime'  },
        { label: 'Gasto',             value: 'expense',   variant: 'rose'  },
        { label: 'Eliminar',          value: 'delete',    variant: 'zinc'  },
      ],
      onApply: async (action, ids) => {
        if (action === 'delete') { const r = await deleteTransactions(ids); return 'error' in r ? r : {} }
        const r = await fixMovementType(ids, action)
        return 'error' in r ? r : {}
      },
      onFixAll: async (action) => {
        const r = await fixAllNullMovementType(action)
        return 'error' in r ? r : {}
      },
      fixAllLabel: 'Corregir todos los que tienen tipo nulo',
    },
    uncategorized_income: {
      actions: [
        { label: 'Gasto',         value: 'expense',         variant: 'rose'  },
        { label: 'Retiro',        value: 'cash_withdrawal', variant: 'amber' },
        { label: 'Limpiar tipo',  value: 'clear',           variant: 'zinc'  },
      ],
      onApply: async (action, ids) => {
        if (action === 'clear') {
          const r = await clearMovementType(ids)
          return 'error' in r ? r : {}
        }
        const r = await fixMovementType(ids, action)
        return 'error' in r ? r : {}
      },
      onFixAll: async (action) => {
        if (action === 'clear') {
          const r = await clearAllUncategorizedIncome()
          return 'error' in r ? r : {}
        }
        const r = await fixAllNullMovementType(action)
        return 'error' in r ? r : {}
      },
      fixAllLabel: 'Aplica a todos los income sin categoría (incluye no mostrados)',
      selectAction: {
        label: 'Asignar categoría',
        placeholder: 'Seleccioná categoría…',
        loadOptions: async () => {
          const cats = await getIncomeCategories()
          return cats.map(c => ({ value: c.code, label: c.name }))
        },
        onApply: async (code, ids) => {
          const r = await fixCategoryCode(ids, code)
          return 'error' in r ? r : {}
        },
      },
    },
    zero_amount: {
      actions: [{ label: 'Eliminar', value: 'delete', variant: 'rose' }],
      onApply: async (_, ids) => {
        const r = await deleteTransactions(ids)
        return 'error' in r ? r : {}
      },
    },
    anonymous_income: {
      actions: [
        { label: 'Gasto',        value: 'expense',         variant: 'rose'  },
        { label: 'Retiro',       value: 'cash_withdrawal', variant: 'amber' },
        { label: 'Limpiar tipo', value: 'clear',           variant: 'zinc'  },
        { label: 'Eliminar',     value: 'delete',          variant: 'rose'  },
      ],
      onApply: async (action, ids) => {
        if (action === 'delete') { const r = await deleteTransactions(ids); return 'error' in r ? r : {} }
        if (action === 'clear')  { const r = await clearMovementType(ids);  return 'error' in r ? r : {} }
        const r = await fixMovementType(ids, action)
        return 'error' in r ? r : {}
      },
    },
    orphan_savings: {
      actions: [
        { label: 'Personal',  value: 'personal',  variant: 'zinc' },
        { label: 'Necesario', value: 'necesario', variant: 'zinc' },
        { label: 'Eliminar',  value: 'delete',    variant: 'rose' },
      ],
      onApply: async (action, ids) => {
        if (action === 'delete') { const r = await deleteTransactions(ids); return 'error' in r ? r : {} }
        const r = await fixExpenseGroup(ids, action)
        return 'error' in r ? r : {}
      },
    },
    income_not_in_envelope: {
      actions: [
        { label: 'Marcar liquidación', value: 'settle',   variant: 'amber' },
        { label: 'Limpiar tipo',       value: 'clear',    variant: 'zinc'  },
        { label: 'Eliminar',           value: 'delete',   variant: 'rose'  },
      ],
      onApply: async (action, ids) => {
        if (action === 'delete')  { const r = await deleteTransactions(ids);       return 'error' in r ? r : {} }
        if (action === 'clear')   { const r = await clearMovementType(ids);        return 'error' in r ? r : {} }
        if (action === 'settle')  { const r = await fixIsSettlement(ids, true);    return 'error' in r ? r : {} }
        return {}
      },
    },
    settlement_no_bucket: {
      actions: [
        { label: 'Desmarcar liquidación', value: 'unsettle', variant: 'zinc' },
      ],
      onApply: async (action, ids) => {
        if (action === 'unsettle') { const r = await fixIsSettlement(ids, false); return 'error' in r ? r : {} }
        return {}
      },
      selectAction: {
        label: 'Asignar bucket',
        placeholder: 'Seleccioná un bucket…',
        loadOptions: async () => {
          const buckets = await getInvestmentBuckets()
          return buckets.map(b => ({ value: b.id, label: b.name }))
        },
        onApply: async (bucketId, ids) => {
          const r = await fixInvestmentBucket(ids, bucketId)
          return 'error' in r ? r : {}
        },
      },
    },
  }

  const reconcilingInfo = custodios.find(c => c.name === reconciling)

  const errorChecks    = report?.checks.filter(c => c.severity === 'error'   && c.count > 0 && !dismissed.has(c.id)) ?? []
  const warningChecks  = report?.checks.filter(c => c.severity === 'warning'  && c.count > 0 && !dismissed.has(c.id)) ?? []
  const infoChecks     = report?.checks.filter(c => c.severity === 'info'     && c.count > 0 && !dismissed.has(c.id)) ?? []
  const okChecks       = report?.checks.filter(c => c.severity === 'ok'                      && !dismissed.has(c.id)) ?? []
  const dismissedChecks = report?.checks.filter(c => dismissed.has(c.id)) ?? []

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">

      <div>
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em]">Fire Oracle</p>
        <h1 className="text-2xl font-black text-white mt-0.5">Auditoría & Cuadre</h1>
        <p className="text-xs text-zinc-500 mt-1">Cuadre de flujos · Cuadre por cuenta · Auditoría de datos</p>
      </div>

      <Section title="Cuadre de flujos" subtitle="Ledger de transacciones vs saldo en sobres">
        <FlowSection flowData={flowData} />
      </Section>

      <Section title="Cuadre por cuenta" subtitle="Compará el saldo de cada custodio contra tu banco">
        <div className="p-4 space-y-2">
          {custodios.length === 0 ? (
            <p className="text-[10px] text-zinc-600 text-center py-4">Sin sobres configurados.</p>
          ) : custodios.map(c => (
            <div key={c.name} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
              <div>
                <p className="text-xs font-bold text-zinc-200">{c.name}</p>
                <p className="text-[10px] tabular-nums text-zinc-500">Sistema: {fmtCRC(c.systemTotal)}</p>
              </div>
              <button onClick={() => setReconciling(c.name)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-white/[0.06] text-zinc-400 text-[10px] font-black hover:bg-white/[0.10] transition-all">
                Cuadrar
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Historial de cambios" subtitle="Cambios recientes en transacciones — con opción de deshacer" defaultOpen={false}>
        <div className="p-4">
          <AuditLogSection />
        </div>
      </Section>

      <Section title="Auditoría de datos" subtitle="10 verificaciones automáticas de calidad" defaultOpen={false}>
        <div className="p-4 space-y-4">
          <button onClick={runAuditAction} disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#a3e635] text-black text-sm font-black disabled:opacity-50 hover:bg-[#b4f040] transition-colors">
            {isPending ? (
              <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Analizando…</>
            ) : (
              <>{report ? 'Re-ejecutar auditoría' : 'Ejecutar auditoría'}</>
            )}
          </button>

          {auditError && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400">{auditError}</div>
          )}

          {report && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className={`rounded-xl p-3 border ${report.total_errors > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Errores</p>
                  <p className={`text-2xl font-black mt-0.5 ${report.total_errors > 0 ? 'text-rose-400' : 'text-zinc-600'}`}>{report.total_errors}</p>
                </div>
                <div className={`rounded-xl p-3 border ${report.total_warnings > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Advertencias</p>
                  <p className={`text-2xl font-black mt-0.5 ${report.total_warnings > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>{report.total_warnings}</p>
                </div>
                <div className="rounded-xl p-3 border bg-white/[0.03] border-white/[0.06]">
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Checks</p>
                  <p className="text-2xl font-black mt-0.5 text-zinc-400">{report.checks.length}</p>
                </div>
              </div>

              <div className="space-y-4">
                {errorChecks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-rose-400/70 uppercase tracking-[0.16em]">Errores</p>
                    {errorChecks.map(c => (
                      <CheckCard key={c.id} check={c} fix={fixConfigs[c.id]} onFixed={runAuditAction} onIgnore={() => dismissCheck(c.id)} ignoredTxIds={ignoredTxIds} onIgnoreTxs={ignoreTxs} />
                    ))}
                  </div>
                )}
                {warningChecks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-amber-400/70 uppercase tracking-[0.16em]">Advertencias</p>
                    {warningChecks.map(c => (
                      <CheckCard key={c.id} check={c} fix={fixConfigs[c.id]} onFixed={runAuditAction} onIgnore={() => dismissCheck(c.id)} ignoredTxIds={ignoredTxIds} onIgnoreTxs={ignoreTxs} />
                    ))}
                  </div>
                )}
                {infoChecks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-blue-400/70 uppercase tracking-[0.16em]">Informativo</p>
                    {infoChecks.map(c => (
                      <CheckCard key={c.id} check={c} fix={fixConfigs[c.id]} onFixed={runAuditAction} onIgnore={() => dismissCheck(c.id)} ignoredTxIds={ignoredTxIds} onIgnoreTxs={ignoreTxs} />
                    ))}
                  </div>
                )}
                {okChecks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.16em]">Sin problemas</p>
                    {okChecks.map(c => <CheckCard key={c.id} check={c} onIgnore={() => dismissCheck(c.id)} ignoredTxIds={ignoredTxIds} onIgnoreTxs={ignoreTxs} />)}
                  </div>
                )}
                {(dismissedChecks.length > 0 || ignoredTxIds.size > 0) && (
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] divide-y divide-white/[0.04] overflow-hidden">
                    {dismissedChecks.length > 0 && (
                      <div className="flex items-center justify-between px-3 py-2">
                        <p className="text-[10px] text-zinc-600">
                          {dismissedChecks.length} check{dismissedChecks.length !== 1 ? 's' : ''} ignorado{dismissedChecks.length !== 1 ? 's' : ''}
                        </p>
                        <button onClick={resetDismissed}
                          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                          Restablecer
                        </button>
                      </div>
                    )}
                    {ignoredTxIds.size > 0 && (
                      <div className="flex items-center justify-between px-3 py-2">
                        <p className="text-[10px] text-zinc-600">
                          {ignoredTxIds.size} tx{ignoredTxIds.size !== 1 ? 's' : ''} ignorada{ignoredTxIds.size !== 1 ? 's' : ''}
                        </p>
                        <button onClick={resetIgnoredTxs}
                          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                          Restablecer
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[9px] text-zinc-700 text-center pt-2">
                  Ejecutado {new Date(report.ran_at).toLocaleString('es-CR')}
                </p>
              </div>
            </>
          )}

          {!report && !isPending && (
            <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center space-y-1">
              <p className="text-zinc-500 text-sm font-semibold">Listo para auditar</p>
              <p className="text-zinc-700 text-xs">Duplicados · clasificaciones · flujo · coherencia entre módulos</p>
            </div>
          )}
        </div>
      </Section>

      {reconcilingInfo && (
        <ReconcileModal
          custodio={reconcilingInfo.name}
          leafEnvelopes={reconcilingInfo.leafEnvelopes}
          systemTotal={reconcilingInfo.systemTotal}
          onClose={() => setReconciling(null)}
        />
      )}
    </div>
  )
}
