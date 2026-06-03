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
    envelope_id: envelopeId || null,
    auto_tx_category_code: autoTxCategoryCode || null,
    auto_tx_account_id: autoTxAccountId || null,
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

  const { data: budget } = await admin
    .from('budgets')
    .select('envelope_id, q1_amount, q2_amount, budget_type, category, auto_tx_category_code, auto_tx_account_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const envelopeRef = `presupuesto_q${q}:${id}`
  const txRef       = `budget_tx_q${q}:${id}`

  // ── Envelope movement ───────────────────────────────────────────────────────
  if (budget?.envelope_id) {
    if (done) {
      const amount       = Number(q === 1 ? budget.q1_amount : budget.q2_amount) || 0
      const movementType = budget.budget_type === 'expense' ? 'retiro' : 'deposito'
      await admin.from('envelope_movements').insert({
        user_id:       user.id,
        envelope_id:   budget.envelope_id,
        date:          new Date().toISOString().slice(0, 10),
        amount,
        movement_type: movementType,
        notes:         envelopeRef,
      })
    } else {
      await admin.from('envelope_movements')
        .delete()
        .eq('user_id', user.id)
        .eq('notes', envelopeRef)
    }
  }

  // ── Auto-create transaction in ledger ────────────────────────────────────────
  if (budget?.auto_tx_category_code) {
    if (done) {
      const { data: cat } = await admin
        .from('transaction_categories')
        .select('group_gasto, is_passive_income, is_survival_expense')
        .eq('code', budget.auto_tx_category_code)
        .maybeSingle()

      const today      = new Date()
      const movType    = budget.budget_type === 'income'  ? 'income'
                       : budget.budget_type === 'savings' ? 'transfer'
                       : 'expense'
      const amount     = Number(q === 1 ? budget.q1_amount : budget.q2_amount) || 0

      await admin.from('transactions').insert({
        user_id:            user.id,
        external_id:        txRef,
        date:               today.toISOString().slice(0, 10),
        year:               today.getFullYear(),
        month:              today.getMonth() + 1,
        day:                today.getDate(),
        weekday:            today.getDay(),
        concept:            budget.category,
        vendor:             budget.category,
        category_code:      budget.auto_tx_category_code,
        movement_type:      movType,
        amount,
        currency_code:      'CRC',
        account_id:         budget.auto_tx_account_id ?? null,
        expense_group:      cat?.group_gasto ?? null,
        is_passive_income:  cat?.is_passive_income  ?? false,
        is_survival_expense: cat?.is_survival_expense ?? false,
        is_settlement:      false,
        source:             'budget',
        notes:              txRef,
      })
    } else {
      await admin.from('transactions')
        .delete()
        .eq('user_id', user.id)
        .eq('external_id', txRef)
        .eq('source', 'budget')
    }
  }

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
