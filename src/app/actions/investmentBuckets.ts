'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type ConceptMap = {
  depositConcepts: string[]
  rendimientosConcepts: string[]
  valorizacionConcepts: string[]
  liquidacionConcepts: string[]
}

export type BucketFormData = {
  bucket_type: 'vendor_based' | 'concept_based' | 'snapshot_based'
  name: string
  industry: string
  color: string
  vendors?: string[]
  concept_map?: ConceptMap | null
  account_id?: string | null
}

function revalidate() {
  revalidatePath('/inversiones')
  revalidatePath('/configuracion')
  revalidatePath('/patrimonio')
}

export async function createBucket(data: BucketFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  const { data: maxRow } = await admin
    .from('user_investment_buckets')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (maxRow?.sort_order ?? 0) + 1

  const { error } = await admin
    .from('user_investment_buckets')
    .insert({
      user_id: user.id,
      bucket_type: data.bucket_type,
      name: data.name.trim(),
      industry: data.industry.trim() || null,
      color: data.color,
      vendors: data.bucket_type === 'vendor_based' ? (data.vendors ?? []) : [],
      concept_map: data.bucket_type === 'concept_based' ? (data.concept_map ?? null) : null,
      account_id: data.bucket_type === 'snapshot_based' ? (data.account_id ?? null) : null,
      sort_order,
      is_active: true,
    })

  if (error) return { error: error.message }
  revalidate()
}

export async function updateBucket(id: string, data: Partial<BucketFormData>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_investment_buckets')
    .update({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.industry !== undefined && { industry: data.industry.trim() || null }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.vendors !== undefined && { vendors: data.vendors }),
      ...(data.concept_map !== undefined && { concept_map: data.concept_map }),
      ...(data.account_id !== undefined && { account_id: data.account_id }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidate()
}

export async function deactivateBucket(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_investment_buckets')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidate()
}
