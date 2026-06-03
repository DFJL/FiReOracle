'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type MovType = 'deposito' | 'retiro' | 'interes' | 'traslado_in' | 'traslado_out'

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
      .neq('movement_type', 'interes')

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
    .neq('movement_type', 'interes')

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
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const rows = allocations
    .filter(a => a.amount > 0.01)
    .map(a => ({
      user_id: user.id,
      envelope_id: a.envelopeId,
      date,
      amount: Math.round(a.amount * 100) / 100,
      movement_type: 'interes' as const,
      notes: `Interés ${custodio} acreditado proporcionalmente`,
    }))

  if (!rows.length) return { ok: true }

  const { error } = await supabase.from('envelope_movements').insert(rows)
  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  return { ok: true }
}
