'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type AguinaldoAllocation = {
  id: string
  year: number
  label: string
  amount: number
  real_amount: number | null
  group_name: string | null
  category_code: string | null
  envelope_id: string | null
  sort_order: number
}

export type AguinaldoGrossSalaryEntry = {
  id: string
  pay_date: string
  gross_amount: number
  notes: string | null
}

// ── Allocations (plan: where the aguinaldo goes) ───────────────────────────────

export async function addAguinaldoAllocation(
  year: number,
  label: string,
  amount: number,
  envelopeId: string | null,
  groupName: string | null,
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
    group_name: groupName,
    sort_order: sortOrder,
  })
  if (error) return { error: error.message }
  revalidatePath('/presupuesto')
  return { error: null }
}

export async function updateAguinaldoAllocation(
  id: string,
  data: {
    label?: string
    amount?: number
    real_amount?: number | null
    envelope_id?: string | null
    group_name?: string | null
    category_code?: string | null
  },
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

// ── Gross salary ledger (base for the legal estimate — isolated from
// `transactions`/income metrics everywhere else in the app; read only by
// this feature's calculation) ───────────────────────────────────────────────

export async function addGrossSalaryEntry(
  payDate: string,
  grossAmount: number,
  notes: string | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()
  const { error } = await admin.from('aguinaldo_gross_salary').insert({
    user_id: user.id,
    pay_date: payDate,
    gross_amount: grossAmount,
    notes,
  })
  if (error) return { error: error.message }
  revalidatePath('/presupuesto')
  return { error: null }
}

export async function updateGrossSalaryEntry(
  id: string,
  data: { pay_date?: string; gross_amount?: number; notes?: string | null },
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()
  const { error } = await admin.from('aguinaldo_gross_salary')
    .update(data)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/presupuesto')
  return { error: null }
}

export async function deleteGrossSalaryEntry(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const admin = createAdminClient()
  const { error } = await admin.from('aguinaldo_gross_salary')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/presupuesto')
  return { error: null }
}
