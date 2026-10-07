'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { matchAccountRefs } from '@/lib/inbox-utils'
import { transferBetweenEnvelopes } from '@/app/(dashboard)/liquidez/actions'
import Anthropic from '@anthropic-ai/sdk'

const RE_EXTRACT_SYSTEM = `Sos un extractor de datos de correos de notificación bancaria de Costa Rica.
Analizás el asunto y cuerpo del correo y extraés los datos de la transacción.
Bancos soportados: BAC Credomatic, Banco Nacional (BNCR/BN), BCR, Scotiabank, Banco Popular, Davivienda, Promerica, Banco Cathay, SINPE Móvil.
HOY: __TODAY__
REGLAS:
- Montos en CRC salvo que el correo diga explícitamente USD
- Fechas en YYYY-MM-DD; si no hay fecha en el correo, usá la fecha del correo o hoy
- vendor = nombre del comercio, persona o banco
- concept = descripción corta
- movement_type: "expense" para débitos/compras/pagos, "income" para créditos/depósitos/SINPE recibido, "cash_withdrawal" para retiros
- is_credit_card: true si el correo indica claramente que es una transacción de TARJETA DE CRÉDITO (TC, crédito, Visa Crédito, etc.); false si es débito, SINPE, transferencia, retiro u otro instrumento; omitir si no es claro. NOTA: esto es solo un respaldo — si el correo menciona los últimos 4 dígitos de la tarjeta/cuenta (account_ref), el sistema cruza eso contra las cuentas reales del usuario y esa coincidencia manda sobre esta inferencia.
- account_ref: los ÚLTIMOS 4 DÍGITOS de la tarjeta o cuenta que origina/recibe esta transacción, tal como aparecen en el correo. null si el correo no los menciona.
- counterparty_ref: SOLO si es una transferencia/SINPE con cuenta de contraparte explícita, los últimos 4 dígitos de esa OTRA cuenta (destino si es saliente, origen si es entrante). null en cualquier otro caso.
- confidence: "high" si tenés todos los datos claramente, "medium" si hay algo inferido, "low" si hay ambigüedad
FORMATO — respondé SOLO con JSON:
{"amount":15000,"currency":"CRC","vendor":"Walmart","concept":"Compra supermercado","date":"2026-06-01","movement_type":"expense","is_credit_card":true,"account_ref":"1234","counterparty_ref":null,"category_code":"FOOD_MARKET","confidence":"high"}
Si no es correo bancario: {"skip":true,"reason":"No es notificación de transacción"}`

export type MatchedAccount = { id: string; name: string; account_type: string; custodio: string | null }

export type ExtractedFields = {
  amount: number
  currency: 'CRC' | 'USD'
  vendor: string
  concept: string
  date: string
  movement_type: 'expense' | 'income' | 'cash_withdrawal'
  is_credit_card?: boolean
  account_ref?: string | null
  counterparty_ref?: string | null
  matched_account?: MatchedAccount | null
  matched_counterparty?: MatchedAccount | null
  is_internal_transfer?: boolean
  category_code?: string
  expense_group?: string
  is_passive_income?: boolean
  confidence: 'high' | 'medium' | 'low'
}

export type InboxItem = {
  id: string
  email_id: string
  email_date: string | null
  raw_subject: string | null
  raw_snippet: string | null
  extracted: ExtractedFields | null
  status: 'pending' | 'confirmed' | 'discarded'
  created_at: string
  duplicate_of_tx_id: string | null
  duplicate_of_tx: { date: string; amount: number; vendor: string | null } | null
}

type DupeCandidate = { id: string; amount: number; date: string; vendor: string | null }

const DUPE_WINDOW_DAYS = 7

// Exact amount (to the nearest colón) within a week of the date, with a
// loose vendor-name overlap check when both sides have one — "WALMART" vs
// "WALMART SAN RAFAEL" should match, "WALMART" vs "UBER" at the same amount
// shouldn't. The date window is wide because manual entries are often typed
// late or with a mistyped date, but the amount match is exact (not ±1%
// anymore) to compensate — a week-wide net with a fuzzy amount would catch
// too many unrelated same-vendor transactions.
function findDuplicateMatch(
  tx: { date: string; amount: number; vendor: string },
  candidates: DupeCandidate[],
): DupeCandidate | null {
  const newVendor = tx.vendor?.trim().toLowerCase() ?? ''
  const txDate = new Date(tx.date).getTime()
  return candidates.find(d => {
    if (Math.round(Number(d.amount)) !== Math.round(tx.amount)) return false
    if (Math.abs(new Date(d.date).getTime() - txDate) > DUPE_WINDOW_DAYS * 86400000) return false
    const existVendor = (d.vendor ?? '').trim().toLowerCase()
    if (newVendor.length >= 4 && existVendor.length >= 4) {
      const overlap = newVendor.slice(0, 4) === existVendor.slice(0, 4)
        || existVendor.includes(newVendor.slice(0, 6))
        || newVendor.includes(existVendor.slice(0, 6))
      if (!overlap) return false
    }
    return true
  }) ?? null
}

