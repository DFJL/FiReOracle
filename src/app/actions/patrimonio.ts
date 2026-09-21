'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type AssetType = 'real_estate' | 'vehicle' | 'pension' | 'business' | 'crypto' | 'other'
export type LiabilityType = 'mortgage' | 'auto_loan' | 'personal_loan' | 'credit_card' | 'student_loan' | 'other'

export async function createAsset(input: {
  name: string
  asset_type: AssetType
  value_crc: number
  as_of_date: string
  is_investable: boolean
  notes?: string
  loan_id?: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('assets').insert({
    user_id: user.id,
    name: input.name.trim(),
    asset_type: input.asset_type,
    value_crc: input.value_crc,
    as_of_date: input.as_of_date,
    is_investable: input.is_investable,
    is_active: true,
    notes: input.notes?.trim() || null,
    sort_order: 0,
    loan_id: input.loan_id || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  revalidatePath('/progreso')
  return { error: null }
}

// Links (or unlinks, with loanId = null) an asset to a loan, e.g. a house to
// its mortgage — by id, not by matching names. Drives net-equity math in
// /progreso's real estate liquidity tier (value minus the linked loan's
// current balance) instead of counting the property's gross value.
export async function updateAssetLoan(assetId: string, loanId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('assets')
    .update({ loan_id: loanId, updated_at: new Date().toISOString() })
    .eq('id', assetId).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  revalidatePath('/progreso')
  return { error: null }
}

export async function updateAssetValue(input: {
  asset_id: string
  value_crc: number
  snapshot_date: string
  notes?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  const { error: histErr } = await admin.from('asset_value_history').insert({
    user_id: user.id,
    asset_id: input.asset_id,
    value_crc: input.value_crc,
    snapshot_date: input.snapshot_date,
    notes: input.notes?.trim() || null,
  })
  if (histErr) return { error: histErr.message }

  const { error: upErr } = await admin.from('assets').update({
    value_crc: input.value_crc,
    as_of_date: input.snapshot_date,
    updated_at: new Date().toISOString(),
  }).eq('id', input.asset_id).eq('user_id', user.id)

  if (upErr) return { error: upErr.message }
  revalidatePath('/patrimonio')
  return { error: null }
}

export async function deactivateAsset(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('assets')
    .update({ is_active: false })
    .eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { error: null }
}

export async function createLiability(input: {
  name: string
  liability_type: LiabilityType
  current_balance: number
  original_balance?: number
  interest_rate?: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('liabilities').insert({
    user_id: user.id,
    name: input.name.trim(),
    liability_type: input.liability_type,
    current_balance: input.current_balance,
    original_balance: input.original_balance ?? null,
    interest_rate: input.interest_rate ?? null,
    is_active: true,
    as_of_date: new Date().toISOString().slice(0, 10),
  })

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { error: null }
}

export async function updateLiabilityBalance(id: string, current_balance: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('liabilities').update({
    current_balance,
    as_of_date: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { error: null }
}

export async function deactivateLiability(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('liabilities')
    .update({ is_active: false })
    .eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { error: null }
}
