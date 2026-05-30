'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type EnvelopeData = {
  name: string
  custodio: string
  color: string
  annual_rate: number | null
  initial_balance?: number | null
}

export async function createEnvelope(data: EnvelopeData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  const { data: maxRow } = await admin
    .from('savings_envelopes')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (maxRow?.sort_order ?? 0) + 1

  const { error } = await admin
    .from('savings_envelopes')
    .insert({
      user_id: user.id,
      name: data.name.trim(),
      custodio: data.custodio.trim(),
      color: data.color,
      annual_rate: data.annual_rate,
      interest_mode: 'manual',
      sort_order,
      is_active: true,
    })

  if (error) return { error: error.message }

  if (data.initial_balance && data.initial_balance > 0) {
    const { data: inserted } = await admin
      .from('savings_envelopes')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', data.name.trim())
      .eq('custodio', data.custodio.trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (inserted?.id) {
      await admin.from('envelope_movements').insert({
        user_id: user.id,
        envelope_id: inserted.id,
        movement_type: 'deposito',
        amount: data.initial_balance,
        date: new Date().toISOString().slice(0, 10),
        notes: 'Saldo inicial',
      })
    }
  }

  revalidatePath('/liquidez')
  revalidatePath('/configuracion')
}

export async function updateEnvelope(id: string, data: Partial<EnvelopeData>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('savings_envelopes')
    .update({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.custodio !== undefined && { custodio: data.custodio.trim() }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.annual_rate !== undefined && { annual_rate: data.annual_rate }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  revalidatePath('/configuracion')
}

export async function deactivateEnvelope(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('savings_envelopes')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  revalidatePath('/configuracion')
}
