'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { ACTIONABLE_CATEGORIES, type PortfolioModelCategory } from '@/lib/portfolioModel'

function revalidate() {
  revalidatePath('/inversiones')
}

export async function savePortfolioModelTargets(
  targets: { category: PortfolioModelCategory; target_pct: number }[],
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const sum = ACTIONABLE_CATEGORIES.reduce((s, c) => {
    const row = targets.find(t => t.category === c)
    return s + (row?.target_pct ?? 0)
  }, 0)
  if (Math.abs(sum - 100) > 0.5) {
    return { error: `Los porcentajes deben sumar 100% (suman ${sum.toFixed(1)}%)` }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('portfolio_model_targets')
    .upsert(
      targets.map((t, i) => ({
        user_id: user.id,
        category: t.category,
        target_pct: t.target_pct,
        sort_order: i,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,category' },
    )

  if (error) return { error: error.message }
  revalidate()
  return { error: null }
}

export async function updateBucketModelCategory(
  bucketId: string,
  category: PortfolioModelCategory | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_investment_buckets')
    .update({ portfolio_model_category: category, updated_at: new Date().toISOString() })
    .eq('id', bucketId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidate()
  return { error: null }
}

export async function updateAssetModelCategory(
  assetId: string,
  category: PortfolioModelCategory | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('assets')
    .update({ portfolio_model_category: category, updated_at: new Date().toISOString() })
    .eq('id', assetId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidate()
  return { error: null }
}
