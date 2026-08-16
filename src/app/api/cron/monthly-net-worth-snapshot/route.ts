import { createAdminClient } from '@/lib/supabase/admin'
import { computeNetWorthTotals } from '@/lib/netWorthTotals'

// Runs daily. Recomputes a rolling window (current month + 2 prior) instead
// of freezing a single "photo" on day 1 — so if transactions get entered late
// (e.g. crypto catch-up weeks after month-end) the snapshot self-corrects on
// the next run instead of staying stale. Months older than the window are
// left untouched once they've had time to settle.
const MONTHS_BACK = 2

function lastDayOfMonth(year: number, monthIndex0: number): Date {
  return new Date(year, monthIndex0 + 1, 0)
}

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

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // snapshot_date is always the canonical month-end; cutoff caps at today for the in-progress month
  const monthTargets: { snapshotDate: string; cutoff: string }[] = []
  for (let back = MONTHS_BACK; back >= 0; back--) {
    const monthEnd = lastDayOfMonth(today.getFullYear(), today.getMonth() - back).toISOString().slice(0, 10)
    const cutoff = monthEnd > todayStr ? todayStr : monthEnd
    monthTargets.push({ snapshotDate: monthEnd, cutoff })
  }

  const results: { user_id: string; snapshot_date: string; error?: string }[] = []

  for (const { user_id } of users) {
    for (const { snapshotDate, cutoff } of monthTargets) {
      try {
        const totals = await computeNetWorthTotals(admin, user_id, cutoff)
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
        results.push({ user_id, snapshot_date: snapshotDate, error: error?.message })
        if (error) console.error(`[monthly-net-worth-snapshot] Error para ${user_id} (${snapshotDate}):`, error.message)
      } catch (err) {
        results.push({ user_id, snapshot_date: snapshotDate, error: String(err) })
        console.error(`[monthly-net-worth-snapshot] Error para ${user_id} (${snapshotDate}):`, err)
      }
    }
  }

  console.log(`[monthly-net-worth-snapshot] Cron completado: ${results.length} snapshots`)
  return Response.json({ results })
}
