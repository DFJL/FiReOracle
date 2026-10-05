'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type MovType = 'deposito' | 'retiro' | 'interes' | 'traslado_in' | 'traslado_out'

export type EnvelopeMovement = {
  id: string
  date: string
  amount: number
  movement_type: MovType
  notes: string | null
  created_at: string | null
}

export async function addMovement(
  envelopeId: string,
  data: { date: string; amount: number; type: MovType; notes?: string },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const isDebit = ['retiro', 'traslado_out'].includes(data.type)
  const signed  = isDebit ? -Math.abs(data.amount) : Math.abs(data.amount)

  if (isDebit) {
    const { data: rows, error: sumErr } = await supabase
      .from('envelope_movements')
      .select('amount')
      .eq('user_id', user.id)
      .eq('envelope_id', envelopeId)

    if (sumErr) return { error: sumErr.message }
    const current = (rows ?? []).reduce((s, r) => s + Number(r.amount), 0)
    if (current + signed < 0) {
      return { error: `Saldo insuficiente — el sobre tiene ₡${Math.round(current).toLocaleString('es-CR')} y el retiro es ₡${Math.round(data.amount).toLocaleString('es-CR')}` }
    }
  }

  const { error } = await supabase.from('envelope_movements').insert({
    user_id: user.id,
    envelope_id: envelopeId,
    date: data.date,
    amount: signed,
    movement_type: data.type,
    notes: data.notes || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  return { ok: true }
}

export async function transferBetweenEnvelopes(
  fromId: string,
  toId: string,
  data: { date: string; amount: number; notes?: string },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: rows, error: sumErr } = await supabase
    .from('envelope_movements')
    .select('amount')
    .eq('user_id', user.id)
    .eq('envelope_id', fromId)

  if (sumErr) return { error: sumErr.message }
  const current = (rows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  if (current - data.amount < 0) {
    return { error: `Saldo insuficiente — el sobre origen tiene ₡${Math.round(current).toLocaleString('es-CR')}` }
  }

  const { error: outErr } = await supabase.from('envelope_movements').insert({
    user_id: user.id,
    envelope_id: fromId,
    date: data.date,
    amount: -Math.abs(data.amount),
    movement_type: 'traslado_out',
    notes: data.notes || null,
  })
  if (outErr) return { error: outErr.message }

  const { error: inErr } = await supabase.from('envelope_movements').insert({
    user_id: user.id,
    envelope_id: toId,
    date: data.date,
    amount: Math.abs(data.amount),
    movement_type: 'traslado_in',
    notes: data.notes || null,
  })
  if (inErr) return { error: inErr.message }

  revalidatePath('/liquidez')
  return { ok: true }
}

export async function distributeInterest(
  allocations: { envelopeId: string; amount: number }[],
  date: string,
  custodio: string,
  sourceEnvelopeId?: string,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const credits = allocations
    .filter(a => a.amount > 0.01)
    .map(a => ({ envelopeId: a.envelopeId, amount: Math.round(a.amount * 100) / 100 }))

  if (!credits.length) return { ok: true }

  const debitTotal = credits.reduce((s, c) => s + c.amount, 0)

  // Real source sobre (e.g. "Intereses...") holding money the bank already
  // paid in: this is now a conservation-respecting transfer, same movement
  // types transferBetweenEnvelopes uses, so the app's liquid total doesn't
  // phantom-drop or phantom-rise — it's just moving, not creating, money.
  // Without a source (no such sobre for this custodio), fall back to the
  // original behavior: credit as 'interes', nothing debited anywhere.
  if (sourceEnvelopeId) {
    const { data: rows, error: sumErr } = await supabase
      .from('envelope_movements')
      .select('amount')
      .eq('user_id', user.id)
      .eq('envelope_id', sourceEnvelopeId)
    if (sumErr) return { error: sumErr.message }
    const current = (rows ?? []).reduce((s, r) => s + Number(r.amount), 0)
    // Tolerance matches the client's rounded display/prefill (sourceAvailable):
    // the modal shows and lets the user accept a whole-colón figure, which can
    // be up to ₡1 above the true decimal balance.
    if (current - debitTotal < -1) {
      return { error: `Saldo insuficiente en el sobre de intereses — tiene ₡${Math.round(current).toLocaleString('es-CR')}` }
    }

    const { error: outErr } = await supabase.from('envelope_movements').insert({
      user_id: user.id,
      envelope_id: sourceEnvelopeId,
      date,
      amount: -debitTotal,
      movement_type: 'traslado_out',
      notes: `Distribución de interés ${custodio} hacia otros sobres`,
    })
    if (outErr) return { error: outErr.message }
  }

  const rows = credits.map(c => ({
    user_id: user.id,
    envelope_id: c.envelopeId,
    date,
    amount: c.amount,
    movement_type: (sourceEnvelopeId ? 'traslado_in' : 'interes') as MovType,
    notes: sourceEnvelopeId
      ? `Interés ${custodio} acreditado proporcionalmente (desde sobre de intereses)`
      : `Interés ${custodio} acreditado proporcionalmente`,
  }))

  const { error } = await supabase.from('envelope_movements').insert(rows)
  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  return { ok: true }
}

export async function getEnvelopeMovements(envelopeId: string): Promise<{ data: EnvelopeMovement[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'No autorizado' }

  const { data, error } = await supabase
    .from('envelope_movements')
    .select('id, date, amount, movement_type, notes, created_at')
    .eq('user_id', user.id)
    .eq('envelope_id', envelopeId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return {
    data: (data ?? []).map(m => ({
      ...m,
      amount: Number(m.amount),
      movement_type: m.movement_type as MovType,
    })),
    error: null,
  }
}

export async function deleteEnvelopeMovement(movementId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { error } = await supabase
    .from('envelope_movements')
    .delete()
    .eq('id', movementId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  return { error: null }
}

export async function updateEnvelopeMovement(
  movementId: string,
  data: { date: string; amount: number; movement_type: MovType; notes: string | null },
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const isDebit = ['retiro', 'traslado_out'].includes(data.movement_type)
  const signed  = isDebit ? -Math.abs(data.amount) : Math.abs(data.amount)

  const { error } = await supabase
    .from('envelope_movements')
    .update({ date: data.date, amount: signed, movement_type: data.movement_type, notes: data.notes })
    .eq('id', movementId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  return { error: null }
}