// Sweeps pending items against transactions NOT sourced from this inbox
// (manual FAB entries, old sheet imports) — catches the case where the user
// typed a transaction by hand before (or after) its notification email
// arrived, so the same spend doesn't need reviewing twice. Marks matches
// discarded with a record of which transaction they duplicate (not a bare
// status flip) so a bad match is auditable and restorable, not silently
// gone — this is a heuristic, not a certainty.
export async function autoDiscardDuplicates(): Promise<{ discarded: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { discarded: 0 }

  const admin = createAdminClient()
  const { data: pending } = await admin
    .from('transaction_inbox')
    .select('id, extracted')
    .eq('user_id', user.id)
    .eq('status', 'pending')

  const candidates = (pending ?? [])
    .map(p => ({ id: p.id, ext: p.extracted as ExtractedFields | null }))
    .filter((p): p is { id: string; ext: ExtractedFields } => !!p.ext?.date && !!p.ext?.amount && !!p.ext?.vendor)

  if (candidates.length === 0) return { discarded: 0 }

  const dates = candidates.map(c => c.ext.date).sort()
  const windowStart = new Date(new Date(dates[0]).getTime() - DUPE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
  const windowEnd   = new Date(new Date(dates[dates.length - 1]).getTime() + DUPE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)

  const { data: txs } = await admin
    .from('transactions')
    .select('id, amount, date, vendor, movement_type')
    .eq('user_id', user.id)
    .neq('source', 'email')
    .gte('date', windowStart)
    .lte('date', windowEnd)

  const byMovementType: Record<string, DupeCandidate[]> = {}
  for (const t of txs ?? []) {
    const key = t.movement_type ?? ''
    ;(byMovementType[key] ??= []).push({ id: t.id, amount: Number(t.amount), date: t.date ?? '', vendor: t.vendor })
  }

  const matches: { inboxId: string; txId: string }[] = []
  for (const c of candidates) {
    const pool = byMovementType[c.ext.movement_type] ?? []
    const match = findDuplicateMatch({ date: c.ext.date, amount: c.ext.amount, vendor: c.ext.vendor }, pool)
    if (match) matches.push({ inboxId: c.id, txId: match.id })
  }

  if (matches.length === 0) return { discarded: 0 }

  await Promise.all(matches.map(m =>
    admin.from('transaction_inbox')
      .update({ status: 'discarded', duplicate_of_tx_id: m.txId })
      .eq('id', m.inboxId)
      .eq('user_id', user.id)
  ))

  return { discarded: matches.length }
}

export async function restoreInboxItem(inboxId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await createAdminClient()
    .from('transaction_inbox')
    .update({ status: 'pending', duplicate_of_tx_id: null })
    .eq('id', inboxId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/movimientos')
  return { error: null }
}

export async function getInboxItems(): Promise<InboxItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  await autoDiscardDuplicates()

  const admin = createAdminClient()
  const { data } = await admin
    .from('transaction_inbox')
    .select('id, email_id, email_date, raw_subject, raw_snippet, extracted, status, created_at, duplicate_of_tx_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const txIds = [...new Set((data ?? []).map(i => i.duplicate_of_tx_id).filter((id): id is string => !!id))]
  const txMap: Record<string, { date: string; amount: number; vendor: string | null }> = {}
  if (txIds.length > 0) {
    const { data: dupeTxs } = await admin.from('transactions').select('id, date, amount, vendor').in('id', txIds)
    for (const t of dupeTxs ?? []) txMap[t.id] = { date: t.date ?? '', amount: Number(t.amount), vendor: t.vendor }
  }

  return (data ?? []).map(i => ({
    ...i,
    duplicate_of_tx: i.duplicate_of_tx_id ? (txMap[i.duplicate_of_tx_id] ?? null) : null,
  })) as InboxItem[]
}

export async function confirmInboxItem(
  inboxId: string,
  tx: {
    date: string
    vendor: string
    concept: string
    amount: number
    currency_code: string
    movement_type: string
    category_code?: string
    expense_group?: string
    is_passive_income?: boolean
    notes?: string
    envelope_id?: string
    loan_id?: string
  },
  options?: { force?: boolean },
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  if (!options?.force) {
    // Soft duplicate check: same movement_type, exact amount, within a week
    const dayBefore = new Date(new Date(tx.date).getTime() - DUPE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
    const dayAfter  = new Date(new Date(tx.date).getTime() + DUPE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
    const { data: dupes } = await admin
      .from('transactions')
      .select('id, amount, date, vendor')
      .eq('user_id', user.id)
      .eq('movement_type', tx.movement_type)
      .gte('date', dayBefore)
      .lte('date', dayAfter)
      .gte('amount', tx.amount - 0.5)
      .lte('amount', tx.amount + 0.5)
      .limit(5)

    const realDupe = findDuplicateMatch(
      { date: tx.date, amount: tx.amount, vendor: tx.vendor },
      (dupes ?? []).map(d => ({ id: d.id, amount: Number(d.amount), date: d.date ?? '', vendor: d.vendor })),
    )

    if (realDupe) {
      return { error: `Posible duplicado: ya existe una tx similar del ${realDupe.date} por ${realDupe.amount}` }
    }
  }

  // Insert transaction (year/month/day/weekday are generated columns — omit them)
  const { data: insertedTx, error: txErr } = await admin.from('transactions').insert({
    user_id:          user.id,
    date:             tx.date,
    vendor:           tx.vendor,
    concept:          tx.concept,
    amount:           tx.amount,
    currency_code:    tx.currency_code,
    movement_type:    tx.movement_type,
    category_code:    tx.category_code ?? null,
    expense_group:    tx.expense_group ?? null,
    is_passive_income: tx.is_passive_income ?? false,
    is_settlement:    false,
    is_survival_expense: false,
    notes:            tx.notes ?? null,
    source:           'email',
    loan_id:          tx.loan_id ?? null,
  }).select('id').single()

  if (txErr) return { error: txErr.message }

  // Optionally link to a savings envelope
  if (tx.envelope_id) {
    const envMovType = tx.movement_type === 'income' ? 'deposito' : 'retiro'
    const isDebit    = envMovType === 'retiro'
    // Always use the CRC amount the user entered — do NOT multiply by exchange rate here,
    // because tx.amount is already in CRC (or the user has manually converted it).
    const crcAmount = tx.amount
    await admin.from('envelope_movements').insert({
      user_id:       user.id,
      envelope_id:   tx.envelope_id,
      date:          tx.date,
      source_tx_id:  insertedTx.id,
      amount:        isDebit ? -Math.abs(crcAmount) : Math.abs(crcAmount),
      movement_type: envMovType,
      notes:         tx.concept,
    } as never)
    revalidatePath('/liquidez')
  }

  // Mark confirmed
  const { error: updErr } = await admin
    .from('transaction_inbox')
    .update({ status: 'confirmed' })
    .eq('id', inboxId)
    .eq('user_id', user.id)

  if (updErr) return { error: updErr.message }

  revalidatePath('/movimientos')
  revalidatePath('/resumen')
  return { error: null }
}

export async function discardInboxItem(inboxId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await createAdminClient()
    .from('transaction_inbox')
    .update({ status: 'discarded' })
    .eq('id', inboxId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/movimientos')
  return { error: null }
}

// Detected-internal-transfer path: registers a real sobre-to-sobre transfer
// (same mechanism /liquidez uses) instead of a transactions row — money
// moving between the user's own accounts isn't income or expense, so it
// shouldn't land in that ledger at all.
export async function confirmInboxItemAsTransfer(
  inboxId: string,
  data: { fromEnvelopeId: string; toEnvelopeId: string; date: string; amount: number; notes?: string },
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  if (data.fromEnvelopeId === data.toEnvelopeId) return { error: 'El sobre origen y destino no pueden ser el mismo' }

  const res = await transferBetweenEnvelopes(data.fromEnvelopeId, data.toEnvelopeId, {
    date: data.date, amount: data.amount, notes: data.notes,
  })
  if (res?.error) return { error: res.error }

  const admin = createAdminClient()
  const { error } = await admin
    .from('transaction_inbox')
    .update({ status: 'confirmed' })
    .eq('id', inboxId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/movimientos')
  revalidatePath('/liquidez')
  return { error: null }
}

export async function insertManualInboxItem(
  subject: string,
  snippet: string,
  extracted: ExtractedFields | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const emailId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const { error } = await createAdminClient()
    .from('transaction_inbox')
    .insert({
      user_id:     user.id,
      email_id:    emailId,
      email_date:  new Date().toISOString(),
      raw_subject: subject || 'Correo manual',
      raw_snippet: snippet.slice(0, 500),
      extracted:   extracted as never,
      status:      'pending',
    })

  if (error) return { error: error.message }

  revalidatePath('/movimientos')
  return { error: null }
}

export async function getPendingCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count } = await createAdminClient()
    .from('transaction_inbox')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'pending')

  return count ?? 0
}

export async function reExtractInboxItem(inboxId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: item } = await admin
    .from('transaction_inbox')
    .select('raw_subject, raw_snippet')
    .eq('id', inboxId)
    .eq('user_id', user.id)
    .single()

  if (!item) return { error: 'Ítem no encontrado' }

  const content = [
    item.raw_subject ? `Asunto: ${item.raw_subject}` : '',
    item.raw_snippet ? `Cuerpo:\n${item.raw_snippet}` : '',
  ].filter(Boolean).join('\n\n')

  if (!content.trim()) return { error: 'Sin contenido para re-extraer' }

  const anthropic = new Anthropic()
  const today = new Date().toISOString().slice(0, 10)
  const aiRes = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system:     RE_EXTRACT_SYSTEM.replace('__TODAY__', today),
    messages:   [{ role: 'user', content }],
  })

  const raw = aiRes.content[0]?.type === 'text' ? aiRes.content[0].text.trim() : ''
  let extracted: Record<string, unknown> | null = null
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>
      if (!parsed.skip) extracted = parsed
    }
  } catch { /* skip */ }

  if (extracted) {
    const { data: registeredAccounts } = await admin
      .from('financial_accounts')
      .select('id, name, account_type, custodio, last4')
      .eq('user_id', user.id)
      .not('last4', 'is', null)
    if (registeredAccounts && registeredAccounts.length > 0) {
      const { matched_account, matched_counterparty, is_internal_transfer } = matchAccountRefs(
        { account_ref: extracted.account_ref as string | null, counterparty_ref: extracted.counterparty_ref as string | null },
        registeredAccounts,
      )
      if (matched_account) {
        extracted.matched_account = matched_account
        extracted.is_credit_card = matched_account.account_type === 'credit_card'
      }
      if (matched_counterparty) extracted.matched_counterparty = matched_counterparty
      if (is_internal_transfer) extracted.is_internal_transfer = true
    }
  }

  const { error } = await admin
    .from('transaction_inbox')
    .update({ extracted: extracted as never })
    .eq('id', inboxId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/movimientos')
  return { error: null }
}

