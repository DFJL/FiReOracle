import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TransactionEntryFAB } from './TransactionEntryFAB'

export async function TransactionEntryWrapper() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: envelopes } = await admin
    .from('savings_envelopes')
    .select('id, name, custodio, parent_envelope_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('sort_order')

  return <TransactionEntryFAB envelopes={envelopes ?? []} />
}
