'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type AutoprestamoInput = {
  description: string
  amount: number
  date: string
  envelope_id: string
  notes?: string
}

export async function createAutoprestamo(data: AutoprestamoInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  const { data: acct } = await admin
    .from('financial_accounts')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!acct) return { error: 'No hay cuentas financieras configuradas' }

  // Debit the envelope
  const { error: movErr } = await admin.from('envelope_movements').insert({
    user_id: user.id,
    envelope_id: data.envelope_id,
    date: data.date,
    amount: -Math.abs(data.amount),
    movement_type: 'retiro',
    notes: `Autopréstamo: ${data.description}${data.notes ? ` · ${data.notes}` : ''}`,
  })
  if (movErr) return { error: movErr.message }

  // Create the self-loan record
  const { error: loanErr } = await admin.from('self_loans').insert({
    user_id: user.id,
    description: data.description,
    original_amount: Math.abs(data.amount),
    loan_date: data.date,
    source_account_id: acct.id,
    source_envelope_id: data.envelope_id,
    currency_code: 'CRC',
    status: 'pending',
    notes: data.notes || null,
  })
  if (loanErr) return { error: loanErr.message }

  revalidatePath('/liquidez')
  return { ok: true }
}

export type SelfLoanFormData = {
  description: string
  original_amount: number
  loan_date: string
  source_envelope_id: string | null
  notes?: string
}

export async function createSelfLoan(data: SelfLoanFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  // Pick a placeholder account_id (required by schema) — use first financial account
  const { data: acct } = await admin
    .from('financial_accounts')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!acct) return { error: 'No hay cuentas financieras configuradas' }

  const { error } = await admin.from('self_loans').insert({
    user_id: user.id,
    description: data.description,
    original_amount: data.original_amount,
    loan_date: data.loan_date,
    source_account_id: acct.id,
    source_envelope_id: data.source_envelope_id,
    currency_code: 'CRC',
    status: 'pending',
    notes: data.notes || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  return { ok: true }
}

export async function recordSelfLoanPayment(
  loanId: string,
  payment: { amount: number; date: string; notes?: string },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  // Fetch loan to get current state + source envelope
  const { data: loan, error: loanErr } = await admin
    .from('self_loans')
    .select('id, original_amount, amount_repaid, source_envelope_id, status')
    .eq('id', loanId)
    .eq('user_id', user.id)
    .single()

  if (loanErr || !loan) return { error: 'Préstamo no encontrado' }
  if (loan.status === 'paid') return { error: 'Este préstamo ya está saldado' }

  const newRepaid = Number(loan.amount_repaid) + payment.amount
  const newBalance = Math.max(0, Number(loan.original_amount) - newRepaid)
  const newStatus = newBalance === 0 ? 'paid' : newRepaid > 0 ? 'partial' : 'pending'

  // Insert payment record
  const { error: payErr } = await admin.from('self_loan_payments').insert({
    self_loan_id: loanId,
    amount: payment.amount,
    payment_date: payment.date,
    notes: payment.notes || null,
  })
  if (payErr) return { error: payErr.message }

  // Update loan totals
  const { error: updErr } = await admin
    .from('self_loans')
    .update({ amount_repaid: newRepaid, balance_remaining: newBalance, status: newStatus })
    .eq('id', loanId)
  if (updErr) return { error: updErr.message }

  // Credit the source envelope if set
  if (loan.source_envelope_id) {
    const { error: movErr } = await supabase.from('envelope_movements').insert({
      user_id: user.id,
      envelope_id: loan.source_envelope_id,
      date: payment.date,
      amount: Math.abs(payment.amount),
      movement_type: 'traslado_in',
      notes: `Abono autopréstamo${payment.notes ? ` · ${payment.notes}` : ''}`,
    })
    if (movErr) return { error: movErr.message }
  }

  revalidatePath('/liquidez')
  return { ok: true }
}
