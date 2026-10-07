'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type FinancialAccountDetail = {
  id: string
  name: string
  bank_name: string | null
  account_type: string
  custodio: string | null
  last4: string | null
  currency_code: string
  is_active: boolean
}

export async function addFinancialAccount(data: {
  name: string
  bank_name: string | null
  account_type: string
  custodio: string | null
  last4: string | null
  currency_code: string
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('financial_accounts').insert({
    user_id:       user.id,
    name:          data.name,
    bank_name:     data.bank_name,
    account_type:  data.account_type,
    custodio:      data.custodio,
    last4:         data.last4,
    currency_code: data.currency_code,
    is_active:     true,
  })
  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  return { error: null }
}

export async function updateFinancialAccount(
  id: string,
  data: Partial<{
    name: string
    bank_name: string | null
    account_type: string
    custodio: string | null
    last4: string | null
    currency_code: string
    is_active: boolean
  }>,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('financial_accounts')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  return { error: null }
}

export async function deleteFinancialAccount(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('financial_accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/liquidez')
  return { error: null }
}