export async function batchConfirmHighConfidence(): Promise<{ confirmed: number; skipped: number; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { confirmed: 0, skipped: 0, error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: items } = await admin
    .from('transaction_inbox')
    .select('id, extracted')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .limit(50)

  if (!items || items.length === 0) return { confirmed: 0, skipped: 0, error: null }

  const highItems = items.filter(i => {
    const ext = i.extracted as ExtractedFields | null
    return ext?.confidence === 'high' && ext.amount > 0 && ext.vendor
  })

  let confirmed = 0
  let skipped = 0
  for (const item of highItems) {
    const ext = item.extracted as ExtractedFields
    const res = await confirmInboxItem(item.id, {
      date:              ext.date,
      vendor:            ext.vendor,
      concept:           ext.concept,
      amount:            ext.amount,
      currency_code:     ext.currency,
      movement_type:     ext.movement_type,
      category_code:     ext.category_code,
      expense_group:     ext.expense_group,
      is_passive_income: ext.is_passive_income,
    })
    if (res.error) skipped++
    else confirmed++
  }

  return { confirmed, skipped, error: null }
}

export async function batchDiscardByAge(maxAgeDays: number | null): Promise<{ discarded: number; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { discarded: 0, error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: items } = await admin
    .from('transaction_inbox')
    .select('id, email_date, created_at')
    .eq('user_id', user.id)
    .eq('status', 'pending')

  if (!items || items.length === 0) return { discarded: 0, error: null }

  const cutoff = maxAgeDays != null ? Date.now() - maxAgeDays * 86400000 : null
  const ids = items
    .filter(i => cutoff === null || new Date(i.email_date ?? i.created_at).getTime() < cutoff)
    .map(i => i.id)

  if (ids.length === 0) return { discarded: 0, error: null }

  const { error } = await admin
    .from('transaction_inbox')
    .update({ status: 'discarded' })
    .in('id', ids)
    .eq('user_id', user.id)

  if (error) return { discarded: 0, error: error.message }

  revalidatePath('/movimientos')
  return { discarded: ids.length, error: null }
}

