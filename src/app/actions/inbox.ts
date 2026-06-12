'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
export { isCreditCardEmail } from '@/lib/inbox-utils'

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
- is_credit_card: true si el correo indica claramente que es una transacción de TARJETA DE CRÉDITO (TC, crédito, Visa Crédito, etc.); false si es débito, SINPE, transferencia, retiro u otro instrumento; omitir si no es claro
- confidence: "high" si tenés todos los datos claramente, "medium" si hay algo inferido, "low" si hay ambigüedad
FORMATO — respondé SOLO con JSON:
{"amount":15000,"currency":"CRC","vendor":"Walmart","concept":"Compra supermercado","date":"2026-06-01","movement_type":"expense","is_credit_card":true,"category_code":"FOOD_MARKET","confidence":"high"}
Si no es correo bancario: {"skip":true,"reason":"No es notificación de transacción"}`

export type ExtractedFields = {
  amount: number
  currency: 'CRC' | 'USD'
  vendor: string
  concept: string
  date: string
  movement_type: 'expense' | 'income' | 'cash_withdrawal'
  is_credit_card?: boolean
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
}


export async function getInboxItems(): Promise<InboxItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('transaction_inbox')
    .select('id, email_id, email_date, raw_subject, raw_snippet, extracted, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return (data ?? []) as InboxItem[]
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
    // Soft duplicate check: same movement_type + amount within ±1% on ±1 day
    // Also fetch vendor so we can skip the warning when vendors are clearly different
    const dayBefore = new Date(new Date(tx.date).getTime() - 86400000).toISOString().slice(0, 10)
    const dayAfter  = new Date(new Date(tx.date).getTime() + 86400000).toISOString().slice(0, 10)
    const { data: dupes } = await admin
      .from('transactions')
      .select('id, amount, date, vendor, concept')
      .eq('user_id', user.id)
      .eq('movement_type', tx.movement_type)
      .gte('date', dayBefore)
      .lte('date', dayAfter)
      .gte('amount', tx.amount * 0.99)
      .lte('amount', tx.amount * 1.01)
      .limit(5)

    const newVendor = tx.vendor?.trim().toLowerCase() ?? ''
    const realDupe = (dupes ?? []).find(d => {
      const existVendor = (d.vendor as string | null)?.trim().toLowerCase() ?? ''
      // If both have vendors and neither contains the first 4 chars of the other → different place, not a dupe
      if (newVendor.length >= 4 && existVendor.length >= 4) {
        const overlap = newVendor.slice(0, 4) === existVendor.slice(0, 4)
          || existVendor.includes(newVendor.slice(0, 6))
          || newVendor.includes(existVendor.slice(0, 6))
        if (!overlap) return false
      }
      return true
    })

    if (realDupe) {
      return { error: `Posible duplicado: ya existe una tx similar del ${realDupe.date} por ${realDupe.amount}` }
    }
  }

  // Insert transaction (year/month/day/weekday are generated columns — omit them)
  const { error: txErr } = await admin.from('transactions').insert({
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
  })

  if (txErr) return { error: txErr.message }

  // Optionally link to a savings envelope
  if (tx.envelope_id) {
    const envMovType = tx.movement_type === 'income' ? 'deposito' : 'retiro'
    const isDebit    = envMovType === 'retiro'
    await admin.from('envelope_movements').insert({
      user_id:       user.id,
      envelope_id:   tx.envelope_id,
      date:          tx.date,
      amount:        isDebit ? -Math.abs(tx.amount) : Math.abs(tx.amount),
      movement_type: envMovType,
      notes:         tx.concept,
    })
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
