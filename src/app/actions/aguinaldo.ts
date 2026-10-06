'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type AguinaldoAllocation = {
  id: string
  year: number
  label: string
  amount: number
  envelope_id: string | null
  is_done: boolean
  sort_order: number
}

export async function addAguinaldoAllocation(
  year: number,
  label: string,
  amount: number,
  envelopeId: string | null,
  sortOrder: number,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()
  const { error } = await admin.from('aguinaldo_allocations').insert({
    user_id: user.id,
    year,
    label,
    amount,
    envelope_id: envelopeId,
    sort_order: sortOrder,
  })
  if (error) return { error: error.message }
  revalidatePath('/presupuesto')
  return { error: null }
}

export async function updateAguinaldoAllocation(
  id: string,
  data: { label?: string; amount?: number; envelope_id?: string | null; is_done?: boolean },
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()
  const { error } = await admin.from('aguinaldo_allocations')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/presupuesto')
  return { error: null }
}

export async function deleteAguinaldoAllocation(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()
  const { error } = await admin.from('aguinaldo_allocations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/presupuesto')
  return { error: null }
}
