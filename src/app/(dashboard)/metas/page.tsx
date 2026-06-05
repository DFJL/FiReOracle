import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { MetasView } from './MetasView'

export default async function MetasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [
    { data: goals },
    { data: envelopes },
    { data: buckets },
  ] = await Promise.all([
    admin
      .from('goals')
      .select('id, name, goal_type, target_amount_crc, target_date, manual_current_amount_crc, linked_envelope_id, linked_bucket_id, is_active, sort_order')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('savings_envelopes')
      .select('id, name, color')
      .eq('user_id', user.id)
      .eq('is_active', true),
    admin
      .from('savings_buckets')
      .select('id, name, current_amount, currency_code')
      .eq('user_id', user.id)
      .eq('is_active', true),
  ])

  // Fetch envelope movements for all linked envelopes in one query
  const linkedEnvelopeIds = (goals ?? [])
    .map(g => g.linked_envelope_id)
    .filter((id): id is string => !!id)

  let envelopeBalances: Record<string, number> = {}
  if (linkedEnvelopeIds.length > 0) {
    const { data: movements } = await admin
      .from('envelope_movements')
      .select('envelope_id, amount')
      .in('envelope_id', linkedEnvelopeIds)

    for (const m of movements ?? []) {
      envelopeBalances[m.envelope_id] = (envelopeBalances[m.envelope_id] ?? 0) + Number(m.amount)
    }
  }

  // Fetch envelope movements grouped by month for projection rhythm (last 3 months)
  // We need per-envelope monthly sums for the last 3 months
  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    .toISOString()
    .slice(0, 10)

  let envelopeMonthlyRhythm: Record<string, number> = {}
  if (linkedEnvelopeIds.length > 0) {
    const { data: recentMovements } = await admin
      .from('envelope_movements')
      .select('envelope_id, amount, created_at')
      .in('envelope_id', linkedEnvelopeIds)
      .gte('created_at', threeMonthsAgo)

    // Sum positive deposits per envelope over last 3 months, divide by 3
    const envelopeDepositSums: Record<string, number> = {}
    for (const m of recentMovements ?? []) {
      const amt = Number(m.amount)
      if (amt > 0) {
        envelopeDepositSums[m.envelope_id] = (envelopeDepositSums[m.envelope_id] ?? 0) + amt
      }
    }
    for (const [envId, total] of Object.entries(envelopeDepositSums)) {
      envelopeMonthlyRhythm[envId] = total / 3
    }
  }

  // Build bucket map for quick lookup
  const bucketMap: Record<string, number> = {}
  for (const b of buckets ?? []) {
    bucketMap[b.id] = Number(b.current_amount ?? 0)
  }

  // Compute current_amount and monthly rhythm for each goal
  const enrichedGoals = (goals ?? []).map(g => {
    let currentAmount = 0
    let monthlyRhythm = 0

    if (g.linked_envelope_id) {
      currentAmount = envelopeBalances[g.linked_envelope_id] ?? 0
      monthlyRhythm = envelopeMonthlyRhythm[g.linked_envelope_id] ?? 0
    } else if (g.linked_bucket_id) {
      currentAmount = bucketMap[g.linked_bucket_id] ?? 0
      // For buckets we don't compute rhythm (no movement history available here)
      monthlyRhythm = 0
    } else {
      currentAmount = Number(g.manual_current_amount_crc ?? 0)
      monthlyRhythm = 0
    }

    return {
      id: g.id,
      name: g.name,
      goal_type: g.goal_type as string,
      target_amount_crc: Number(g.target_amount_crc ?? 0),
      target_date: g.target_date as string | null,
      manual_current_amount_crc: g.manual_current_amount_crc != null ? Number(g.manual_current_amount_crc) : null,
      linked_envelope_id: g.linked_envelope_id as string | null,
      linked_bucket_id: g.linked_bucket_id as string | null,
      is_active: g.is_active,
      sort_order: g.sort_order,
      current_amount: currentAmount,
      monthly_rhythm: monthlyRhythm,
    }
  })

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <MetasView
        goals={enrichedGoals}
        envelopes={(envelopes ?? []).map(e => ({
          id: e.id,
          name: e.name,
          color: e.color as string | null,
        }))}
        buckets={(buckets ?? []).map(b => ({
          id: b.id,
          name: b.name,
          current_amount: Number(b.current_amount ?? 0),
          currency_code: b.currency_code,
        }))}
      />
    </div>
  )
}
