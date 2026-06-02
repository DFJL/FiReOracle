'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function revalidate() {
  revalidatePath('/auditoria')
  revalidatePath('/resumen')
  revalidatePath('/flujo')
}

export async function addAdjustmentTransaction({
  amount, movementType, date, notes,
}: {
  amount: number
  movementType: 'income' | 'expense'
  date: string
  notes?: string
}) {
  if (amount <= 0) return { error: 'Monto inválido' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    amount: Math.round(amount),
    movement_type: movementType,
    date,
    concept: `Ajuste de cuadre — ${movementType === 'income' ? 'ingreso' : 'egreso'} no identificado`,
    vendor: null,
    expense_group: movementType === 'expense' ? 'na' : null,
    notes: notes || null,
    is_settlement: false,
  })

  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}

export async function deleteTransactions(ids: string[]) {
  if (!ids.length) return { ok: true }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { error } = await supabase.from('transactions').delete().in('id', ids).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}

export async function fixPassiveIncomeFlag(ids: string[]) {
  if (!ids.length) return { ok: true }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { error } = await supabase
    .from('transactions').update({ is_passive_income: true }).in('id', ids).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}

export async function fixMovementType(ids: string[], movementType: string) {
  if (!ids.length) return { ok: true }
  if (!['income', 'expense', 'cash_withdrawal'].includes(movementType)) return { error: 'Tipo inválido' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { error } = await supabase
    .from('transactions').update({ movement_type: movementType }).in('id', ids).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}

export async function fixAllNullMovementType(movementType: string) {
  if (!['income', 'expense', 'cash_withdrawal'].includes(movementType)) return { error: 'Tipo inválido' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { error } = await supabase
    .from('transactions').update({ movement_type: movementType })
    .eq('user_id', user.id).is('movement_type', null)
  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}

export async function fixExpenseGroup(ids: string[], expenseGroup: string) {
  if (!ids.length) return { ok: true }
  const valid = ['personal', 'necesario', 'objetivos_financieros', 'na']
  if (!valid.includes(expenseGroup)) return { error: 'Grupo inválido' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { error } = await supabase
    .from('transactions').update({ expense_group: expenseGroup }).in('id', ids).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}
