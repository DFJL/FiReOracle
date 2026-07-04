'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function recordLoanPayment(
  loanId: string,
  data: {
    payment_date: string
    payment_type: 'normal' | 'extra' | 'partial'
    amount: number
    balance_before: number
    balance_after: number
    rate_applied: number
    notes?: string
    transaction_id?: string
  },
): Promise<{ error: string | null; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  const { data: loanRow } = await admin
    .from('loans')
    .select('name, lender, currency_code')
    .eq('id', loanId)
    .eq('user_id', user.id)
    .single()

  const principal = data.balance_before - data.balance_after
  const interest = Math.max(0, data.amount - principal)

  // Auto-create the movimiento so the payment appears in resumen/movimientos too
  let txId = data.transaction_id ?? null
  if (!txId && loanRow) {
    const { data: tx } = await admin.from('transactions').insert({
      user_id:            user.id,
      date:               data.payment_date,
      amount:             data.amount,
      currency_code:      loanRow.currency_code,
      vendor:             loanRow.lender,
      concept:            data.notes?.trim() || `Pago préstamo ${loanRow.name}`,
      expense_group:      'necesario',
      movement_type:      'expense',
      is_passive_income:  false,
      is_settlement:      false,
      is_survival_expense: false,
      loan_id:            loanId,
      source:             'manual',
      notes:              data.notes?.trim() || null,
    }).select('id').single()
    if (tx) txId = tx.id
  }

  const { data: inserted, error: insertErr } = await admin.from('loan_payments').insert({
    loan_id:        loanId,
    user_id:        user.id,
    payment_date:   data.payment_date,
    payment_type:   data.payment_type,
    amount:         data.amount,
    principal,
    interest,
    insurance:      0,
    balance_before: data.balance_before,
    balance_after:  data.balance_after,
    rate_applied:   data.rate_applied,
    notes:          data.notes ?? null,
    transaction_id: txId,
  }).select('id').single()

  if (insertErr) return { error: insertErr.message }

  const { error: updateErr } = await admin
    .from('loans')
    .update({ current_balance: data.balance_after })
    .eq('id', loanId)
    .eq('user_id', user.id)

  if (updateErr) return { error: updateErr.message }

  revalidatePath('/prestamos')
  revalidatePath('/patrimonio')
  revalidatePath('/resumen')
  revalidatePath('/flujo')
  return { error: null, id: inserted.id }
}

export type ActiveLoan = {
  id: string
  name: string
  lender: string
  currencyCode: string
  currentBalance: number
  interestRate: number
}

export async function getActiveLoans(): Promise<ActiveLoan[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await createAdminClient()
    .from('loans')
    .select('id, name, lender, currency_code, current_balance, interest_rate')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data ?? []).map(l => ({
    id:             l.id as string,
    name:           l.name as string,
    lender:         l.lender as string,
    currencyCode:   (l.currency_code ?? 'CRC') as string,
    currentBalance: Number(l.current_balance),
    interestRate:   Number(l.interest_rate),
  }))
}

export async function getLoanPaymentForTransaction(
  txId: string,
): Promise<{ loanPaymentId: string; loanId: string; loanName: string; balanceAfter: number } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await createAdminClient()
    .from('loan_payments')
    .select('id, loan_id, balance_after, loans(name)')
    .eq('user_id', user.id)
    .eq('transaction_id', txId)
    .maybeSingle()
  if (!data) return null
  return {
    loanPaymentId: data.id as string,
    loanId:        data.loan_id as string,
    loanName:      (data.loans as { name: string } | null)?.name ?? '',
    balanceAfter:  Number(data.balance_after),
  }
}

export async function linkTransactionToLoan(
  txId: string,
  loanId: string,
  data: {
    payment_date: string
    payment_type: 'normal' | 'extra' | 'partial'
    amount: number
    balance_before: number
    balance_after: number
    rate_applied: number
    notes?: string
  },
): Promise<{ error: string | null }> {
  return recordLoanPayment(loanId, { ...data, transaction_id: txId })
}

export async function updateLoanBalance(
  loanId: string,
  balance: number,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await createAdminClient()
    .from('loans')
    .update({ current_balance: balance })
    .eq('id', loanId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/prestamos')
  revalidatePath('/patrimonio')
  return { error: null }
}

export type CreateLoanInput = {
  name: string
  lender: string
  loan_type?: string
  currency_code?: string
  original_amount: number
  current_balance: number
  interest_rate: number
  monthly_insurance?: number
  start_date: string
  end_date: string
  payment_day?: number
  notes?: string
}

export async function createLoan(
  input: CreateLoanInput,
): Promise<{ error: string | null; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('loans')
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      lender: input.lender.trim(),
      loan_type: input.loan_type ?? 'mortgage',
      currency_code: input.currency_code ?? 'CRC',
      original_amount: input.original_amount,
      current_balance: input.current_balance,
      interest_rate: input.interest_rate,
      monthly_insurance: input.monthly_insurance ?? 0,
      start_date: input.start_date,
      end_date: input.end_date,
      payment_day: input.payment_day ?? 5,
      is_active: true,
      notes: input.notes?.trim() || null,
      sort_order: 0,  // new loans always appear first
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/prestamos')
  return { error: null, id: data.id }
}

export async function updateLoanPayment(
  paymentId: string,
  data: {
    payment_date: string
    payment_type: 'normal' | 'extra' | 'partial'
    amount: number
    balance_before: number
    balance_after: number
    rate_applied: number
    notes?: string
  },
  newLoanBalance?: number,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const principal = data.balance_before - data.balance_after
  const interest  = Math.max(0, data.amount - principal)

  const { data: payment, error: fetchErr } = await admin
    .from('loan_payments')
    .select('loan_id')
    .eq('id', paymentId)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !payment) return { error: fetchErr?.message ?? 'Pago no encontrado' }

  const { error: updErr } = await admin
    .from('loan_payments')
    .update({
      payment_date: data.payment_date,
      payment_type: data.payment_type,
      amount: data.amount,
      principal,
      interest,
      balance_before: data.balance_before,
      balance_after: data.balance_after,
      rate_applied: data.rate_applied,
      notes: data.notes ?? null,
    })
    .eq('id', paymentId)
    .eq('user_id', user.id)

  if (updErr) return { error: updErr.message }

  if (newLoanBalance !== undefined) {
    await admin
      .from('loans')
      .update({ current_balance: newLoanBalance })
      .eq('id', payment.loan_id as string)
      .eq('user_id', user.id)
  }

  revalidatePath('/prestamos')
  revalidatePath('/patrimonio')
  return { error: null }
}

export async function deleteLoanPayment(
  paymentId: string,
  loanId: string,
  restoreBalance: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  if (restoreBalance) {
    const { data: payment } = await admin
      .from('loan_payments')
      .select('balance_before')
      .eq('id', paymentId)
      .eq('user_id', user.id)
      .single()
    if (payment) {
      await admin.from('loans')
        .update({ current_balance: payment.balance_before })
        .eq('id', loanId)
        .eq('user_id', user.id)
    }
  }

  const { error } = await admin
    .from('loan_payments')
    .delete()
    .eq('id', paymentId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/prestamos')
  revalidatePath('/patrimonio')
  return { error: null }
}

export async function updateLoanSortOrder(
  loanId: string,
  sortOrder: number,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await createAdminClient()
    .from('loans')
    .update({ sort_order: sortOrder })
    .eq('id', loanId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/prestamos')
  return { error: null }
}
