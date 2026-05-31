'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type NetWorthItem = {
  id: string
  snapshot_date: string
  category: 'liquido' | 'invertido' | 'iliquido' | 'pasivo'
  item_name: string
  value_crc: number
  sort_order: number
}

export async function upsertNetWorthItems(
  items: Array<{
    snapshot_date: string
    category: NetWorthItem['category']
    item_name: string
    value_crc: number
    sort_order?: number
  }>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const rows = items.map((item, i) => ({
    user_id:       user.id,
    snapshot_date: item.snapshot_date,
    category:      item.category,
    item_name:     item.item_name,
    value_crc:     item.value_crc,
    sort_order:    item.sort_order ?? i,
  }))

  const { error } = await admin
    .from('net_worth_items')
    .upsert(rows, { onConflict: 'user_id,snapshot_date,item_name' })

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { count: rows.length }
}

export async function updateNetWorthItem(id: string, value_crc: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('net_worth_items')
    .update({ value_crc })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { ok: true }
}

export async function addNetWorthItem(item: {
  snapshot_date: string
  category: NetWorthItem['category']
  item_name: string
  value_crc: number
  sort_order?: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('net_worth_items')
    .upsert({ user_id: user.id, ...item, sort_order: item.sort_order ?? 99 },
      { onConflict: 'user_id,snapshot_date,item_name' })

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { ok: true }
}

export async function saveNetWorthItemForPeriod(
  item: { item_name: string; category: NetWorthItem['category']; sort_order: number },
  periodYYYYMM: string,
  value_crc: number,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('net_worth_items')
    .upsert({
      user_id: user.id,
      snapshot_date: periodYYYYMM + '-01',
      category: item.category,
      item_name: item.item_name,
      value_crc,
      sort_order: item.sort_order,
    }, { onConflict: 'user_id,snapshot_date,item_name' })

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { ok: true }
}

export async function deleteNetWorthItem(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('net_worth_items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { ok: true }
}
