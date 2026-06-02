'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { Plus, X, Sparkles, Camera, FileText, Loader2 } from 'lucide-react'
import { createTransaction, checkDuplicateTransaction, type TxEntryType, type DuplicateHit } from '@/app/actions/transactions'
import { CONCEPT_CATALOG, lookupConcept } from '@/lib/concept-catalog'

type Envelope = { id: string; name: string; custodio: string; parent_envelope_id: string | null }
type InvestmentBucket = { id: string; name: string }
type Category = {
  code: string; name: string; parent_code: string | null
  category_type: string; group_gasto: string | null
  is_passive_income: boolean; is_survival_expense: boolean; is_settlement: boolean
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
  { value: 'traslado', label: 'Traslado de sobres', desc: 'Solo movimientos internos, sin tx', color: 'text-amber-400' },
]

type Loan = { id: string; description: string; original_amount: number | string; amount_repaid: number | string; status: string }

export function TransactionEntryFAB({
  envelopes, categories, buckets, loans,
}: {
  envelopes: Envelope[]; categories: Category[]; buckets: InvestmentBucket[]; loans: Loan[]
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
  const [envelopeId, setEnvelopeId]               = useState('')
  const [fromEnvelopeId, setFromEnvelopeId]       = useState('')
  const [toEnvelopeId, setToEnvelopeId]           = useState('')
  // investment bucket for liquidation income
  const [investmentBucketId, setInvestmentBucketId] = useState('')
  // ahorro extras
  const [ahorroVendor, setAhorroVendor] = useState('')
  const [ahorroConcepto, setAhorroConcepto] = useState('')

  const [error, setError]             = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  // ── Side-effect fields (optional, gasto/ingreso only) ───────────────────────
  const [debitEnvelopeId, setDebitEnvelope] = useState('')
  const [loanMode, setLoanMode]             = useState<'' | 'new' | string>('')  // '' | 'new' | <loanId>
  const [newLoanDesc, setNewLoanDesc]       = useState('')

  // ── Duplicate detection ──────────────────────────────────────────────────────
  const [dupHits, setDupHits]         = useState<DuplicateHit[]>([])
  const [dupDismissed, setDupDismissed] = useState(false)

  // ── AI mode ────────────────────────────────────────────────────────────────
  type AiFile = { data: string; type: string; name: string }
  type ConvMsg = { role: 'user' | 'assistant'; content: string }

  const [aiMode, setAiMode]           = useState(false)
  const [aiText, setAiText]           = useState('')
  const [aiFile, setAiFile]           = useState<AiFile | null>(null)
  const [aiMessages, setAiMessages]   = useState<ConvMsg[]>([])
  const [aiQuestion, setAiQuestion]   = useState<string | null>(null)
  const [aiAnswer, setAiAnswer]       = useState('')
  const [aiLoading, setAiLoading]     = useState(false)
  const [aiError, setAiError]         = useState<string | null>(null)
  const [aiPrefilled, setAiPrefilled] = useState(false)
  const imgInputRef                   = useRef<HTMLInputElement>(null)
  const galleryInputRef               = useRef<HTMLInputElement>(null)
  const pdfInputRef                   = useRef<HTMLInputElement>(null)

  // Leaf-only envelopes; parents only used for display label
  const parentIds = new Set(envelopes.filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string))
  const leafEnvelopes = envelopes.filter(e => !parentIds.has(e.id))

  // Auto-derive all classification flags from selected category
  useEffect(() => {
    if (!categoryCode) {
      setIsPassive(false); setIsSettlement(false); setIsSurvival(false)
      return
    }
    const cat = categories.find(c => c.code === categoryCode)
    if (!cat) return
    if (cat.group_gasto && cat.group_gasto !== 'na') setExpenseGroup(cat.group_gasto)
    setIsPassive(cat.is_passive_income)
    setIsSettlement(cat.is_settlement)
    setIsSurvival(cat.is_survival_expense)
  }, [categoryCode, categories])

  // Duplicate detection: debounce check when amount + vendor/concept are filled
  useEffect(() => {
    if (aiMode || dupDismissed) return
    if (type !== 'gasto' && type !== 'ingreso') { setDupHits([]); return }
    const amtNum = currency === 'USD'
      ? (parseFloat(amountUSD || '0') * parseFloat(fxRate || '0'))
      : parseFloat(amount || '0')
    if (!amtNum || amtNum <= 0 || (!vendor.trim() && !concept.trim())) { setDupHits([]); return }
    setDupDismissed(false)
    const timer = setTimeout(async () => {
      const hits = await checkDuplicateTransaction({
        date, amount: amtNum, vendor, concept,
        movement_type: type === 'gasto' ? 'expense' : 'income',
      })
      setDupHits(hits)
    }, 600)
    return () => clearTimeout(timer)
  }, [date, amount, amountUSD, fxRate, vendor, concept, type, currency])

  function reset() {
    setType('gasto'); setDate(today()); setAmount(''); setNotes('')
    setCurrency('CRC'); setAmountUSD(''); setFxRate('')
    setVendor(''); setConcept(''); setCategoryCode(''); setExpenseGroup('personal')
    setIsPassive(false); setIsSettlement(false); setIsSurvival(false)
    setEnvelopeId(''); setFromEnvelopeId(''); setToEnvelopeId('')
    setInvestmentBucketId('')
    setAhorroVendor(''); setAhorroConcepto('')
    setDebitEnvelope(''); setLoanMode(''); setNewLoanDesc('')
    setError(null)
    // reset AI state
    setAiMode(false); setAiText(''); setAiFile(null); setAiMessages([])
    setAiQuestion(null); setAiAnswer(''); setAiLoading(false)
    setAiError(null); setAiPrefilled(false)
    setDupHits([]); setDupDismissed(false)
  }

  function close() { reset(); setOpen(false) }

  function handleFileSelect(file: File | undefined | null, kind: 'image' | 'pdf') {
    if (!file) return
    const maxBytes = 5 * 1024 * 1024 // 5 MB
    if (file.size > maxBytes) { setAiError('Archivo demasiado grande (máx 5 MB)'); return }
    const reader = new FileReader()
    reader.onload = e => {
      const result = e.target?.result as string
      const base64 = result.split(',')[1]
      setAiFile({ data: base64, type: file.type, name: file.name })
      setAiError(null)
    }
    reader.readAsDataURL(file)
  }

  async function analyzeWithAI() {
    const userText = aiQuestion ? aiAnswer.trim() : aiText.trim()
    if (!userText && !aiFile) { setAiError('Escribí algo o subí un archivo.'); return }
    setAiLoading(true); setAiError(null)

    const newMessages: { role: 'user' | 'assistant'; content: string }[] = [
      ...aiMessages,
      { role: 'user', content: userText || (aiFile ? `Analizá este ${aiFile.type.startsWith('image') ? 'recibo' : 'PDF'}.` : '') },
    ]

    try {
      const res = await fetch('/api/ai-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          fileData: aiFile?.data,
          fileType: aiFile?.type,
          categories,
          envelopes,
        }),
      })

      if (!res.ok) {
        const txt = await res.text()
        setAiError(`Error ${res.status}: ${txt}`)
        setAiLoading(false)
        return
      }

      const data = await res.json() as {
        status: 'complete' | 'question' | 'error'
        fields?: Record<string, unknown>
        partial?: Record<string, unknown>
        question?: string
        message?: string
      }

      if (data.status === 'complete' && data.fields) {
        const f = data.fields
        if (typeof f.type === 'string') setType(f.type as TxEntryType)
        if (typeof f.date === 'string') setDate(f.date)
        if (typeof f.amount === 'number') setAmount(String(f.amount))
        if (f.currency === 'USD') setCurrency('USD'); else setCurrency('CRC')
        if (typeof f.vendor === 'string') setVendor(f.vendor)
        if (typeof f.concept === 'string') setConcept(f.concept)
        if (typeof f.category_code === 'string') setCategoryCode(f.category_code)
        if (typeof f.is_passive_income === 'boolean') setIsPassive(f.is_passive_income)
        if (typeof f.is_settlement === 'boolean') setIsSettlement(f.is_settlement)
        if (typeof f.is_survival_expense === 'boolean') setIsSurvival(f.is_survival_expense)
        if (typeof f.envelope_id === 'string') setEnvelopeId(f.envelope_id)
        setAiPrefilled(true)
        setAiMode(false)
        setAiMessages([])
        setAiQuestion(null)
      } else if (data.status === 'question' && data.question) {
        // apply any partial fields quietly
        const p = data.partial ?? {}
        if (typeof p.type === 'string') setType(p.type as TxEntryType)
        if (typeof p.amount === 'number') setAmount(String(p.amount))
        if (typeof p.vendor === 'string') setVendor(p.vendor)
        setAiMessages([...newMessages, { role: 'assistant', content: data.question }])
        setAiQuestion(data.question)
        setAiAnswer('')
      } else {
        setAiError(data.message ?? 'No se pudo interpretar el input. Sé más específico o usá el formulario manual.')
      }
    } catch (err) {
      setAiError('Error de red. Intentá de nuevo.')
    }

    setAiLoading(false)
  }

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
          debit_envelope_id: debitEnvelopeId || undefined,
          loan_id: loanMode && loanMode !== 'new' ? loanMode : undefined,
          new_loan_description: loanMode === 'new' ? (newLoanDesc.trim() || concept.trim() || vendor.trim() || undefined) : undefined,
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
          investment_bucket_id: isSettlement && investmentBucketId ? investmentBucketId : undefined,
          notes: notes || undefined,
          debit_envelope_id: debitEnvelopeId || undefined,
          loan_id: loanMode && loanMode !== 'new' ? loanMode : undefined,
          new_loan_description: loanMode === 'new' ? (newLoanDesc.trim() || concept.trim() || vendor.trim() || undefined) : undefined,
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
          debit_envelope_id: debitEnvelopeId || undefined,
          loan_id: loanMode && loanMode !== 'new' ? loanMode : undefined,
          new_loan_description: loanMode === 'new' ? (newLoanDesc.trim() || concept.trim() || vendor.trim() || undefined) : undefined,
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
          investment_bucket_id: isSettlement && investmentBucketId ? investmentBucketId : undefined,
          notes: notes || undefined,
          debit_envelope_id: debitEnvelopeId || undefined,
          loan_id: loanMode && loanMode !== 'new' ? loanMode : undefined,
          new_loan_description: loanMode === 'new' ? (newLoanDesc.trim() || concept.trim() || vendor.trim() || undefined) : undefined,
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
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
                  <button type="button"
                    onClick={() => { setAiMode(false); setAiError(null) }}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-black transition-all ${!aiMode ? 'bg-white/[0.10] text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
                    Manual
                  </button>
                  <button type="button"
                    onClick={() => { setAiMode(true); setAiError(null) }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black transition-all ${aiMode ? 'bg-[#a3e635]/20 text-[#a3e635]' : 'text-zinc-600 hover:text-zinc-400'}`}>
                    <Sparkles size={10} />
                    IA
                  </button>
                </div>
                <button onClick={close} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={16} /></button>
              </div>
            </div>

            {/* ── AI panel ── */}
            {aiMode && (
              <div className="space-y-3">
                {aiQuestion && (
                  <div className="flex gap-2 bg-[#a3e635]/[0.08] border border-[#a3e635]/20 rounded-xl p-3">
                    <Sparkles size={14} className="text-[#a3e635] mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-[#a3e635]/90 leading-snug">{aiQuestion}</p>
                  </div>
                )}
                <div>
                  <label className={lbl}>{aiQuestion ? 'Tu respuesta' : 'Describí la transacción'}</label>
                  <textarea
                    value={aiQuestion ? aiAnswer : aiText}
                    onChange={e => aiQuestion ? setAiAnswer(e.target.value) : setAiText(e.target.value)}
                    placeholder={aiQuestion ? 'Escribí tu respuesta…' : 'Ej: "Pagué ₡15,000 en Spoon por almuerzo" o pegá el texto de un recibo…'}
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </div>
                {!aiQuestion && (
                  <div>
                    <label className={lbl}>O subí un archivo</label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button"
                        onClick={() => imgInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors">
                        <Camera size={13} /> Tomar foto
                      </button>
                      <button type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors">
                        <FileText size={13} /> Galería / PDF
                      </button>
                      {/* capture="environment" opens rear camera directly on mobile */}
                      <input ref={imgInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={e => handleFileSelect(e.target.files?.[0], 'image')} />
                      <input ref={galleryInputRef} type="file" accept="image/*,.pdf,application/pdf" className="hidden"
                        onChange={e => handleFileSelect(e.target.files?.[0], e.target.files?.[0]?.type === 'application/pdf' ? 'pdf' : 'image')} />
                      <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                        onChange={e => handleFileSelect(e.target.files?.[0], 'pdf')} />
                    </div>
                    {aiFile && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] text-zinc-400 truncate max-w-[200px]">{aiFile.name}</span>
                        <button type="button" onClick={() => setAiFile(null)}
                          className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={11} /></button>
                      </div>
                    )}
                  </div>
                )}
                {aiError && (
                  <p className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{aiError}</p>
                )}
                <button type="button" onClick={analyzeWithAI} disabled={aiLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#a3e635]/20 border border-[#a3e635]/30 text-[#a3e635] text-sm font-black hover:bg-[#a3e635]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {aiLoading
                    ? <><Loader2 size={14} className="animate-spin" /> Analizando…</>
                    : <><Sparkles size={14} /> {aiQuestion ? 'Responder →' : 'Analizar →'}</>
                  }
                </button>
              </div>
            )}

            {/* Type selector — hidden in AI mode */}
            {!aiMode && <div className="grid grid-cols-2 gap-1.5">
              {TYPE_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => { setType(opt.value); setError(null) }}
                  className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                    type === opt.value ? 'bg-white/[0.06] border-white/[0.12]' : 'border-transparent hover:bg-white/[0.03]'
                  }`}>
                  <p className={`text-xs font-bold ${opt.color}`}>{opt.label}</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>}

            {!aiMode && <form onSubmit={submit} className="space-y-3">

              {/* Revisión IA banner */}
              {aiPrefilled && (
                <div className="flex items-center gap-2 bg-[#a3e635]/[0.06] border border-[#a3e635]/20 rounded-xl px-3 py-2">
                  <Sparkles size={12} className="text-[#a3e635]/70 flex-shrink-0" />
                  <p className="text-[11px] text-[#a3e635]/70">Completado por IA — verificá los campos antes de guardar</p>
                  <button type="button" onClick={() => setAiPrefilled(false)} className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors"><X size={11} /></button>
                </div>
              )}

              {/* ── Duplicate warning ── */}
              {dupHits.length > 0 && !dupDismissed && (
                <div className="bg-amber-400/[0.08] border border-amber-400/25 rounded-xl px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-[0.12em]">⚠ Posible duplicado</p>
                    <button type="button" onClick={() => setDupDismissed(true)} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={11} /></button>
                  </div>
                  {dupHits.map(h => (
                    <p key={h.id} className="text-[11px] text-amber-300/80 leading-snug">
                      {h.date} · {h.vendor ?? h.concept} · ₡{Number(h.amount).toLocaleString('es-CR')}
                    </p>
                  ))}
                  <p className="text-[10px] text-zinc-600">Verificá antes de guardar o cerrá esta alerta para continuar.</p>
                </div>
              )}

              {/* ── Date + Amount ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Fecha</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
                </div>
                {type !== 'traslado' && (
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
                )}
              </div>

              {/* Amount fields depend on currency */}
              {(type === 'traslado' || currency === 'CRC') ? (
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
                      <input type="text" list="catalog-expense" value={concept}
                        onChange={e => {
                          const v = e.target.value
                          setConcept(v)
                          const hit = lookupConcept(v)
                          if (hit && hit.type === 'expense') setCategoryCode(hit.categoryCode)
                        }}
                        placeholder="Almuerzo, Supermercado…" className={inputCls} />
                      <datalist id="catalog-expense">
                        {CONCEPT_CATALOG.filter(e => e.type === 'expense').map(e =>
                          <option key={e.concepto} value={e.concepto} />
                        )}
                      </datalist>
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Categoría <span className="text-zinc-700 normal-case tracking-normal">(auto-asigna al elegir concepto)</span></label>
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
                  {(isSettlement || isSurvival) && (
                    <div className="flex flex-wrap gap-2">
                      {isSurvival  && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20">Gasto de supervivencia</span>}
                      {isSettlement && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20">Liquidación de inversión</span>}
                    </div>
                  )}
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
                      <input type="text" list="catalog-income" value={concept}
                        onChange={e => {
                          const v = e.target.value
                          setConcept(v)
                          const hit = lookupConcept(v)
                          if (hit && hit.type === 'income') setCategoryCode(hit.categoryCode)
                        }}
                        placeholder="Salario, Rendimientos Farming…" className={inputCls} />
                      <datalist id="catalog-income">
                        {CONCEPT_CATALOG.filter(e => e.type === 'income').map(e =>
                          <option key={e.concepto} value={e.concepto} />
                        )}
                      </datalist>
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Categoría <span className="text-zinc-700 normal-case tracking-normal">(auto-asigna al elegir concepto)</span></label>
                    <CategorySelect categories={categories} value={categoryCode}
                      onChange={v => setCategoryCode(v)}
                      typeFilter="income" className={inputCls} />
                  </div>
                  {isSettlement && buckets.length > 0 && (
                    <div>
                      <label className={lbl}>¿Reduce bucket de inversión? <span className="text-zinc-700 normal-case tracking-normal">(opcional)</span></label>
                      <select value={investmentBucketId} onChange={e => setInvestmentBucketId(e.target.value)} className={inputCls}>
                        <option value="">Sin bucket (solo liquidez)</option>
                        {buckets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  )}
                  {(isPassive || isSettlement) && (
                    <div className="flex flex-wrap gap-2">
                      {isPassive    && <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">Ingreso pasivo</span>}
                      {isSettlement && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20">Liquidación de inversión</span>}
                    </div>
                  )}
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

              {/* ── Autopréstamo fields ── */}
              {/* ── Optional side-effects (gasto / ingreso only) ── */}
              {(type === 'gasto' || type === 'ingreso') && (
                <div className="space-y-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.16em]">Opcionales</p>
                  <div>
                    <label className={lbl}>Débito de sobre</label>
                    <select value={debitEnvelopeId} onChange={e => setDebitEnvelope(e.target.value)} className={inputCls}>
                      <option value="">— ninguno —</option>
                      {leafEnvelopes.map(env => (
                        <option key={env.id} value={env.id}>{envelopeLabel(env, envelopes)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Autopréstamo</label>
                    <select value={loanMode} onChange={e => setLoanMode(e.target.value)} className={inputCls}>
                      <option value="">— ninguno —</option>
                      <option value="new">+ Crear nuevo</option>
                      {loans.map(l => {
                        const remaining = Number(l.original_amount) - Number(l.amount_repaid)
                        return (
                          <option key={l.id} value={l.id}>
                            {l.description} · ₡{Math.round(remaining).toLocaleString('es-CR')} pendiente
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  {loanMode === 'new' && (
                    <div>
                      <label className={lbl}>Nombre del nuevo autopréstamo</label>
                      <input type="text" value={newLoanDesc} onChange={e => setNewLoanDesc(e.target.value)}
                        placeholder="Dejar vacío para usar concepto/vendor…" className={inputCls} />
                    </div>
                  )}
                </div>
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
            </form>}
          </div>
        </div>
      )}
    </>
  )
}
