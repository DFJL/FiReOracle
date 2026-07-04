'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type DuplicateHit = {
  id: string
  date: string | null
  amount: number | string | null
  vendor: string | null
  concept: string | null
  movement_type: string | null
}

export async function checkDuplicateTransaction(input: {
  date: string
  amount: number
  vendor: string
  concept: string
  movement_type: 'expense' | 'income'
}): Promise<DuplicateHit[]> {
  if (!input.amount || input.amount <= 0) return []
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const d = new Date(input.date + 'T12:00:00')
  const from = new Date(d); from.setDate(d.getDate() - 3)
  const to   = new Date(d); to.setDate(d.getDate() + 3)

  const vendorClean   = input.vendor.trim().toLowerCase()
  const conceptClean  = input.concept.trim().toLowerCase()

  const { data } = await admin
    .from('transactions')
    .select('id, date, amount, vendor, concept, movement_type')
    .eq('user_id', user.id)
    .eq('movement_type', input.movement_type)
    .eq('amount', input.amount)
    .gte('date', from.toISOString().slice(0, 10))
    .lte('date', to.toISOString().slice(0, 10))
    .limit(5)

  if (!data?.length) return []

  // Secondary filter: vendor OR concept must loosely match
  return data.filter(tx => {
    const txVendor  = (tx.vendor  ?? '').toLowerCase()
    const txConcept = (tx.concept ?? '').toLowerCase()
    const vendorMatch  = vendorClean  && txVendor  && txVendor.includes(vendorClean.slice(0, 4))
    const conceptMatch = conceptClean && txConcept && txConcept.includes(conceptClean.slice(0, 4))
    return vendorMatch || conceptMatch
  })
}

export type TxEntryType = 'gasto' | 'ingreso' | 'ahorro' | 'traslado'

type CurrencyFields = {
  currency_code: 'CRC' | 'USD'
  exchange_rate_used?: number   // required when currency_code = 'USD'
  amount_usd?: number           // filled when currency_code = 'USD'
}

// Optional side-effects on gasto/ingreso
type SideEffects = {
  debit_envelope_id?: string    // retiro from this envelope
  loan_id?: string              // add amount to this existing self_loan
  new_loan_description?: string // create a new self_loan with this description
  mortgage_loan_id?: string     // tag transaction with a mortgage/bank loan (loans table)
}

export type CreateTransactionInput =
  | ({
      type: 'gasto'
      date: string
      amount: number             // always CRC
      vendor: string
      concept: string
      expense_group: string
      category_code?: string
      is_settlement?: boolean
      is_survival_expense?: boolean
      notes?: string
    } & CurrencyFields & SideEffects)
  | ({
      type: 'ingreso'
      date: string
      amount: number
      vendor: string
      concept: string
      category_code?: string
      is_passive_income: boolean
      is_settlement?: boolean    // true = liquidación de inversión (no cuenta como ingreso real)
      investment_bucket_id?: string  // optional: which bucket this liquidation reduces
      notes?: string
    } & CurrencyFields & SideEffects)
  | {
      type: 'ahorro'
      date: string
      amount: number
      envelope_id: string
      vendor?: string            // optional: for vendor-based portfolio bucket tracking
      concept?: string
      notes?: string
    }
  | {
      type: 'traslado'
      date: string
      amount: number
      from_envelope_id: string
      to_envelope_id: string
      notes?: string
    }

async function getEnvelopeBalance(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  envelopeId: string,
): Promise<number> {
  const { data } = await admin
    .from('envelope_movements')
    .select('amount, movement_type')
    .eq('user_id', userId)
    .eq('envelope_id', envelopeId)
  return (data ?? [])
    .reduce((sum: number, m: { amount: string | number }) => sum + Number(m.amount), 0)
}

async function applySideEffects(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  input: { date: string; amount: number; debit_envelope_id?: string; loan_id?: string; new_loan_description?: string; concept?: string; vendor?: string; notes?: string },
): Promise<string | null> {
  if (input.debit_envelope_id) {
    const balance = await getEnvelopeBalance(admin, userId, input.debit_envelope_id)
    const debit = Math.abs(input.amount)
    if (balance < debit) {
      const fmt = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2 })
      return `Saldo insuficiente en sobre (disponible ₡${fmt(balance)}, requerido ₡${fmt(debit)})`
    }
    const { error } = await admin.from('envelope_movements').insert({
      user_id: userId,
      envelope_id: input.debit_envelope_id,
      movement_type: 'retiro',
      amount: -Math.abs(input.amount),
      date: input.date,
      notes: `Tx: ${input.concept || input.vendor || ''}`.trim(),
    })
    if (error) return error.message
    revalidatePath('/liquidez')
  }

  if (input.new_loan_description) {
    const { data: acct } = await admin
      .from('financial_accounts')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    if (!acct) return 'No hay cuentas financieras configuradas'

    const { error } = await admin.from('self_loans').insert({
      user_id: userId,
      description: input.new_loan_description,
      original_amount: input.amount,
      loan_date: input.date,
      source_account_id: acct.id,
      source_envelope_id: input.debit_envelope_id ?? null,
      currency_code: 'CRC',
      status: 'pending',
      notes: input.notes?.trim() || null,
    })
    if (error) return error.message
    revalidatePath('/liquidez')
  } else if (input.loan_id) {
    const { data: loan } = await admin
      .from('self_loans')
      .select('original_amount')
      .eq('id', input.loan_id)
      .eq('user_id', userId)
      .maybeSingle()
    if (!loan) return 'Autopréstamo no encontrado'

    const { error } = await admin
      .from('self_loans')
      .update({ original_amount: Number(loan.original_amount) + input.amount })
      .eq('id', input.loan_id)
    if (error) return error.message
    revalidatePath('/liquidez')
  }

  return null
}

