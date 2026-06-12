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

export type SelfLoanPayment = {
  id: string
  amount: number
  payment_date: string
  notes: string | null
  from_envelope_id: string | null
}

export async function getSelfLoanHistory(loanId: string): Promise<SelfLoanPayment[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data: loan } = await admin
    .from('self_loans')
    .select('id')
    .eq('id', loanId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!loan) return []

  const { data } = await admin
    .from('self_loan_payments')
    .select('id, amount, payment_date, notes, from_envelope_id')
    .eq('self_loan_id', loanId)
    .order('payment_date', { ascending: false })

  return (data ?? []).map(p => ({
    id: p.id,
    amount: Number(p.amount),
    payment_date: p.payment_date,
    notes: (p as { notes?: string | null }).notes ?? null,
    from_envelope_id: (p as { from_envelope_id?: string | null }).from_envelope_id ?? null,
  }))
}

async function applyPaymentMovements(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  loanId: string,
  paymentId: string,
  payment: { amount: number; date: string; notes?: string; from_envelope_id?: string },
) {
  const { data: loan } = await admin
    .from('self_loans')
    .select('source_envelope_id, envelope_split')
    .eq('id', loanId)
    .single()
  if (!loan) return { error: 'Préstamo no encontrado' }

  const notes = `Abono autopréstamo${payment.notes ? ` · ${payment.notes}` : ''}`
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
        const { error } = await admin.from('envelope_movements').insert({
          user_id: userId, envelope_id: entry.envelope_id,
          date: payment.date, amount: Math.abs(portion),
          movement_type: 'traslado_in', notes,
          self_loan_payment_id: paymentId,
        } as never)
        if (error) return { error: error.message }
      }
    }
  } else if (loan.source_envelope_id) {
    const { error } = await admin.from('envelope_movements').insert({
      user_id: userId, envelope_id: loan.source_envelope_id,
      date: payment.date, amount: Math.abs(payment.amount),
      movement_type: 'traslado_in', notes,
      self_loan_payment_id: paymentId,
    } as never)
    if (error) return { error: error.message }
  }

  if (payment.from_envelope_id) {
    const { error } = await admin.from('envelope_movements').insert({
      user_id: userId, envelope_id: payment.from_envelope_id,
      date: payment.date, amount: -Math.abs(payment.amount),
      movement_type: 'traslado_out', notes,
      self_loan_payment_id: paymentId,
    } as never)
    if (error) return { error: error.message }
  }

  return { error: null }
}

async function recalcLoan(
  admin: ReturnType<typeof createAdminClient>,
  loanId: string,
) {
  const { data: payments } = await admin
    .from('self_loan_payments')
    .select('amount')
    .eq('self_loan_id', loanId)

  const totalRepaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)

  const { data: loan } = await admin
    .from('self_loans')
    .select('original_amount')
    .eq('id', loanId)
    .single()

  const newStatus = totalRepaid === 0 ? 'pending'
    : totalRepaid >= Number(loan?.original_amount ?? 0) ? 'paid'
    : 'partial'

  await admin.from('self_loans')
    .update({ amount_repaid: totalRepaid, status: newStatus })
    .eq('id', loanId)
}

export async function recordSelfLoanPayment(
  loanId: string,
  payment: { amount: number; date: string; notes?: string; from_envelope_id?: string },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  const { data: loan, error: loanErr } = await admin
    .from('self_loans')
    .select('id, original_amount, amount_repaid, status')
    .eq('id', loanId)
    .eq('user_id', user.id)
    .single()

  if (loanErr || !loan) return { error: 'Préstamo no encontrado' }
  if (loan.status === 'paid') return { error: 'Este préstamo ya está saldado' }

  const newRepaid = Number(loan.amount_repaid) + payment.amount
  const newBalance = Math.max(0, Number(loan.original_amount) - newRepaid)
  const newStatus = newBalance === 0 ? 'paid' : newRepaid > 0 ? 'partial' : 'pending'

  const { data: payRow, error: payErr } = await admin.from('self_loan_payments').insert({
    self_loan_id: loanId,
    amount: payment.amount,
    payment_date: payment.date,
    notes: payment.notes || null,
    from_envelope_id: payment.from_envelope_id || null,
  }).select('id').single()
  if (payErr || !payRow) return { error: payErr?.message ?? 'Error al insertar pago' }

  const { error: updErr } = await admin
    .from('self_loans')
    .update({ amount_repaid: newRepaid, status: newStatus })
    .eq('id', loanId)
  if (updErr) return { error: updErr.message }

  const movErr = await applyPaymentMovements(admin, user.id, loanId, payRow.id, payment)
  if (movErr.error) return { error: movErr.error }

  revalidatePath('/liquidez')
  return { ok: true }
}

export async function updateSelfLoanPayment(
  paymentId: string,
  loanId: string,
  data: { amount: number; date: string; notes?: string; from_envelope_id?: string },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  // Verify ownership
  const { data: loan } = await admin
    .from('self_loans')
    .select('id')
    .eq('id', loanId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!loan) return { error: 'No autorizado' }

  // Delete old envelope movements linked to this payment (self_loan_payment_id is stored on movements)
  // Fall back to date+notes match for old payments that pre-date the migration
  const { data: linkedMovs } = await admin
    .from('envelope_movements')
    .select('id')
    .eq('user_id', user.id)
    .eq('self_loan_payment_id' as never, paymentId)

  if (linkedMovs && linkedMovs.length > 0) {
    await admin.from('envelope_movements')
      .delete()
      .in('id', linkedMovs.map(m => m.id))
  }

  // Update the payment record
  const { error: updErr } = await admin.from('self_loan_payments')
    .update({
      amount: data.amount,
      payment_date: data.date,
      notes: data.notes || null,
      from_envelope_id: data.from_envelope_id || null,
    })
    .eq('id', paymentId)
  if (updErr) return { error: updErr.message }

  // Re-create movements with new values
  const movErr = await applyPaymentMovements(admin, user.id, loanId, paymentId, data)
  if (movErr.error) return { error: movErr.error }

  // Recalc loan totals from all payments
  await recalcLoan(admin, loanId)

  revalidatePath('/liquidez')
  return { ok: true }
}

export async function deleteSelfLoanPayment(paymentId: string, loanId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  const { data: loan } = await admin
    .from('self_loans')
    .select('id')
    .eq('id', loanId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!loan) return { error: 'No autorizado' }

  // Delete linked envelope movements
  const { data: linkedMovs } = await admin
    .from('envelope_movements')
    .select('id')
    .eq('user_id', user.id)
    .eq('self_loan_payment_id' as never, paymentId)

  if (linkedMovs && linkedMovs.length > 0) {
    await admin.from('envelope_movements')
      .delete()
      .in('id', linkedMovs.map(m => m.id))
  }

  const { error } = await admin.from('self_loan_payments')
    .delete()
    .eq('id', paymentId)
  if (error) return { error: error.message }

  await recalcLoan(admin, loanId)

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
