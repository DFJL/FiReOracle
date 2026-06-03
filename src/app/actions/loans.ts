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
  },
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const principal = data.balance_before - data.balance_after
  const interest = Math.max(0, data.amount - principal)

  const { error: insertErr } = await admin.from('loan_payments').insert({
    loan_id: loanId,
    user_id: user.id,
    payment_date: data.payment_date,
    payment_type: data.payment_type,
    amount: data.amount,
    principal,
    interest,
    insurance: 0,
    balance_before: data.balance_before,
    balance_after: data.balance_after,
    rate_applied: data.rate_applied,
    notes: data.notes ?? null,
  })

  if (insertErr) return { error: insertErr.message }

  const { error: updateErr } = await admin
    .from('loans')
    .update({ current_balance: data.balance_after })
    .eq('id', loanId)
    .eq('user_id', user.id)

  if (updateErr) return { error: updateErr.message }

  revalidatePath('/prestamos')
  return { error: null }
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
  return { error: null }
}
