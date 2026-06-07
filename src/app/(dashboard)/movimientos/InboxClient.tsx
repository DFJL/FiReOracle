'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  confirmInboxItem, discardInboxItem, insertManualInboxItem,
  reExtractInboxItem, batchConfirmHighConfidence, suggestCategory,
  upsertPaymentReminder, deletePaymentReminder,
} from '@/app/actions/inbox'
import type { InboxItem, ExtractedFields, PaymentReminder } from '@/app/actions/inbox'
import {
  CheckCircle, XCircle, Mail, Clock, ChevronDown, ChevronUp, Inbox,
  ClipboardPaste, Loader2, RefreshCw, Plus, Trash2, Bell, BellPlus,
  Sparkles, RotateCcw, CalendarClock,
} from 'lucide-react'

type Category = {
  code: string
  name: string
  category_type: string
  group_gasto: string | null
  is_passive_income: boolean
}

type ConnectedAccount = {
  id: string
  email: string
  provider: string
  connected_at: string | null
  last_synced_at: string | null
}

type Envelope = {
  id: string
  name: string
  color: string | null
}

type Loan = {
  id: string
  name: string
  lender: string | null
  currency_code: string | null
  current_balance: number | null
  payment_day: number | null
}

type Props = {
  items: InboxItem[]
  categories: Category[]
  connectedAccounts: ConnectedAccount[]
  envelopes: Envelope[]
  loans: Loan[]
  paymentReminders: PaymentReminder[]
  gmailStatus: string | null
}

const MOVEMENT_LABELS: Record<string, string> = {
  expense:         'Gasto',
  income:          'Ingreso',
  cash_withdrawal: 'Retiro',
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high:   'text-[#a3e635]',
  medium: 'text-amber-400',
  low:    'text-rose-400',
}

function fmtAmt(amount: number, currency: string) {
  const sym = currency === 'USD' ? '$' : '₡'
  return `${sym}${Math.round(amount).toLocaleString('es-CR')}`
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'hace un momento'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `hace ${days}d`
}

function nextDueDate(dueDay: number, today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), dueDay)
  if (d <= today) d.setMonth(d.getMonth() + 1)
  return d
}

function daysUntil(target: Date, today: Date): number {
  return Math.ceil((target.getTime() - today.setHours(0, 0, 0, 0)) / 86400000)
}