export async function suggestCategory(vendor: string): Promise<string | null> {
  if (!vendor.trim()) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await createAdminClient()
    .from('transactions')
    .select('category_code')
    .eq('user_id', user.id)
    .ilike('vendor', `%${vendor}%`)
    .not('category_code', 'is', null)
    .limit(30)

  if (!data || data.length === 0) return null

  const freq: Record<string, number> = {}
  for (const row of data) {
    if (row.category_code) freq[row.category_code] = (freq[row.category_code] ?? 0) + 1
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]
  return top ? top[0] : null
}

// ── Payment reminders ────────────────────────────────────────────────────────

export type PaymentReminder = {
  id: string
  name: string
  amount: number | null
  currency_code: string
  due_day: number
  notes: string | null
  is_active: boolean
}

export async function getPaymentReminders(): Promise<PaymentReminder[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await createAdminClient()
    .from('payment_reminders')
    .select('id, name, amount, currency_code, due_day, notes, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('due_day')

  return (data ?? []) as PaymentReminder[]
}

export async function upsertPaymentReminder(
  reminder: Omit<PaymentReminder, 'id' | 'is_active'> & { id?: string },
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  if (reminder.id) {
    const { error } = await admin
      .from('payment_reminders')
      .update({ name: reminder.name, amount: reminder.amount, currency_code: reminder.currency_code, due_day: reminder.due_day, notes: reminder.notes })
      .eq('id', reminder.id)
      .eq('user_id', user.id)
    return { error: error?.message ?? null }
  }

  const { error } = await admin
    .from('payment_reminders')
    .insert({ user_id: user.id, name: reminder.name, amount: reminder.amount, currency_code: reminder.currency_code, due_day: reminder.due_day, notes: reminder.notes ?? null, is_active: true })
  return { error: error?.message ?? null }
}

export async function deletePaymentReminder(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await createAdminClient()
    .from('payment_reminders')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  return { error: error?.message ?? null }
}

// ── Reminder suggestions from transaction history ─────────────────────────────

export type ReminderSuggestion = {
  vendor: string
  amount: number
  currency_code: string
  due_day: number
  frequency: number
}

export async function suggestPaymentReminders(): Promise<ReminderSuggestion[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const since = new Date()
  since.setMonth(since.getMonth() - 6)

  const { data: txs } = await createAdminClient()
    .from('transactions')
    .select('vendor, amount, currency_code, date')
    .eq('user_id', user.id)
    .eq('movement_type', 'expense')
    .gte('date', since.toISOString().slice(0, 10))
    .not('vendor', 'is', null)
    .not('amount', 'is', null)
    .limit(600)

  if (!txs || txs.length === 0) return []

  const groups: Record<string, { amounts: number[]; days: number[]; currency: string; origName: string }> = {}
  for (const tx of txs) {
    if (!tx.vendor || !tx.amount || !tx.date) continue
    const key = tx.vendor.toLowerCase().trim()
    if (!groups[key]) groups[key] = { amounts: [], days: [], currency: tx.currency_code ?? 'CRC', origName: tx.vendor }
    groups[key].amounts.push(Number(tx.amount))
    groups[key].days.push(new Date(tx.date + 'T12:00:00').getDate())
  }

  const suggestions: ReminderSuggestion[] = []

  for (const data of Object.values(groups)) {
    if (data.amounts.length < 3) continue

    const avg = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length
    // Skip vendors with wildly varying amounts — not recurring fixed payments
    const tooVariable = data.amounts.some(a => Math.abs(a - avg) / avg > 0.5)
    if (tooVariable) continue

    const dayFreq: Record<number, number> = {}
    for (const d of data.days) dayFreq[d] = (dayFreq[d] ?? 0) + 1
    const dueDay = parseInt(Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0][0])

    suggestions.push({
      vendor:        data.origName,
      amount:        Math.round(avg),
      currency_code: data.currency,
      due_day:       dueDay,
      frequency:     data.amounts.length,
    })
  }

  return suggestions.sort((a, b) => b.frequency - a.frequency).slice(0, 8)
}
