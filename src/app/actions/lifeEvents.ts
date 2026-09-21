'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createLifeEvent(input: { date: string; label: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const label = input.label.trim()
  if (!label) return { error: 'La nota no puede estar vacía' }

  const admin = createAdminClient()
  const { error } = await admin.from('life_events').insert({
    user_id: user.id,
    date: input.date,
    label,
  })

  if (error) return { error: error.message }
  revalidatePath('/progreso')
  return { error: null }
}

export async function deleteLifeEvent(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('life_events').delete().eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/progreso')
  return { error: null }
}
