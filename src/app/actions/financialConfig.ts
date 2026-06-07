'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type FinancialConfigData = {
  fire_withdrawal_rate: number
  fire_target_monthly_exp: number | null
  fire_expected_return: number
  fire_inflation_rate: number
  runway_green_months: number
  runway_yellow_months: number
  savings_rate_green: number
  savings_rate_yellow: number
  fcf_target_ratio: number
  preferred_currency: 'CRC' | 'USD'
  lifestyle_exclude_categories: string[]
}

export async function upsertFinancialConfig(data: FinancialConfigData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_financial_config')
    .upsert({
      user_id: user.id,
      ...data,
      updated_at: new Date().toISOString(),
    })

  if (error) return { error: error.message }
  revalidatePath('/configuracion')
  revalidatePath('/progreso')
  return { error: null }
}

export async function getFinancialConfig() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('user_financial_config')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  return data
}
