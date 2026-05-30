import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { EnvelopeSection } from './EnvelopeSection'

export type Envelope = {
  id: string
  name: string
  custodio: string
  color: string | null
  sort_order: number | null
  interest_mode: string | null
  annual_rate: number | null
  balance: number
}

export default async function LiquidezPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: envelopes } = await admin
    .from('savings_envelopes')
    .select('id, name, custodio, color, sort_order, interest_mode, annual_rate')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('sort_order')

  const { data: movements } = await admin
    .from('envelope_movements')
    .select('envelope_id, amount')
    .eq('user_id', user.id)

  const balanceMap: Record<string, number> = {}
  for (const m of movements ?? []) {
    balanceMap[m.envelope_id] = (balanceMap[m.envelope_id] ?? 0) + Number(m.amount)
  }

  const enriched: Envelope[] = (envelopes ?? []).map(e => ({
    ...e,
    balance: balanceMap[e.id] ?? 0,
  }))

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <EnvelopeSection envelopes={enriched} />
    </div>
  )
}
