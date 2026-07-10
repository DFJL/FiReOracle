'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type PortfolioTarget = {
  id: string
  bucketKey: string
  label: string
  targetPctPortfolio: number | null
  targetPctIncome: number | null
}

export async function getPortfolioTargets(): Promise<PortfolioTarget[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await createAdminClient()
    .from('portfolio_targets')
    .select('id, bucket_key, label, target_pct_portfolio, target_pct_income')
    .eq('user_id', user.id)

  return (data ?? []).map(r => ({
    id:                 r.id as string,
    bucketKey:          r.bucket_key as string,
    label:              r.label as string,
    targetPctPortfolio: r.target_pct_portfolio != null ? Number(r.target_pct_portfolio) : null,
    targetPctIncome:    r.target_pct_income    != null ? Number(r.target_pct_income)    : null,
  }))
}

export async function upsertPortfolioTarget(
  bucketKey: string,
  label: string,
  targetPctPortfolio: number | null,
  targetPctIncome: number | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await createAdminClient()
    .from('portfolio_targets')
    .upsert({
      user_id:              user.id,
      bucket_key:           bucketKey,
      label,
      target_pct_portfolio: targetPctPortfolio,
      target_pct_income:    targetPctIncome,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'user_id,bucket_key' })

  if (error) return { error: error.message }
  revalidatePath('/inversiones')
  return { error: null }
}

export async function deletePortfolioTarget(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await createAdminClient()
    .from('portfolio_targets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/inversiones')
  return { error: null }
}
