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
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const admin = createAdminClient()

  // Validate: income + savings on the same envelope both create deposito → double credit
  if (envelopeId && (budgetType === 'income' || budgetType === 'savings')) {
    const { data: conflict } = await admin
      .from('budgets')
      .select('category, budget_type')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('envelope_id', envelopeId)
      .in('budget_type', ['income', 'savings'])
      .neq('category', category)  // exclude self when editing
      .limit(1)
      .maybeSingle()

    if (conflict) {
      const conflictType = conflict.budget_type === 'income' ? 'ingreso' : 'ahorro'
      return {
        error: `El sobre ya está ligado a la línea "${conflict.category}" (${conflictType}). Ligar también esta línea (${budgetType === 'income' ? 'ingreso' : 'ahorro'}) crearía un doble depósito. Desligá el sobre de una de las dos.`,
      }
    }
  }

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
  return { error: null }
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

// Mark specific budget rows as done for a given quincena/month without
// creating envelope movements (used by transfer plan to sync quincena state).
export async function bulkMarkDone(
  ids: string[], q: 1 | 2, year: number, month: number,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('budgets')
    .select('id, category, q1_done, q2_done')
    .in('id', ids)
    .eq('user_id', user.id)

  if (!rows?.length) return

  const categories = rows.map(r => r.category)
  const { data: existing } = await admin
    .from('budget_monthly_done')
    .select('category, q1_done, q2_done')
    .eq('user_id', user.id)
    .eq('year', year)
    .eq('month', month)
    .in('category', categories)

  const curMap = new Map((existing ?? []).map(e => [e.category, e]))

  const upserts = rows.map(r => {
    const cur = curMap.get(r.category)
    return {
      user_id:  user.id,
      category: r.category,
      year,
      month,
      q1_done: q === 1 ? true : (cur?.q1_done ?? r.q1_done),
      q2_done: q === 2 ? true : (cur?.q2_done ?? r.q2_done),
    }
  })

  await admin.from('budget_monthly_done')
    .upsert(upserts, { onConflict: 'user_id,category,year,month' })

  revalidatePath('/presupuesto')
}

export async function recordBatchEnvelopeMovements(
  movements: Array<{
    envelope_id: string
    amount: number
    movement_type: 'deposito' | 'retiro' | 'traslado_in' | 'traslado_out'
    notes: string
  }>,
  date: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()
  const rows = movements.map(m => ({
    user_id:       user.id,
    envelope_id:   m.envelope_id,
    date,
    amount:        m.amount,
    movement_type: m.movement_type,
    notes:         m.notes,
  }))
  const { error } = await admin.from('envelope_movements').insert(rows)
  if (error) return { error: error.message }
  revalidatePath('/presupuesto')
  return { error: null }
}

export async function recordTransferFromSource(
  fromEnvelopeId: string,
  amount: number,
  label: string,
  date: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()
  const { error } = await admin.from('envelope_movements').insert({
    user_id: user.id,
    envelope_id: fromEnvelopeId,
    date,
    amount: -Math.abs(amount),
    movement_type: 'traslado_out',
    notes: `Transferencia plan → ${label}`,
  })
  if (error) return { error: error.message }
  revalidatePath('/presupuesto')
  return { error: null }
}
