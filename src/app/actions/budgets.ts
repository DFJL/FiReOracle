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

export async function bulkToggleQuincena(q: 1 | 2, done: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const admin = createAdminClient()

  const { data: all } = await admin.from('budgets')
    .select('id, q1_done, q2_done, envelope_id, q1_amount, q2_amount, budget_type, category, auto_tx_category_code, auto_tx_account_id')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const changing = (all ?? []).filter(b => (q === 1 ? b.q1_done : b.q2_done) !== done)
  if (!changing.length) { revalidatePath('/presupuesto'); return }

  const patch = q === 1 ? { q1_done: done } : { q2_done: done }
  await admin.from('budgets')
    .update(patch)
    .in('id', changing.map(b => b.id))
    .eq('user_id', user.id)

  const today     = new Date()
  const todayStr  = today.toISOString().slice(0, 10)

  // ── Envelope movements (batch) ────────────────────────────────────────────────
  const envItems = changing.filter(b => b.envelope_id)
  if (done) {
    const rows = envItems.map(b => ({
      user_id:       user.id,
      envelope_id:   b.envelope_id!,
      date:          todayStr,
      amount:        Number(q === 1 ? b.q1_amount : b.q2_amount) || 0,
      movement_type: b.budget_type === 'expense' ? 'retiro' : 'deposito',
      notes:         `presupuesto_q${q}:${b.id}`,
    }))
    if (rows.length) await admin.from('envelope_movements').insert(rows)
  } else {
    const refs = envItems.map(b => `presupuesto_q${q}:${b.id}`)
    if (refs.length) await admin.from('envelope_movements').delete().eq('user_id', user.id).in('notes', refs)
  }

  // ── Auto-tx transactions (batch) ──────────────────────────────────────────────
  const txItems = changing.filter(b => b.auto_tx_category_code)
  if (txItems.length) {
    if (done) {
      const codes = [...new Set(txItems.map(b => b.auto_tx_category_code!))]
      const { data: cats } = await admin.from('transaction_categories')
        .select('code, group_gasto, is_passive_income, is_survival_expense')
        .in('code', codes)
      const catMap = new Map((cats ?? []).map(c => [c.code, c]))

      const rows = txItems.map(b => {
        const cat     = catMap.get(b.auto_tx_category_code!)
        const movType = b.budget_type === 'income'  ? 'income'
                      : b.budget_type === 'savings' ? 'transfer'
                      : 'expense'
        return {
          user_id:             user.id,
          external_id:         `budget_tx_q${q}:${b.id}`,
          date:                todayStr,
          year:                today.getFullYear(),
          month:               today.getMonth() + 1,
          day:                 today.getDate(),
          weekday:             today.getDay(),
          concept:             b.category,
          vendor:              b.category,
          category_code:       b.auto_tx_category_code!,
          movement_type:       movType,
          amount:              Number(q === 1 ? b.q1_amount : b.q2_amount) || 0,
          currency_code:       'CRC' as const,
          account_id:          b.auto_tx_account_id ?? null,
          expense_group:       cat?.group_gasto ?? null,
          is_passive_income:   cat?.is_passive_income  ?? false,
          is_survival_expense: cat?.is_survival_expense ?? false,
          is_settlement:       false,
          source:              'budget',
          notes:               `budget_tx_q${q}:${b.id}`,
        }
      })
      if (rows.length) await admin.from('transactions').insert(rows)
    } else {
      const refs = txItems.map(b => `budget_tx_q${q}:${b.id}`)
      await admin.from('transactions').delete().eq('user_id', user.id).in('external_id', refs).eq('source', 'budget')
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
