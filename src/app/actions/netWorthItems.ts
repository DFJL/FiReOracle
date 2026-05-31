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

/**
 * Updates one item's value for the current month.
 * If the displayed snapshot is from a prior month, all items for that date are
 * first copied to the current month (ignoring conflicts) so no history is lost,
 * then the target item is upserted with the new value.
 */
export async function updateItemPreservingHistory(
  displayedSnapshotDate: string,
  item: { item_name: string; category: NetWorthItem['category']; sort_order: number },
  value_crc: number,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const currentMonth = new Date().toISOString().slice(0, 7) + '-01'
  const admin = createAdminClient()

  if (displayedSnapshotDate !== currentMonth) {
    const { data: priorItems } = await admin
      .from('net_worth_items')
      .select('category, item_name, value_crc, sort_order')
      .eq('user_id', user.id)
      .eq('snapshot_date', displayedSnapshotDate)

    if (priorItems && priorItems.length > 0) {
      const copies = priorItems.map(r => ({
        user_id: user.id,
        snapshot_date: currentMonth,
        category: r.category,
        item_name: r.item_name,
        value_crc: r.value_crc,
        sort_order: r.sort_order,
      }))
      // ignoreDuplicates: keep any values the user already set this month
      const { error: copyErr } = await admin
        .from('net_worth_items')
        .upsert(copies, { onConflict: 'user_id,snapshot_date,item_name', ignoreDuplicates: true })
      if (copyErr) return { error: copyErr.message }
    }
  }

  const { error } = await admin
    .from('net_worth_items')
    .upsert({
      user_id: user.id,
      snapshot_date: currentMonth,
      category: item.category,
      item_name: item.item_name,
      value_crc,
      sort_order: item.sort_order,
    }, { onConflict: 'user_id,snapshot_date,item_name' })

  if (error) return { error: error.message }
  revalidatePath('/patrimonio')
  return { ok: true, newDate: currentMonth }
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
