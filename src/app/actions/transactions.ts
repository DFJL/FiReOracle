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

export type TxEntryType = 'gasto' | 'ingreso' | 'ahorro' | 'traslado' | 'autoprestamo'

type CurrencyFields = {
  currency_code: 'CRC' | 'USD'
  exchange_rate_used?: number   // required when currency_code = 'USD'
  amount_usd?: number           // filled when currency_code = 'USD'
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
    } & CurrencyFields)
  | ({
      type: 'ingreso'
      date: string
      amount: number
      vendor: string
      concept: string
      category_code?: string
      is_passive_income: boolean
      is_settlement?: boolean    // true = liquidación de inversión (no cuenta como ingreso real)
      notes?: string
    } & CurrencyFields)
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
    .filter((m: { movement_type: string }) => m.movement_type !== 'interes')
    .reduce((sum: number, m: { amount: string | number }) => sum + Number(m.amount), 0)
}

export async function createTransaction(input: CreateTransactionInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  if (input.type === 'gasto') {
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
      expense_group: input.expense_group,
      category_code: input.category_code ?? null,
      movement_type: 'expense',
      is_passive_income: false,
      is_settlement: input.is_settlement ?? false,
      is_survival_expense: input.is_survival_expense ?? false,
      source: 'manual',
      notes: input.notes?.trim() || null,
    })
    if (error) return { error: error.message }
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
      movement_type: 'income',
      is_passive_income: input.is_passive_income,
      is_settlement: input.is_settlement ?? false,
      is_survival_expense: false,
      source: 'manual',
      notes: input.notes?.trim() || null,
    })
    if (error) return { error: error.message }
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
