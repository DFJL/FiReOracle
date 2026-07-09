'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ExtractedFields = {
  amount: number
  currency: 'CRC' | 'USD'
  vendor: string
  concept: string
  date: string
  movement_type: 'expense' | 'income' | 'cash_withdrawal'
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

  // Insert transaction
  const d = new Date(tx.date)
  const { data: insertedTx, error: txErr } = await admin.from('transactions').insert({
    user_id:          user.id,
    date:             tx.date,
    year:             d.getFullYear(),
    month:            d.getMonth() + 1,
    day:              d.getDate(),
    weekday:          d.getDay(),
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
    })
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
