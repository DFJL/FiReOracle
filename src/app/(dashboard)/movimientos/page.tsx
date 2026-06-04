import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getInboxItems } from '@/app/actions/inbox'
import { InboxClient } from './InboxClient'

export default async function MovimientosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [items, { data: categories }] = await Promise.all([
    getInboxItems(),
    admin
      .from('transaction_categories')
      .select('code, name, category_type, group_gasto, is_passive_income')
      .eq('is_active', true)
      .order('sort_order'),
  ])

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <InboxClient
        items={items}
        categories={categories ?? []}
      />
    </div>
  )
}
