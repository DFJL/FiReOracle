'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

function createCryptoAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'crypto' } }
  )
}

export type CryptoPortfolioLink = {
  id: string
  portfolio_id: string
  portfolio_name: string
  ownership_pct: number
  is_active: boolean
}

export async function getCryptoPortfolioLinks(bucketId: string): Promise<CryptoPortfolioLink[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data: links } = await admin
    .from('crypto_portfolio_links')
    .select('id, portfolio_id, ownership_pct, is_active')
    .eq('bucket_id', bucketId)
    .eq('user_id', user.id)
    .order('ownership_pct', { ascending: false })
  if (!links || links.length === 0) return []

  const crypto = createCryptoAdminClient()
  const { data: portfolios } = await crypto
    .from('portfolios')
    .select('id, name')
    .in('id', links.map(l => l.portfolio_id))
  const nameById = new Map((portfolios ?? []).map(p => [p.id, p.name as string]))

  return links.map(l => ({
    id: l.id,
    portfolio_id: l.portfolio_id,
    portfolio_name: nameById.get(l.portfolio_id) ?? '(desconocido)',
    ownership_pct: Number(l.ownership_pct),
    is_active: l.is_active,
  }))
}

export async function updateCryptoPortfolioLink(linkId: string, ownershipPct: number) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  if (ownershipPct < 0 || ownershipPct > 100) return { error: 'El % debe estar entre 0 y 100' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('crypto_portfolio_links')
    .update({ ownership_pct: ownershipPct, updated_at: new Date().toISOString() })
    .eq('id', linkId)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/inversiones')
  return { error: null }
}
