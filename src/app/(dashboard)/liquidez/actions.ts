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

  const signed = ['retiro', 'traslado_out'].includes(data.type)
    ? -Math.abs(data.amount)
    : Math.abs(data.amount)

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
