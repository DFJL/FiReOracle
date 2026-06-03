'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type Budget = {
  id: string
  category: string
  monthly_limit: number
  q1_amount: number | null
  q2_amount: number | null
  q1_done: boolean
  q2_done: boolean
  sort_order: number
  budget_type: string   // 'expense' | 'savings' | 'income'
  effective_from: string
  notes: string | null
}

export async function upsertBudget(
  category: string,
  q1Amount: number,
  q2Amount: number,
  budgetType = 'expense',
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const admin = createAdminClient()

  await admin.from('budgets')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('category', category)
    .eq('is_active', true)

  await admin.from('budgets').insert({
    user_id: user.id,
    category,
    q1_amount: q1Amount,
    q2_amount: q2Amount,
    monthly_limit: q1Amount + q2Amount,
    budget_type: budgetType,
    effective_from: new Date().toISOString().slice(0, 10),
    is_active: true,
  })

  revalidatePath('/presupuesto')
}

export async function toggleQuincena(id: string, q: 1 | 2, done: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const admin = createAdminClient()
  const patch = q === 1 ? { q1_done: done } : { q2_done: done }
  await admin.from('budgets')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)

  revalidatePath('/presupuesto')
}

export async function deleteBudget(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const admin = createAdminClient()
  await admin.from('budgets')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', user.id)

  revalidatePath('/presupuesto')
}
