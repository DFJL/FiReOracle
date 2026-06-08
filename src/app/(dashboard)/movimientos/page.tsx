import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getInboxItems } from '@/app/actions/inbox'
import { InboxClient } from './InboxClient'

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; yahoo?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const admin  = createAdminClient()

  const [items, { data: categories }, { data: connectedAccounts }, { data: envelopes }, { data: loans }] = await Promise.all([
    getInboxItems(),
    admin
      .from('transaction_categories')
      .select('code, name, category_type, group_gasto, is_passive_income')
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('connected_email_accounts')
      .select('id, email, provider, connected_at, last_synced_at')
      .eq('user_id', user.id)
      .order('connected_at'),
    admin
      .from('savings_envelopes')
      .select('id, name, color')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('loans')
      .select('id, name, lender, currency_code, current_balance')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name'),
  ])

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <InboxClient
        items={items}
        categories={categories ?? []}
        connectedAccounts={connectedAccounts ?? []}
        envelopes={envelopes ?? []}
        loans={loans ?? []}
        gmailStatus={params.gmail ?? params.yahoo ?? null}
      />
    </div>
  )
}