// ── ItemCard ─────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  categories,
  envelopes,
  loans,
}: {
  item: InboxItem
  categories: Category[]
  envelopes: Envelope[]
  loans: Loan[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(item.status === 'pending')
  const [err, setErr] = useState<string | null>(null)
  const [envelopeId, setEnvelopeId] = useState<string>('')
  const [loanId, setLoanId] = useState<string>('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [reExtracting, setReExtracting] = useState(false)

  const ext = item.extracted
  const [fields, setFields] = useState<ExtractedFields>(
    ext ?? {
      amount:        0,
      currency:      'CRC',
      vendor:        '',
      concept:       '',
      date:          new Date().toISOString().slice(0, 10),
      movement_type: 'expense',
      confidence:    'low',
    },
  )

  const isOld = item.email_date
    ? Date.now() - new Date(item.email_date).getTime() > 30 * 86400000
    : false

  function handleCategoryChange(code: string) {
    const cat = categories.find(c => c.code === code)
    setSuggestion(null)
    setFields(f => ({
      ...f,
      category_code:     code || undefined,
      expense_group:     cat?.group_gasto && cat.group_gasto !== 'na' ? cat.group_gasto : f.expense_group,
      is_passive_income: cat?.is_passive_income ?? f.is_passive_income,
    }))
  }

  async function handleSuggestCategory() {
    if (!fields.vendor) return
    setSuggesting(true)
    const code = await suggestCategory(fields.vendor)
    setSuggesting(false)
    if (code) {
      setSuggestion(code)
      handleCategoryChange(code)
    } else {
      setSuggestion('')
    }
  }

  async function handleReExtract() {
    setReExtracting(true)
    setErr(null)
    const res = await reExtractInboxItem(item.id)
    setReExtracting(false)
    if (res.error) setErr(res.error)
    else router.refresh()
  }

  function handleConfirm() {
    setErr(null)
    startTransition(async () => {
      const res = await confirmInboxItem(item.id, {
        date:              fields.date,
        vendor:            fields.vendor,
        concept:           fields.concept,
        amount:            fields.amount,
        currency_code:     fields.currency,
        movement_type:     fields.movement_type,
        category_code:     fields.category_code,
        expense_group:     fields.expense_group,
        is_passive_income: fields.is_passive_income,
        envelope_id:       envelopeId || undefined,
        loan_id:           loanId || undefined,
      })
      if (res.error) setErr(res.error)
    })
  }

  function handleDiscard() {
    setErr(null)
    startTransition(async () => {
      const res = await discardInboxItem(item.id)
      if (res.error) setErr(res.error)
    })
  }

  const isProcessed = item.status !== 'pending'
  const relevantCats = categories.filter(c =>
    c.category_type === (fields.movement_type === 'income' ? 'income' : 'expense')
  )

  return (
    <div className={`bg-white/[0.03] rounded-xl border transition-colors ${
      isProcessed ? 'border-white/[0.04] opacity-60' : 'border-white/[0.08]'
    }`}>
      {/* Header row */}
      <button
        className="w-full flex items-start gap-3 p-4 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <Mail size={14} className="mt-0.5 shrink-0 text-zinc-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-zinc-200 truncate">
              {item.raw_subject ?? '(sin asunto)'}
            </p>
            {item.status === 'confirmed' && (
              <span className="text-[9px] font-bold text-[#a3e635] bg-[#a3e635]/10 px-1.5 py-0.5 rounded-full">✓ confirmado</span>
            )}
            {item.status === 'discarded' && (
              <span className="text-[9px] font-bold text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded-full">descartado</span>
            )}
            {isOld && item.status === 'pending' && (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">Antiguo +30d</span>
            )}
          </div>
          {ext && item.status === 'pending' && (
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {fmtAmt(ext.amount, ext.currency)} · {ext.vendor}
              {' '}·{' '}
              <span className={`font-semibold ${CONFIDENCE_COLOR[ext.confidence] ?? 'text-zinc-400'}`}>
                {ext.confidence}
              </span>
            </p>
          )}
          {item.email_date && (
            <p className="text-[9px] text-zinc-600 mt-0.5 flex items-center gap-1">
              <Clock size={9} />
              {new Date(item.email_date).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-zinc-600 shrink-0" /> : <ChevronDown size={14} className="text-zinc-600 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] p-4 space-y-4">
          {/* Email snippet */}
          {item.raw_snippet && (
            <p className="text-[10px] text-zinc-600 italic bg-white/[0.02] rounded-lg p-2">
              {item.raw_snippet}
            </p>
          )}

          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 grid grid-cols-3 gap-3">
              <div>
                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Tipo</label>
                <select
                  value={fields.movement_type}
                  onChange={e => setFields(f => ({ ...f, movement_type: e.target.value as ExtractedFields['movement_type'] }))}
                  disabled={isProcessed}
                  className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#a3e635]/40 disabled:opacity-50"
                >
                  {Object.entries(MOVEMENT_LABELS).map(([v, l]) => (
                    <option key={v} value={v} className="bg-[#111]">{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Moneda</label>
                <select
                  value={fields.currency}
                  onChange={e => setFields(f => ({ ...f, currency: e.target.value as 'CRC' | 'USD' }))}
                  disabled={isProcessed}
                  className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#a3e635]/40 disabled:opacity-50"
                >
                  <option value="CRC" className="bg-[#111]">₡ CRC</option>
                  <option value="USD" className="bg-[#111]">$ USD</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Monto</label>
                <input
                  type="number"
                  value={fields.amount}
                  onChange={e => setFields(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                  disabled={isProcessed}
                  className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#a3e635]/40 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Fecha</label>
              <input
                type="date"
                value={fields.date}
                onChange={e => setFields(f => ({ ...f, date: e.target.value }))}
                disabled={isProcessed}
                className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#a3e635]/40 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Comercio / Pagador</label>
              <input
                type="text"
                value={fields.vendor}
                onChange={e => setFields(f => ({ ...f, vendor: e.target.value }))}
                disabled={isProcessed}
                className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#a3e635]/40 disabled:opacity-50"
                placeholder="Nombre del comercio"
              />
            </div>

            <div className="col-span-2">
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Concepto</label>
              <input
                type="text"
                value={fields.concept}
                onChange={e => setFields(f => ({ ...f, concept: e.target.value }))}
                disabled={isProcessed}
                className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#a3e635]/40 disabled:opacity-50"
                placeholder="Descripción breve"
              />
            </div>

            {/* Category + auto-suggest */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Categoría</label>
                {!isProcessed && fields.vendor && (
                  <button
                    onClick={handleSuggestCategory}
                    disabled={suggesting}
                    className="flex items-center gap-1 text-[9px] text-zinc-500 hover:text-[#a3e635] transition-colors disabled:opacity-40"
                  >
                    {suggesting ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
                    Sugerir
                  </button>
                )}
              </div>
              <select
                value={fields.category_code ?? ''}
                onChange={e => handleCategoryChange(e.target.value)}
                disabled={isProcessed}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#a3e635]/40 disabled:opacity-50"
              >
                <option value="" className="bg-[#111]">(sin categoría)</option>
                {relevantCats.map(c => (
                  <option key={c.code} value={c.code} className="bg-[#111]">{c.name}</option>
                ))}
              </select>
              {suggestion === '' && (
                <p className="text-[9px] text-zinc-600 mt-0.5">Sin historial para este comercio</p>
              )}
            </div>

            {/* Envelope */}
            {envelopes.length > 0 && (
              <div className="col-span-2">
                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Sobre / Bolsillo</label>
                <select
                  value={envelopeId}
                  onChange={e => setEnvelopeId(e.target.value)}
                  disabled={isProcessed}
                  className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#a3e635]/40 disabled:opacity-50"
                >
                  <option value="" className="bg-[#111]">(ninguno)</option>
                  {envelopes.map(env => (
                    <option key={env.id} value={env.id} className="bg-[#111]">{env.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Loan selector — only for expenses */}
            {loans.length > 0 && fields.movement_type === 'expense' && (
              <div className="col-span-2">
                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">
                  Préstamo <span className="text-zinc-700 normal-case tracking-normal font-normal">(opcional)</span>
                </label>
                <select
                  value={loanId}
                  onChange={e => setLoanId(e.target.value)}
                  disabled={isProcessed}
                  className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#a3e635]/40 disabled:opacity-50"
                >
                  <option value="" className="bg-[#111]">— ninguno —</option>
                  {loans.map(l => {
                    const sym = l.currency_code === 'USD' ? '$' : '₡'
                    const bal = l.current_balance != null
                      ? `${sym}${Number(l.current_balance).toLocaleString('es-CR', { maximumFractionDigits: 0 })}`
                      : ''
                    return (
                      <option key={l.id} value={l.id} className="bg-[#111]">
                        {l.name}{l.lender ? ` · ${l.lender}` : ''}{bal ? ` · ${bal}` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}
          </div>

          {err && (
            <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{err}</p>
          )}

          {/* Actions */}
          {!isProcessed && (
            <div className="flex gap-2 pt-1 flex-wrap">
              <button
                onClick={handleConfirm}
                disabled={pending || !fields.vendor || !fields.amount}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle size={13} />
                Confirmar
              </button>
              <button
                onClick={handleDiscard}
                disabled={pending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.04] text-zinc-400 text-xs font-semibold hover:bg-white/[0.08] hover:text-zinc-200 transition-colors disabled:opacity-40"
              >
                <XCircle size={13} />
                Descartar
              </button>
              <button
                onClick={handleReExtract}
                disabled={reExtracting || pending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] text-zinc-500 text-xs font-semibold hover:bg-white/[0.08] hover:text-zinc-300 transition-colors disabled:opacity-40 ml-auto"
                title="Re-analizar con IA"
              >
                {reExtracting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Re-extraer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── EmailAccountsPanel ────────────────────────────────────────────────────────

function EmailAccountsPanel({ accounts: initialAccounts }: { accounts: ConnectedAccount[] }) {
  const router = useRouter()
  const [accounts,  setAccounts]  = useState<ConnectedAccount[]>(initialAccounts)
  const [syncing,   setSyncing]   = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)
  const [removing,  setRemoving]  = useState<string | null>(null)
  const [msgs,      setMsgs]      = useState<Record<string, { ok: boolean; text: string }>>({})

  async function doSync(acc: ConnectedAccount): Promise<boolean> {
    setSyncing(acc.id)
    setMsgs(m => ({ ...m, [acc.id]: { ok: true, text: 'Sincronizando...' } }))
    try {
      const endpoint = acc.provider === 'yahoo' ? '/api/yahoo/sync' : '/api/gmail/sync'
      const body     = acc.provider === 'yahoo' ? JSON.stringify({ accountId: acc.id }) : undefined
      const res      = await fetch(endpoint, {
        method:  'POST',
        headers: acc.provider === 'yahoo' ? { 'Content-Type': 'application/json' } : {},
        body,
      })
      const data = await res.json() as { found?: number; inserted?: number; error?: string }

      if (!res.ok || data.error) {
        const isToken = data.error?.toLowerCase().includes('token') || res.status === 401
        setMsgs(m => ({ ...m, [acc.id]: { ok: false, text: data.error ?? 'Error' + (isToken ? ' — reconectá la cuenta' : '') } }))
        return false
      }

      const { found = 0, inserted = 0 } = data
      setMsgs(m => ({
        ...m,
        [acc.id]: {
          ok:   true,
          text: inserted > 0
            ? `${inserted} nuevo${inserted !== 1 ? 's' : ''} de ${found}`
            : `${found} revisado${found !== 1 ? 's' : ''}, sin novedades`,
        },
      }))
      // Update last_synced_at locally
      setAccounts(a => a.map(a2 => a2.id === acc.id ? { ...a2, last_synced_at: new Date().toISOString() } : a2))
      return inserted > 0
    } catch (e) {
      setMsgs(m => ({ ...m, [acc.id]: { ok: false, text: String(e) } }))
      return false
    } finally {
      setSyncing(null)
    }
  }

  async function handleSync(acc: ConnectedAccount) {
    const hadNew = await doSync(acc)
    if (hadNew) router.refresh()
  }

  async function handleSyncAll() {
    setSyncingAll(true)
    let anyNew = false
    for (const acc of accounts) {
      const hadNew = await doSync(acc)
      if (hadNew) anyNew = true
    }
    setSyncingAll(false)
    if (anyNew) router.refresh()
  }

  async function handleRemove(id: string) {
    setRemoving(id)
    try {
      await fetch('/api/gmail/disconnect', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      })
      setAccounts(a => a.filter(acc => acc.id !== id))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Mail size={13} className="text-zinc-500 shrink-0" />
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] flex-1">Cuentas conectadas</p>
        {accounts.length > 1 && (
          <button
            onClick={handleSyncAll}
            disabled={syncingAll || !!syncing}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] text-zinc-300 text-[10px] font-bold hover:bg-white/[0.10] transition-colors disabled:opacity-40"
          >
            {syncingAll ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            Sync todas
          </button>
        )}
        <a
          href="/api/auth/gmail"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#a3e635] text-black text-[10px] font-black hover:bg-[#b4f040] transition-colors"
        >
          <Plus size={11} />
          Gmail
        </a>
        <a
          href="/api/auth/yahoo"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#6001d2] text-white text-[10px] font-black hover:bg-[#7510e8] transition-colors"
        >
          <Plus size={11} />
          Yahoo
        </a>
      </div>

      {accounts.length === 0 ? (
        <p className="text-[10px] text-zinc-600 px-1">
          Sin cuentas conectadas — conectá Gmail o Yahoo para importar correos bancarios.
        </p>
      ) : (
        <div className="space-y-1.5">
          {accounts.map(acc => (
            <div key={acc.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03]">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-black ${
                acc.provider === 'yahoo' ? 'bg-[#6001d2]/30 text-purple-300' : 'bg-[#a3e635]/20 text-[#a3e635]'
              }`}>
                {acc.provider === 'yahoo' ? 'Y!' : 'G'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-300 truncate">{acc.email}</p>
                {msgs[acc.id] ? (
                  <p className={`text-[9px] ${msgs[acc.id].ok ? 'text-[#a3e635]' : 'text-rose-400'}`}>
                    {msgs[acc.id].text}
                  </p>
                ) : acc.last_synced_at ? (
                  <p className="text-[9px] text-zinc-600">{relativeTime(acc.last_synced_at)}</p>
                ) : null}
              </div>
              <button
                onClick={() => handleSync(acc)}
                disabled={syncing === acc.id || syncingAll}
                className="p-1 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
                title="Sync"
              >
                {syncing === acc.id
                  ? <Loader2 size={11} className="animate-spin" />
                  : <RefreshCw size={11} />}
              </button>
              <button
                onClick={() => handleRemove(acc.id)}
                disabled={removing === acc.id}
                className="p-1 rounded hover:bg-white/[0.06] text-zinc-600 hover:text-rose-400 transition-colors disabled:opacity-40"
                title="Desconectar"
              >
                {removing === acc.id
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Trash2 size={11} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PaymentRemindersPanel ─────────────────────────────────────────────────────

function PaymentRemindersPanel({
  loans,
  initialReminders,
}: {
  loans: Loan[]
  initialReminders: PaymentReminder[]
}) {
  const router = useRouter()
  const [reminders, setReminders] = useState<PaymentReminder[]>(initialReminders)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', amount: '', currency_code: 'CRC', due_day: '', notes: '' })

  const today = new Date()

  type UpcomingItem = {
    key: string
    name: string
    daysLeft: number
    dueDate: Date
    amount: number | null
    currency: string | null
    type: 'loan' | 'reminder'
    id?: string
  }

  const upcomingLoans: UpcomingItem[] = loans
    .filter(l => l.payment_day != null)
    .map(l => {
      const due = nextDueDate(l.payment_day!, today)
      return { key: `loan-${l.id}`, name: l.name, daysLeft: daysUntil(due, new Date(today)), dueDate: due, amount: null, currency: l.currency_code, type: 'loan' as const }
    })

  const upcomingReminders: UpcomingItem[] = reminders.map(r => {
    const due = nextDueDate(r.due_day, today)
    return { key: `rem-${r.id}`, name: r.name, daysLeft: daysUntil(due, new Date(today)), dueDate: due, amount: r.amount, currency: r.currency_code, type: 'reminder' as const, id: r.id }
  })

  const all = [...upcomingLoans, ...upcomingReminders]
    .filter(i => i.daysLeft <= 45)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  async function handleAdd() {
    if (!form.name || !form.due_day) return
    setSaving(true)
    const res = await upsertPaymentReminder({
      name:          form.name,
      amount:        form.amount ? parseFloat(form.amount) : null,
      currency_code: form.currency_code,
      due_day:       parseInt(form.due_day),
      notes:         form.notes || null,
    })
    setSaving(false)
    if (!res.error) {
      setForm({ name: '', amount: '', currency_code: 'CRC', due_day: '', notes: '' })
      setShowAdd(false)
      router.refresh()
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await deletePaymentReminder(id)
    setReminders(r => r.filter(x => x.id !== id))
    setDeleting(null)
  }

  function urgencyColor(days: number) {
    if (days <= 3)  return 'text-rose-400 bg-rose-500/10 border-rose-500/20'
    if (days <= 7)  return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    return 'text-zinc-400 bg-white/[0.03] border-white/[0.06]'
  }

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <CalendarClock size={13} className="text-zinc-500 shrink-0" />
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] flex-1">Recordatorios de pago</p>
        <button
          onClick={() => setShowAdd(o => !o)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
        >
          <BellPlus size={10} />
          Agregar
        </button>
      </div>

      {all.length === 0 && !showAdd && (
        <p className="text-[10px] text-zinc-600 px-1">Sin pagos próximos en los próximos 45 días.</p>
      )}

      {all.length > 0 && (
        <div className="space-y-1.5">
          {all.map(item => (
            <div key={item.key} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs ${urgencyColor(item.daysLeft)}`}>
              <Bell size={11} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{item.name}</p>
                {item.amount && item.currency && (
                  <p className="text-[9px] opacity-70">{fmtAmt(item.amount, item.currency)}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-black text-[11px]">
                  {item.daysLeft === 0 ? '¡Hoy!' : item.daysLeft === 1 ? 'Mañana' : `${item.daysLeft}d`}
                </p>
                <p className="text-[9px] opacity-60">
                  {item.dueDate.toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
                </p>
              </div>
              {item.type === 'reminder' && item.id && (
                <button
                  onClick={() => handleDelete(item.id!)}
                  disabled={deleting === item.id}
                  className="p-1 rounded hover:bg-white/[0.08] opacity-50 hover:opacity-100 transition-opacity"
                >
                  {deleting === item.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add reminder form */}
      {showAdd && (
        <div className="border-t border-white/[0.06] pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre del pago (ej: Internet, Agua)"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-[#a3e635]/40"
              />
            </div>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="Monto (opcional)"
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-[#a3e635]/40"
            />
            <div className="flex gap-1">
              <select
                value={form.currency_code}
                onChange={e => setForm(f => ({ ...f, currency_code: e.target.value }))}
                className="w-20 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
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
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-[#a3e635]/40"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !form.name || !form.due_day}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Guardar
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PastePanel ────────────────────────────────────────────────────────────────

function PastePanel() {
  const router = useRouter()
  const [open, setOpen]         = useState(false)
  const [text, setText]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null)
  const [, startTransition]     = useTransition()

  async function handleSubmit() {
    if (!text.trim()) return
    setLoading(true)
    setMsg(null)

    try {
      const res = await fetch('/api/inbox/extract', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subject: '', snippet: text, body: text }),
      })
      const data = await res.json() as { skip?: boolean; reason?: string } & Partial<ExtractedFields & { confidence: string }>

      if (data.skip) {
        setMsg({ ok: false, text: `No se reconoció como transacción: ${data.reason ?? ''}` })
        setLoading(false)
        return
      }

      const extracted: ExtractedFields = {
        amount:        Number(data.amount ?? 0),
        currency:      (data.currency ?? 'CRC') as 'CRC' | 'USD',
        vendor:        String(data.vendor ?? ''),
        concept:       String(data.concept ?? ''),
        date:          String(data.date ?? new Date().toISOString().slice(0, 10)),
        movement_type: (data.movement_type ?? 'expense') as ExtractedFields['movement_type'],
        category_code: data.category_code,
        confidence:    (data.confidence ?? 'medium') as ExtractedFields['confidence'],
      }

      startTransition(async () => {
        const { error } = await insertManualInboxItem('Correo pegado', text.slice(0, 300), extracted)
        if (error) {
          setMsg({ ok: false, text: error })
        } else {
          setMsg({ ok: true, text: `Transacción extraída: ${extracted.vendor} · ${extracted.amount} ${extracted.currency}` })
          setText('')
          setOpen(false)
          router.refresh()
        }
        setLoading(false)
      })
    } catch (e) {
      setMsg({ ok: false, text: String(e) })
      setLoading(false)
    }
  }

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors rounded-xl"
      >
        <ClipboardPaste size={14} className="text-zinc-500 shrink-0" />
        <span className="text-xs font-semibold text-zinc-400">Pegar correo bancario</span>
        <span className="ml-auto text-[9px] text-zinc-600">Yahoo · Gmail · cualquier banco</span>
        {open ? <ChevronUp size={13} className="text-zinc-600 shrink-0" /> : <ChevronDown size={13} className="text-zinc-600 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-white/[0.06] p-4 space-y-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Pegá el texto del correo de notificación bancaria aquí..."
            rows={5}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-[#a3e635]/40 resize-none font-mono"
          />
          {msg && (
            <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'text-[#a3e635] bg-[#a3e635]/10' : 'text-rose-400 bg-rose-500/10'}`}>
              {msg.text}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading || !text.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <ClipboardPaste size={13} />}
            Extraer transacción
          </button>
        </div>
      )}
    </div>
  )
}

// ── InboxClient (main) ────────────────────────────────────────────────────────

export function InboxClient({ items, categories, connectedAccounts, envelopes, loans, paymentReminders, gmailStatus }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'processed'>('pending')
  const [batchPending, setBatchPending] = useState(false)
  const [batchMsg, setBatchMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const pending   = items.filter(i => i.status === 'pending')
  const processed = items.filter(i => i.status !== 'pending')
  const shown     = tab === 'pending' ? pending : processed

  const highConfidenceCount = pending.filter(i => {
    const ext = i.extracted
    return ext?.confidence === 'high' && ext.amount > 0 && ext.vendor
  }).length

  async function handleBatchConfirm() {
    setBatchPending(true)
    setBatchMsg(null)
    const res = await batchConfirmHighConfidence()
    setBatchPending(false)
    if (res.error) {
      setBatchMsg({ ok: false, text: res.error })
    } else {
      setBatchMsg({
        ok:   true,
        text: `${res.confirmed} confirmado${res.confirmed !== 1 ? 's' : ''}${res.skipped > 0 ? `, ${res.skipped} omitido${res.skipped !== 1 ? 's' : ''}` : ''}`,
      })
      if (res.confirmed > 0) router.refresh()
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Correos bancarios</p>
        <h1 className="text-xl font-black text-white">Bandeja de Entrada</h1>
      </div>

      {/* OAuth result banners */}
      {gmailStatus === 'connected' && (
        <p className="text-xs text-[#a3e635] bg-[#a3e635]/10 rounded-lg px-3 py-2">
          Cuenta conectada. Hacé clic en el ícono <RefreshCw size={10} className="inline" /> para sincronizar.
        </p>
      )}
      {gmailStatus === 'error' && (
        <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
          No se pudo conectar la cuenta. Verificá que las credenciales de la app estén configuradas.
        </p>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-1 w-fit border border-white/[0.06]">
        {([
          { key: 'pending',   label: 'Pendientes', count: pending.length },
          { key: 'processed', label: 'Procesados',  count: processed.length },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-colors ${
              tab === t.key ? 'bg-[#a3e635] text-black' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-black ${
                tab === t.key ? 'bg-black/20 text-black' : 'bg-white/[0.06] text-zinc-400'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Email accounts panel */}
      <EmailAccountsPanel accounts={connectedAccounts} />

      {/* Payment reminders */}
      {(loans.some(l => l.payment_day) || paymentReminders.length > 0) && (
        <PaymentRemindersPanel loans={loans} initialReminders={paymentReminders} />
      )}

      {/* Paste panel */}
      <PastePanel />

      {/* Batch confirm button */}
      {tab === 'pending' && highConfidenceCount > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleBatchConfirm}
            disabled={batchPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#a3e635]/10 border border-[#a3e635]/20 text-[#a3e635] text-xs font-bold hover:bg-[#a3e635]/20 transition-colors disabled:opacity-40"
          >
            {batchPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            Confirmar todos los de alta confianza ({highConfidenceCount})
          </button>
          {batchMsg && (
            <p className={`text-xs ${batchMsg.ok ? 'text-[#a3e635]' : 'text-rose-400'}`}>{batchMsg.text}</p>
          )}
        </div>
      )}

      {/* Empty state */}
      {shown.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-white/[0.04] flex items-center justify-center">
            <Inbox size={24} className="text-zinc-600" />
          </div>
          {tab === 'pending' ? (
            <>
              <p className="text-sm font-semibold text-zinc-400">Sin correos pendientes</p>
              <p className="text-xs text-zinc-600 max-w-xs">
                Conectá Gmail arriba y hacé clic en &ldquo;Sync correos&rdquo;, o pegá el texto de un correo bancario.
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-zinc-400">No hay correos procesados aún</p>
          )}
        </div>
      )}

      {/* Items */}
      <div className="space-y-3">
        {shown.map(item => (
          <ItemCard key={item.id} item={item} categories={categories} envelopes={envelopes} loans={loans} />
        ))}
      </div>
    </div>
  )
}
