import { createAdminClient } from '@/lib/supabase/admin'
import { displayCategory } from '@/app/(dashboard)/resumen/categoryUtils'
import { buildRootCodeMap, cleanLifestyleOutliers } from '@/lib/lifestyleExpenses'

export type DailyFact = { emoji: string; text: string }

function fmtCRC(n: number): string {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Deterministic pick so the same fact shows all day and only rotates once
// a day per user — no extra table/cron needed to "remember" today's pick.
function seededIndex(seed: string, mod: number): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(hash) % mod
}

const WEEKDAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']

// Builds a pool of real, computed facts about the user's own data and
// deterministically picks one for today. Every fact here is a plain
// aggregation over real rows — nothing is generated or guessed by an LLM,
// so there's no hallucination risk (same principle as Oracle's tools).
export async function getDailyFact(userId: string): Promise<DailyFact | null> {
  const admin = createAdminClient()
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const [{ data: allTxRaw }, { data: snapshots }, { data: categoriesRaw }] = await Promise.all([
    admin.from('transactions')
      .select('date, amount, movement_type, expense_group, category_code, concept, vendor')
      .eq('user_id', userId)
      .not('amount', 'is', null)
      .not('date', 'is', null)
      .range(0, 49999),
    admin.from('net_worth_snapshots')
      .select('snapshot_date, net_worth_crc')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: true }),
    admin.from('transaction_categories').select('code, parent_code'),
  ])

  const txs = (allTxRaw ?? []).map(t => ({ ...t, amount: Number(t.amount ?? 0) }))
  if (txs.length === 0) return null

  const facts: DailyFact[] = []
  const expenseTxs = txs.filter(t => (t.movement_type === 'expense' || t.movement_type === 'cash_withdrawal') && t.amount > 0)

  // 1. Biggest single expense ever
  if (expenseTxs.length > 0) {
    const biggest = expenseTxs.reduce((a, b) => (b.amount > a.amount ? b : a))
    facts.push({
      emoji: '💸',
      text: `Tu gasto más grande registrado es de ${fmtCRC(biggest.amount)}, el ${fmtDate(biggest.date!)}${biggest.concept ? ` (${biggest.concept})` : ''}.`,
    })
  }

  // 2. Net worth peak
  if (snapshots && snapshots.length > 0) {
    const peak = snapshots.reduce((a, b) => (Number(b.net_worth_crc) > Number(a.net_worth_crc) ? b : a))
    facts.push({
      emoji: '📈',
      text: `Tu patrimonio neto más alto registrado fue ${fmtCRC(Number(peak.net_worth_crc))}, el ${fmtDate(peak.snapshot_date)}.`,
    })
  }

  // 3. Top vendor by lifetime spend
  const vendorTotals: Record<string, number> = {}
  for (const t of expenseTxs) {
    const v = (t.vendor ?? '').trim()
    if (!v || v.toLowerCase() === 'na') continue
    vendorTotals[v] = (vendorTotals[v] ?? 0) + t.amount
  }
  const topVendor = Object.entries(vendorTotals).sort((a, b) => b[1] - a[1])[0]
  if (topVendor) {
    facts.push({
      emoji: '🛍️',
      text: `${topVendor[0]} es tu comercio histórico número 1 — llevás ${fmtCRC(topVendor[1])} gastados ahí en total.`,
    })
  }

  // 4. Weekday spending pattern (only surfaced if there's a real skew, not noise)
  const weekdayTotals = Array(7).fill(0)
  const weekdayCounts = Array(7).fill(0)
  for (const t of expenseTxs) {
    if (!t.date) continue
    const d = new Date(t.date + 'T12:00:00').getDay()
    weekdayTotals[d] += t.amount
    weekdayCounts[d] += 1
  }
  const weekdayAvgs = weekdayTotals.map((tot, i) => (weekdayCounts[i] > 3 ? tot / weekdayCounts[i] : 0))
  const maxAvg = Math.max(...weekdayAvgs)
  const maxIdx = weekdayAvgs.indexOf(maxAvg)
  const overallAvg = weekdayAvgs.reduce((s, v) => s + v, 0) / weekdayAvgs.filter(v => v > 0).length
  if (maxAvg > 0 && maxAvg > overallAvg * 1.2) {
    facts.push({
      emoji: '📅',
      text: `Los ${WEEKDAYS[maxIdx]} son tu día más caro: gastás en promedio ${fmtCRC(maxAvg)} por transacción, contra ${fmtCRC(overallAvg)} el resto de la semana.`,
    })
  }

  // 5. Biggest YoY category swing among lifestyle spend, outlier-cleaned the
  // same way as /progreso (@/lib/lifestyleExpenses) so a one-off purchase
  // doesn't get mistaken for a real trend.
  const getRootCode = buildRootCodeMap((categoriesRaw ?? []) as { code: string; parent_code?: string | null }[])
  const { cleaned } = cleanLifestyleOutliers(txs, getRootCode)
  const curStart  = new Date(now.getFullYear(), now.getMonth() - 12, 1).toISOString().slice(0, 10)
  const curEnd    = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 24, 1).toISOString().slice(0, 10)
  const sumByRoot = (arr: typeof cleaned) => {
    const m: Record<string, number> = {}
    for (const t of arr) {
      const root = getRootCode(t.category_code ?? '__na__')
      m[root] = (m[root] ?? 0) + t.amount
    }
    return m
  }
  const curByRoot  = sumByRoot(cleaned.filter(t => t.date && t.date >= curStart && t.date < curEnd))
  const prevByRoot = sumByRoot(cleaned.filter(t => t.date && t.date >= prevStart && t.date < curStart))
  let bestSwing: { root: string; pct: number; deltaAbs: number } | null = null
  for (const root of Object.keys(curByRoot)) {
    const prev = prevByRoot[root] ?? 0
    if (prev < 50_000) continue // too small a base for a meaningful %
    const pct = ((curByRoot[root] - prev) / prev) * 100
    if (!bestSwing || Math.abs(pct) > Math.abs(bestSwing.pct)) {
      bestSwing = { root, pct, deltaAbs: Math.abs(curByRoot[root] - prev) }
    }
  }
  if (bestSwing && Math.abs(bestSwing.pct) >= 15) {
    facts.push({
      emoji: bestSwing.pct < 0 ? '📉' : '📈',
      text: `${displayCategory(bestSwing.root)} ${bestSwing.pct < 0 ? 'bajó' : 'subió'} ${Math.abs(bestSwing.pct).toFixed(0)}% en los últimos 12 meses vs. los 12 anteriores (${fmtCRC(bestSwing.deltaAbs)}).`,
    })
  }

  // 6. Account age
  const firstDate = txs.reduce((min, t) => (t.date && t.date < min ? t.date : min), txs[0].date ?? todayStr)
  if (firstDate) {
    const days = Math.floor((now.getTime() - new Date(firstDate + 'T12:00:00').getTime()) / 86_400_000)
    if (days > 30) {
      facts.push({
        emoji: '🗓️',
        text: `Llevás ${Math.floor(days / 30)} meses (${days.toLocaleString('es-CR')} días) registrando tus finanzas — desde el ${fmtDate(firstDate)}.`,
      })
    }
  }

  // 7. Transaction volume
  facts.push({
    emoji: '🧾',
    text: `Llevás ${txs.length.toLocaleString('es-CR')} transacciones registradas en total. Cada una de esas es una decisión que ya tomaste — este dashboard solo te ayuda a verla.`,
  })

  if (facts.length === 0) return null
  const idx = seededIndex(`${userId}-${todayStr}`, facts.length)
  return facts[idx]
}
