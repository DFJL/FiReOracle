'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type GoalType = 'retiro' | 'compra' | 'educacion' | 'emergencia' | 'viaje' | 'otro'

export type GoalInput = {
  name: string
  goal_type: GoalType
  target_amount_crc: number
  target_date?: string | null
  manual_current_amount_crc?: number | null
  linked_envelope_id?: string | null
  linked_bucket_id?: string | null
}

export async function createGoal(input: GoalInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  // Get next sort_order
  const { data: existing } = await admin
    .from('goals')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (existing?.sort_order ?? 0) + 1

  const { error } = await admin.from('goals').insert({
    user_id: user.id,
    name: input.name.trim(),
    goal_type: input.goal_type,
    target_amount_crc: input.target_amount_crc,
    target_date: input.target_date ?? null,
    manual_current_amount_crc: input.manual_current_amount_crc ?? null,
    linked_envelope_id: input.linked_envelope_id ?? null,
    linked_bucket_id: input.linked_bucket_id ?? null,
    is_active: true,
    sort_order,
  })

  if (error) return { error: error.message }
  revalidatePath('/metas')
  return { error: null }
}

export async function updateGoal(id: string, input: GoalInput & { is_active?: boolean }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('goals')
    .update({
      name: input.name.trim(),
      goal_type: input.goal_type,
      target_amount_crc: input.target_amount_crc,
      target_date: input.target_date ?? null,
      manual_current_amount_crc: input.manual_current_amount_crc ?? null,
      linked_envelope_id: input.linked_envelope_id ?? null,
      linked_bucket_id: input.linked_bucket_id ?? null,
      is_active: input.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/metas')
  return { error: null }
}

export async function deleteGoal(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/metas')
  return { error: null }
}
