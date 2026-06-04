'use client'

import { useState, useTransition } from 'react'
import { confirmInboxItem, discardInboxItem, insertManualInboxItem } from '@/app/actions/inbox'
import type { InboxItem, ExtractedFields } from '@/app/actions/inbox'
import { CheckCircle, XCircle, Mail, Clock, ChevronDown, ChevronUp, Inbox, ClipboardPaste, Loader2 } from 'lucide-react'

type Category = {
  code: string
  name: string
  category_type: string
  group_gasto: string | null
  is_passive_income: boolean
}

type Props = {
  items: InboxItem[]
  categories: Category[]
}

const MOVEMENT_LABELS: Record<string, string> = {
  expense:          'Gasto',
  income:           'Ingreso',
  cash_withdrawal:  'Retiro',
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

function ItemCard({
  item,
  categories,
}: {
  item: InboxItem
  categories: Category[]
}) {
  const [pending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(item.status === 'pending')
  const [err, setErr] = useState<string | null>(null)

  const ext = item.extracted
  const [fields, setFields] = useState<ExtractedFields>(
    ext ?? {
      amount: 0,
      currency: 'CRC',
      vendor: '',
      concept: '',
      date: new Date().toISOString().slice(0, 10),
      movement_type: 'expense',
      confidence: 'low',
    },
  )

  function handleCategoryChange(code: string) {
    const cat = categories.find(c => c.code === code)
    setFields(f => ({
      ...f,
      category_code:   code || undefined,
      expense_group:   cat?.group_gasto && cat.group_gasto !== 'na' ? cat.group_gasto : f.expense_group,
      is_passive_income: cat?.is_passive_income ?? f.is_passive_income,
    }))
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

  const incomeCategories  = categories.filter(c => c.category_type === 'income')
  const expenseCategories = categories.filter(c => c.category_type === 'expense')
  const relevantCats = fields.movement_type === 'income' ? incomeCategories : expenseCategories

  return (
    <div className={`bg-white/[0.03] rounded-xl border transition-colors ${
      isProcessed
        ? 'border-white/[0.04] opacity-60'
        : 'border-white/[0.08]'
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
              {/* Movement type */}
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

              {/* Currency */}
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

              {/* Amount */}
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

            {/* Date */}
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

            {/* Vendor */}
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

            {/* Concept */}
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

            {/* Category */}
            <div className="col-span-2">
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Categoría</label>
              <select
                value={fields.category_code ?? ''}
                onChange={e => handleCategoryChange(e.target.value)}
                disabled={isProcessed}
                className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#a3e635]/40 disabled:opacity-50"
              >
                <option value="" className="bg-[#111]">(sin categoría)</option>
                {relevantCats.map(c => (
                  <option key={c.code} value={c.code} className="bg-[#111]">{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {err && (
            <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{err}</p>
          )}

          {/* Actions */}
          {!isProcessed && (
            <div className="flex gap-2 pt-1">
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PastePanel() {
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
      // Extract via Claude
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
        amount:       Number(data.amount ?? 0),
        currency:     (data.currency ?? 'CRC') as 'CRC' | 'USD',
        vendor:       String(data.vendor ?? ''),
        concept:      String(data.concept ?? ''),
        date:         String(data.date ?? new Date().toISOString().slice(0, 10)),
        movement_type: (data.movement_type ?? 'expense') as ExtractedFields['movement_type'],
        category_code: data.category_code,
        confidence:   (data.confidence ?? 'medium') as ExtractedFields['confidence'],
      }

      startTransition(async () => {
        const { error } = await insertManualInboxItem('Correo pegado', text.slice(0, 300), extracted)
        if (error) {
          setMsg({ ok: false, text: error })
        } else {
          setMsg({ ok: true, text: `Transacción extraída: ${extracted.vendor} · ${extracted.amount} ${extracted.currency}` })
          setText('')
          setOpen(false)
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

export function InboxClient({ items, categories }: Props) {
  const [tab, setTab] = useState<'pending' | 'processed'>('pending')

  const pending   = items.filter(i => i.status === 'pending')
  const processed = items.filter(i => i.status !== 'pending')

  const shown = tab === 'pending' ? pending : processed

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Correos bancarios</p>
        <h1 className="text-xl font-black text-white">Bandeja de Entrada</h1>
      </div>

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

      {/* Paste panel — always visible */}
      <PastePanel />

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
                Pedile a Claude que sincronice tus correos bancarios:<br />
                <span className="font-mono text-zinc-500 mt-1 block">&ldquo;sincronizá mis correos bancarios&rdquo;</span>
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
          <ItemCard key={item.id} item={item} categories={categories} />
        ))}
      </div>
    </div>
  )
}
