'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuditLogEntry = {
  id: string
  transaction_id: string
  operation: 'UPDATE' | 'DELETE'
  changed_fields: string[] | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_at: string
  // denormalised from transaction
  vendor: string | null
  concept: string | null
  date: string | null
}

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

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function getAuditLog(limit = 100): Promise<{ error: string } | { entries: AuditLogEntry[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data, error } = await db
    .from('transaction_audit_log')
    .select('id, transaction_id, operation, changed_fields, old_data, new_data, changed_at')
    .eq('user_id', user.id)
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (error) return { error: error.message }
  if (!data?.length) return { entries: [] }

  const rows = data as Array<{
    id: string; transaction_id: string; operation: string
    changed_fields: string[] | null; old_data: unknown; new_data: unknown; changed_at: string
  }>

  const txIds = [...new Set(rows.map(r => r.transaction_id))]
  const admin = createAdminClient()
  const { data: txRows } = await admin
    .from('transactions')
    .select('id, vendor, concept, date')
    .in('id', txIds)
  const txMap = new Map((txRows ?? []).map(t => [t.id, t]))

  const entries: AuditLogEntry[] = rows.map(r => {
    const tx = txMap.get(r.transaction_id)
    const oldObj = r.old_data as Record<string, unknown> | null
    return {
      id: r.id,
      transaction_id: r.transaction_id,
      operation: r.operation as 'UPDATE' | 'DELETE',
      changed_fields: r.changed_fields ?? null,
      old_data: oldObj,
      new_data: r.new_data as Record<string, unknown> | null,
      changed_at: r.changed_at,
      vendor:  tx?.vendor  ?? (oldObj?.['vendor']  as string | null) ?? null,
      concept: tx?.concept ?? (oldObj?.['concept'] as string | null) ?? null,
      date:    tx?.date    ?? (oldObj?.['date']    as string | null) ?? null,
    }
  })

  return { entries }
}

export async function revertAuditChange(logId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: entryRaw } = await db
    .from('transaction_audit_log')
    .select('transaction_id, operation, old_data, changed_fields')
    .eq('id', logId)
    .eq('user_id', user.id)
    .single()

  const entry = entryRaw as {
    transaction_id: string; operation: string
    old_data: Record<string, unknown> | null; changed_fields: string[] | null
  } | null

  if (!entry) return { error: 'Entrada no encontrada' }
  if (entry.operation === 'DELETE') return { error: 'No se puede deshacer un DELETE — la tx fue eliminada' }
  if (!entry.old_data || !entry.changed_fields?.length) return { error: 'Sin datos para revertir' }

  const patch: Record<string, unknown> = {}
  for (const f of entry.changed_fields) {
    patch[f] = entry.old_data[f] ?? null
  }

  // Use typed client for the actual transaction update
  const { error } = await supabase
    .from('transactions')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', entry.transaction_id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}

export async function clearMovementType(ids: string[]) {
  if (!ids.length) return { ok: true }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { error } = await supabase
    .from('transactions').update({ movement_type: null }).in('id', ids).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}

export async function clearAllUncategorizedIncome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { error } = await supabase
    .from('transactions')
    .update({ movement_type: null })
    .eq('user_id', user.id)
    .eq('movement_type', 'income')
    .is('category_code', null)
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