export async function createTransaction(input: CreateTransactionInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  if (input.type === 'gasto') {
    const isUSD = input.currency_code === 'USD'
    const { data: txData, error } = await admin.from('transactions').insert({
      user_id: user.id,
      date: input.date,
      amount: input.amount,
      amount_usd: isUSD ? input.amount_usd ?? null : null,
      exchange_rate_used: isUSD ? input.exchange_rate_used ?? null : null,
      currency_code: input.currency_code ?? 'CRC',
      vendor: input.vendor.trim() || null,
      concept: input.concept.trim() || null,
      expense_group: input.expense_group,
      category_code: input.category_code ?? null,
      movement_type: 'expense',
      is_passive_income: false,
      is_settlement: input.is_settlement ?? false,
      is_survival_expense: input.is_survival_expense ?? false,
      loan_id: input.mortgage_loan_id ?? null,
      source: 'manual',
      notes: input.notes?.trim() || null,
    }).select('id').single()
    if (error) return { error: error.message }
    if (input.debit_envelope_id || input.loan_id || input.new_loan_description) {
      const sideErr = await applySideEffects(admin, user.id, input)
      if (sideErr) return { error: sideErr }
    }
  }

  else if (input.type === 'ingreso') {
    const isUSD = input.currency_code === 'USD'
    const { error } = await admin.from('transactions').insert({
      user_id: user.id,
      date: input.date,
      amount: input.amount,
      amount_usd: isUSD ? input.amount_usd ?? null : null,
      exchange_rate_used: isUSD ? input.exchange_rate_used ?? null : null,
      currency_code: input.currency_code ?? 'CRC',
      vendor: input.vendor.trim() || null,
      concept: input.concept.trim() || null,
      expense_group: 'na',
      category_code: input.category_code ?? null,
      investment_bucket_id: input.investment_bucket_id ?? null,
      movement_type: 'income',
      is_passive_income: input.is_passive_income,
      is_settlement: input.is_settlement ?? false,
      is_survival_expense: false,
      loan_id: input.mortgage_loan_id ?? null,
      source: 'manual',
      notes: input.notes?.trim() || null,
    })
    if (error) return { error: error.message }
    if (input.debit_envelope_id || input.loan_id || input.new_loan_description) {
      const sideErr = await applySideEffects(admin, user.id, input)
      if (sideErr) return { error: sideErr }
    }
  }

  else if (input.type === 'ahorro') {
    // Transaction record: savings outflow in cash flow
    const { error: txErr } = await admin.from('transactions').insert({
      user_id: user.id,
      date: input.date,
      amount: input.amount,
      currency_code: 'CRC',
      vendor: input.vendor?.trim() || null,
      concept: input.concept?.trim() || 'Ahorro',
      expense_group: 'objetivos_financieros',
      category_code: 'SAVINGS',
      movement_type: 'expense',
      is_passive_income: false,
      is_settlement: false,
      is_survival_expense: false,
      source: 'manual',
      notes: input.notes?.trim() || null,
    })
    if (txErr) return { error: txErr.message }

    // Envelope movement: deposito to the chosen envelope
    const { error: emErr } = await admin.from('envelope_movements').insert({
      user_id: user.id,
      envelope_id: input.envelope_id,
      movement_type: 'deposito',
      amount: input.amount,
      date: input.date,
      notes: input.notes?.trim() || 'Ahorro manual',
    })
    if (emErr) return { error: emErr.message }
    revalidatePath('/liquidez')
  }

  else if (input.type === 'traslado') {
    if (input.from_envelope_id === input.to_envelope_id) {
      return { error: 'El sobre origen y destino deben ser diferentes' }
    }
    const fromBalance = await getEnvelopeBalance(admin, user.id, input.from_envelope_id)
    if (fromBalance < input.amount) {
      const fmt = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2 })
      return { error: `Saldo insuficiente en sobre origen (disponible ₡${fmt(fromBalance)}, requerido ₡${fmt(input.amount)})` }
    }
    const { error: outErr } = await admin.from('envelope_movements').insert({
      user_id: user.id,
      envelope_id: input.from_envelope_id,
      movement_type: 'traslado_out',
      amount: -input.amount,
      date: input.date,
      notes: input.notes?.trim() || 'Traslado',
    })
    if (outErr) return { error: outErr.message }

    const { error: inErr } = await admin.from('envelope_movements').insert({
      user_id: user.id,
      envelope_id: input.to_envelope_id,
      movement_type: 'traslado_in',
      amount: input.amount,
      date: input.date,
      notes: input.notes?.trim() || 'Traslado',
    })
    if (inErr) return { error: inErr.message }
    revalidatePath('/liquidez')
  }

  revalidatePath('/resumen')
  revalidatePath('/flujo')
  return { error: null }
}

export type UpdateTransactionInput = {
  date?: string
  amount?: number
  vendor?: string | null
  concept?: string | null
  category_code?: string | null
  expense_group?: string
  notes?: string | null
  is_passive_income?: boolean
  is_settlement?: boolean
  is_survival_expense?: boolean
  investment_bucket_id?: string | null
}

export async function updateTransaction(id: string, input: UpdateTransactionInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('transactions')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/resumen')
  revalidatePath('/flujo')
  revalidatePath('/progreso')
  revalidatePath('/inversiones')
  revalidatePath('/patrimonio')
  return { error: null }
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/resumen')
  revalidatePath('/flujo')
  revalidatePath('/progreso')
  revalidatePath('/inversiones')
  revalidatePath('/patrimonio')
  return { error: null }
}
