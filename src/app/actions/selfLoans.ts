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

  const { error: movErr } = await admin.from('envelope_movements').insert({
    user_id: user.id,
    envelope_id: data.envelope_id,
    date: data.date,
    amount: -Math.abs(data.amount),
    movement_type: 'retiro',
    notes: `Autopréstamo: ${data.description}${data.notes ? ` · ${data.notes}` : ''}`,
  })
  if (movErr) return { error: movErr.message }

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
  sources: { envelope_id: string; amount: number }[]
  notes?: string
}

export async function createSelfLoan(data: SelfLoanFormData) {
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

  const validSources = data.sources.filter(s => s.envelope_id && s.amount > 0)
  const sumFromSources = validSources.reduce((s, e) => s + e.amount, 0)
  const originalAmount = validSources.length > 0 && sumFromSources > 0
    ? sumFromSources
    : data.original_amount

  if (originalAmount <= 0) return { error: 'Monto inválido' }

  for (const src of validSources) {
    const { error: movErr } = await admin.from('envelope_movements').insert({
      user_id: user.id,
      envelope_id: src.envelope_id,
      date: data.loan_date,
      amount: -Math.abs(src.amount),
      movement_type: 'retiro',
      notes: `Autopréstamo: ${data.description}${data.notes ? ` · ${data.notes}` : ''}`,
    })
    if (movErr) return { error: movErr.message }
  }

  const primaryEnvelopeId = validSources.length > 0 ? validSources[0].envelope_id : null
  const envelopeSplit = validSources.length > 1 ? validSources : null

  const { error } = await admin.from('self_loans').insert({
    user_id: user.id,
    description: data.description,
    original_amount: originalAmount,
    loan_date: data.loan_date,
    source_account_id: acct.id,
    source_envelope_id: primaryEnvelopeId,
    envelope_split: envelopeSplit,
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

  const { data: loan, error: loanErr } = await admin
    .from('self_loans')
    .select('id, original_amount, amount_repaid, source_envelope_id, envelope_split, status')
    .eq('id', loanId)
    .eq('user_id', user.id)
    .single()

  if (loanErr || !loan) return { error: 'Préstamo no encontrado' }
  if (loan.status === 'paid') return { error: 'Este préstamo ya está saldado' }

  const newRepaid = Number(loan.amount_repaid) + payment.amount
  const newBalance = Math.max(0, Number(loan.original_amount) - newRepaid)
  const newStatus = newBalance === 0 ? 'paid' : newRepaid > 0 ? 'partial' : 'pending'

  const { error: payErr } = await admin.from('self_loan_payments').insert({
    self_loan_id: loanId,
    amount: payment.amount,
    payment_date: payment.date,
    notes: payment.notes || null,
  })
  if (payErr) return { error: payErr.message }

  // balance_remaining is a GENERATED column — only update amount_repaid and status
  const { error: updErr } = await admin
    .from('self_loans')
    .update({ amount_repaid: newRepaid, status: newStatus })
    .eq('id', loanId)
  if (updErr) return { error: updErr.message }

  const split = loan.envelope_split as { envelope_id: string; amount: number }[] | null

  if (split && split.length > 0) {
    const totalOriginalSplit = split.reduce((s, e) => s + e.amount, 0)
    if (totalOriginalSplit > 0) {
      let credited = 0
      for (let i = 0; i < split.length; i++) {
        const entry = split[i]
        const isLast = i === split.length - 1
        const portion = isLast
          ? payment.amount - credited
          : Math.round((entry.amount / totalOriginalSplit) * payment.amount)
        credited += portion
        if (portion === 0) continue
        const { error: movErr } = await admin.from('envelope_movements').insert({
          user_id: user.id,
          envelope_id: entry.envelope_id,
          date: payment.date,
          amount: Math.abs(portion),
          movement_type: 'traslado_in',
          notes: `Abono autopréstamo${payment.notes ? ` · ${payment.notes}` : ''}`,
        })
        if (movErr) return { error: movErr.message }
      }
    }
  } else if (loan.source_envelope_id) {
    const { error: movErr } = await admin.from('envelope_movements').insert({
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

export async function updateLoanSources(
  loanId: string,
  sources: { envelope_id: string; amount: number }[],
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  const validSources = sources.filter(s => s.envelope_id && s.amount > 0)

  const { error } = await admin
    .from('self_loans')
    .update({
      source_envelope_id: validSources[0]?.envelope_id ?? null,
      envelope_split: validSources.length > 1 ? validSources : null,
    })
    .eq('id', loanId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  return { ok: true }
}
