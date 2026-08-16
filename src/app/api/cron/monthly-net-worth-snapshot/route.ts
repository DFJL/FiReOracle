import { createAdminClient } from '@/lib/supabase/admin'
import { computeNetWorthTotals } from '@/lib/netWorthTotals'

// Runs the 1st of each month — captures a snapshot dated the last day of
// the month that just ended, computed live from transactions/buckets/loans
// instead of requiring a manual "photo" of the patrimonio page.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()

  const { data: users } = await admin
    .from('user_financial_config')
    .select('user_id')

  if (!users || users.length === 0) {
    return Response.json({ snapshots: 0 })
  }

  const now = new Date()
  const snapshotDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10) // last day of previous month

  const results: { user_id: string; error?: string }[] = []

  for (const { user_id } of users) {
    try {
      const totals = await computeNetWorthTotals(admin, user_id, snapshotDate)
      const { error } = await admin.from('net_worth_snapshots').upsert(
        {
          user_id,
          snapshot_date: snapshotDate,
          liquid_crc: totals.liquid_crc,
          invested_crc: totals.invested_crc,
          iliquid_crc: totals.iliquid_crc,
          liabilities_crc: totals.liabilities_crc,
          source: 'auto',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,snapshot_date' }
      )
      results.push({ user_id, error: error?.message })
      if (error) console.error(`[monthly-net-worth-snapshot] Error para ${user_id}:`, error.message)
    } catch (err) {
      results.push({ user_id, error: String(err) })
      console.error(`[monthly-net-worth-snapshot] Error para ${user_id}:`, err)
    }
  }

  console.log(`[monthly-net-worth-snapshot] Cron completado: ${results.length} usuarios, fecha ${snapshotDate}`)
  return Response.json({ snapshot_date: snapshotDate, results })
}
