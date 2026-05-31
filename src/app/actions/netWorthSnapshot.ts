'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type SnapshotRow = {
  id: string
  snapshot_date: string
  liquid_crc: number
  invested_crc: number
  iliquid_crc: number
  liabilities_crc: number
  net_worth_crc: number
  notes: string | null
  source: string
}

export async function saveSnapshot(input: {
  snapshot_date: string
  liquid_crc: number
  invested_crc: number
  iliquid_crc: number
  liabilities_crc: number
  notes?: string
  source?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('net_worth_snapshots').upsert(
    {
      user_id: user.id,
      snapshot_date: input.snapshot_date,
      liquid_crc: input.liquid_crc,
      invested_crc: input.invested_crc,
      iliquid_crc: input.iliquid_crc,
      liabilities_crc: input.liabilities_crc,
      notes: input.notes?.trim() || null,
      source: input.source ?? 'manual',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,snapshot_date' }
  )

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { error: null }
}

export async function bulkImportSnapshots(rows: Array<{
  snapshot_date: string
  liquid_crc: number
  invested_crc: number
  iliquid_crc: number
  liabilities_crc: number
}>) {
  if (rows.length === 0) return { error: 'Sin filas para importar', count: 0 }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado', count: 0 }

  const admin = createAdminClient()
  const payload = rows.map(r => ({
    user_id: user.id,
    snapshot_date: r.snapshot_date,
    liquid_crc: r.liquid_crc,
    invested_crc: r.invested_crc,
    iliquid_crc: r.iliquid_crc,
    liabilities_crc: r.liabilities_crc,
    source: 'import',
    updated_at: new Date().toISOString(),
  }))

  const { error } = await admin.from('net_worth_snapshots').upsert(
    payload,
    { onConflict: 'user_id,snapshot_date' }
  )

  if (error) return { error: error.message, count: 0 }
  revalidatePath('/patrimonio')
  return { error: null, count: rows.length }
}

export async function deleteSnapshot(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('net_worth_snapshots')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { error: null }
}
