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
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

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
    await admin.from('envelope_movements').insert({
      user_id:       user.id,
      envelope_id:   tx.envelope_id,
      date:          tx.date,
      amount:        tx.amount,
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
