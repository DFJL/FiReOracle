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
  q1_actual: number | null   // manual override for Real (from budget_monthly_done)
  q2_actual: number | null
  sort_order: number
  budget_type: string   // 'expense' | 'savings' | 'income'
  effective_from: string
  notes: string | null
  envelope_id: string | null
  auto_tx_category_code: string | null
  auto_tx_account_id: string | null
}

export async function upsertBudget(
  category: string,
  q1Amount: number,
  q2Amount: number,
  budgetType = 'expense',
  envelopeId: string | null = null,
  autoTxCategoryCode: string | null = null,
  autoTxAccountId: string | null = null,
  effectiveFrom = '2000-01-01',
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const admin = createAdminClient()

  // Only deactivate rows that are effective from this month onwards;
  // earlier rows stay active so past months keep their historical values.
  await admin.from('budgets')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('category', category)
    .eq('is_active', true)
    .gte('effective_from', effectiveFrom)

  await admin.from('budgets').insert({
    user_id: user.id,
    category,
    q1_amount: q1Amount,
    q2_amount: q2Amount,
    monthly_limit: q1Amount + q2Amount,
    budget_type: budgetType,
    effective_from: effectiveFrom,
    is_active: true,
    envelope_id: envelopeId || null,
    auto_tx_category_code: autoTxCategoryCode || null,
    auto_tx_account_id: autoTxAccountId || null,
  })

  revalidatePath('/presupuesto')
}

export async function toggleQuincena(id: string, q: 1 | 2, done: boolean, year: number, month: number): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const admin = createAdminClient()

  // Keep the budget-row flag updated so the optimistic rollback lands on correct data
  const patch = q === 1 ? { q1_done: done } : { q2_done: done }
  await admin.from('budgets').update(patch).eq('id', id).eq('user_id', user.id)

  const { data: budget } = await admin
    .from('budgets')
    .select('category, q1_done, q2_done')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (budget) {
    const { data: cur } = await admin.from('budget_monthly_done')
      .select('q1_done, q2_done')
      .eq('user_id', user.id)
      .eq('category', budget.category)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle()
    await admin.from('budget_monthly_done').upsert({
      user_id:  user.id,
      category: budget.category,
      year,
      month,
      q1_done:  q === 1 ? done : (cur?.q1_done  ?? budget.q1_done),
      q2_done:  q === 2 ? done : (cur?.q2_done  ?? budget.q2_done),
    }, { onConflict: 'user_id,category,year,month' })
  }

  revalidatePath('/presupuesto')
}

export async function bulkToggleQuincena(q: 1 | 2, done: boolean, year: number, month: number): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const admin = createAdminClient()

  const [{ data: all }, { data: monthlyDone }] = await Promise.all([
    admin.from('budgets')
      .select('id, category, q1_done, q2_done')
      .eq('user_id', user.id)
      .eq('is_active', true),
    admin.from('budget_monthly_done')
      .select('category, q1_done, q2_done')
      .eq('user_id', user.id)
      .eq('year', year)
      .eq('month', month),
  ])

  const doneMap = new Map((monthlyDone ?? []).map(d => [d.category, d]))
  const changing = (all ?? []).filter(b => {
    const cur = doneMap.get(b.category)
    return (cur ? (q === 1 ? cur.q1_done : cur.q2_done) : false) !== done
  })
  if (!changing.length) { revalidatePath('/presupuesto'); return }

  // Keep budget-row flags updated so optimistic rollback lands on correct data
  const patch = q === 1 ? { q1_done: done } : { q2_done: done }
  await admin.from('budgets').update(patch).in('id', changing.map(b => b.id)).eq('user_id', user.id)

  const doneRows = changing.map(b => {
    const cur = doneMap.get(b.category)
    return {
      user_id:  user.id,
      category: b.category,
      year,
      month,
      q1_done: q === 1 ? done : (cur?.q1_done ?? b.q1_done),
      q2_done: q === 2 ? done : (cur?.q2_done ?? b.q2_done),
    }
  })
  await admin.from('budget_monthly_done').upsert(doneRows, { onConflict: 'user_id,category,year,month' })

  revalidatePath('/presupuesto')
}

export async function updateBudgetActual(
  category: string, q: 1 | 2, actual: number | null,
  year: number, month: number,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const admin = createAdminClient()

  const { data: cur } = await admin.from('budget_monthly_done')
    .select('q1_done, q2_done, q1_actual, q2_actual')
    .eq('user_id', user.id)
    .eq('category', category)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()

  await admin.from('budget_monthly_done').upsert({
    user_id:   user.id,
    category,
    year,
    month,
    q1_done:   cur?.q1_done   ?? false,
    q2_done:   cur?.q2_done   ?? false,
    q1_actual: q === 1 ? actual : (cur?.q1_actual ?? null),
    q2_actual: q === 2 ? actual : (cur?.q2_actual ?? null),
  }, { onConflict: 'user_id,category,year,month' })

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
