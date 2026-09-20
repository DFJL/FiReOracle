import { createAdminClient } from '@/lib/supabase/admin'
import { displayCategory, isLoanPayment } from '@/app/(dashboard)/resumen/categoryUtils'
import { buildRootCodeMap, cleanLifestyleOutliers, isExtraLoanPrincipalPayment } from '@/lib/lifestyleExpenses'
import { computeBucketTotals, type BucketDef, type BucketTxRow } from '@/lib/bucketBalance'

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
// aggregation over real rows (or the same shared formulas /progreso and
// /inversiones already use) — nothing is generated or guessed by an LLM,
// so there's no hallucination risk (same principle as Oracle's tools).
export async function getDailyFact(userId: string): Promise<DailyFact | null> {
  const admin = createAdminClient()
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const rolling12Start = new Date(now.getFullYear(), now.getMonth() - 12, 1).toISOString().slice(0, 10)

  const [
    { data: allTxRaw },
    { data: snapshots },
    { data: categoriesRaw },
    { data: fireConfig },
    { data: envelopesRaw },
    { data: movementsRaw },
    { data: bucketsRaw },
    { data: budgetsRaw },
  ] = await Promise.all([
    admin.from('transactions')
      .select('date, amount, movement_type, expense_group, category_code, concept, vendor, is_settlement, is_passive_income, investment_bucket_id')
      .eq('user_id', userId)
      .not('amount', 'is', null)
      .not('date', 'is', null)
      .range(0, 49999),
    admin.from('net_worth_snapshots')
      .select('snapshot_date, net_worth_crc, invested_crc, liquid_crc')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: true }),
    admin.from('transaction_categories').select('code, parent_code'),
    admin.from('user_financial_config').select('*').eq('user_id', userId).maybeSingle(),
    admin.from('savings_envelopes').select('id, parent_envelope_id').eq('user_id', userId).eq('is_active', true),
    admin.from('envelope_movements').select('amount, movement_type, envelope_id').eq('user_id', userId),
    admin.from('user_investment_buckets')
      .select('id, name, bucket_type, vendors, concept_map, account_id, baseline_date, baseline_value_crc')
      .eq('user_id', userId).eq('is_active', true),
    admin.from('budgets')
      .select('category, auto_tx_category_code, monthly_limit')
      .eq('user_id', userId).eq('is_active', true)
      .not('auto_tx_category_code', 'is', null),
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
  const curStart  = rolling12Start
  const curEnd    = currentMonthStart
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

  // 6. 6-month lifestyle spend trend (recurring vs one-off already stripped out)
  const sixMoStart  = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10)
  const twelveMoStart = new Date(now.getFullYear(), now.getMonth() - 12, 1).toISOString().slice(0, 10)
  const last6mo  = cleaned.filter(t => t.date && t.date >= sixMoStart && t.date < currentMonthStart).reduce((s, t) => s + t.amount, 0)
  const prev6mo  = cleaned.filter(t => t.date && t.date >= twelveMoStart && t.date < sixMoStart).reduce((s, t) => s + t.amount, 0)
  if (prev6mo > 100_000) {
    const trendPct = ((last6mo - prev6mo) / prev6mo) * 100
    if (Math.abs(trendPct) >= 8) {
      facts.push({
        emoji: trendPct < 0 ? '📉' : '📈',
        text: `Tu gasto de vida promedio ${trendPct < 0 ? 'bajó' : 'subió'} ${Math.abs(trendPct).toFixed(0)}% en los últimos 6 meses comparado con los 6 anteriores.`,
      })
    }
  }

  // 7. Account age
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

  // 8. Transaction volume
  facts.push({
    emoji: '🧾',
    text: `Llevás ${txs.length.toLocaleString('es-CR')} transacciones registradas en total. Cada una de esas es una decisión que ya tomaste — este dashboard solo te ayuda a verla.`,
  })

  // ── Patrimonio ────────────────────────────────────────────────────────────

  // 9. Net worth growth over the last 12 months
  if (snapshots && snapshots.length > 1) {
    const latest = snapshots[snapshots.length - 1]
    const yearAgo = [...snapshots].reverse().find(s => s.snapshot_date <= rolling12Start) ?? snapshots[0]
    const latestNw = Number(latest.net_worth_crc)
    const yearAgoNw = Number(yearAgo.net_worth_crc)
    if (yearAgoNw > 0 && yearAgo.snapshot_date !== latest.snapshot_date) {
      const pct = ((latestNw - yearAgoNw) / yearAgoNw) * 100
      facts.push({
        emoji: pct >= 0 ? '🏔️' : '🩹',
        text: `Tu patrimonio neto ${pct >= 0 ? 'creció' : 'bajó'} ${Math.abs(pct).toFixed(0)}% en los últimos 12 meses: de ${fmtCRC(yearAgoNw)} a ${fmtCRC(latestNw)}.`,
      })
    }
  }

  // 10. Liquid vs invested split
  if (snapshots && snapshots.length > 0) {
    const latest = snapshots[snapshots.length - 1] as { invested_crc?: number | null; liquid_crc?: number | null }
    const invested = Number(latest.invested_crc ?? 0)
    const liquid = Number(latest.liquid_crc ?? 0)
    const total = invested + liquid
    if (total > 0) {
      facts.push({
        emoji: '⚖️',
        text: `De tu patrimonio invertible, el ${((invested / total) * 100).toFixed(0)}% está en inversiones y el ${((liquid / total) * 100).toFixed(0)}% en liquidez.`,
      })
    }
  }

  // ── Inversiones ───────────────────────────────────────────────────────────

  const bucketDefs = (bucketsRaw ?? []) as (BucketDef & { account_id: string | null })[]
  const bucketTxRows: BucketTxRow[] = txs as BucketTxRow[]

  // Snapshot-based bucket balances (e.g. brokerage accounts synced manually)
  const snapshotBuckets = bucketDefs.filter(b => b.bucket_type === 'snapshot_based' && b.account_id)
  const snapshotBalances: Record<string, number> = {}
  await Promise.all(snapshotBuckets.map(async b => {
    const { data } = await admin.from('account_balance_snapshots')
      .select('real_balance')
      .eq('account_id', b.account_id!)
      .order('snapshot_date', { ascending: false })
      .limit(1).maybeSingle()
    snapshotBalances[b.id] = data?.real_balance ? Number(data.real_balance) : 0
  }))

  const bucketBalances = bucketDefs.map(def => ({
    name: def.name ?? 'Bucket',
    balance: def.bucket_type === 'snapshot_based'
      ? (snapshotBalances[def.id] ?? 0)
      : computeBucketTotals(def, bucketTxRows).balance,
  })).filter(b => b.balance > 0)

  // 11. Portfolio composition — top bucket by share
  const totalInvestedAcrossBuckets = bucketBalances.reduce((s, b) => s + b.balance, 0)
  const topBucket = [...bucketBalances].sort((a, b) => b.balance - a.balance)[0]
  if (topBucket && totalInvestedAcrossBuckets > 0) {
    facts.push({
      emoji: '🥧',
      text: `${topBucket.name} es tu mayor posición: ${((topBucket.balance / totalInvestedAcrossBuckets) * 100).toFixed(0)}% de tu portafolio invertido (${fmtCRC(topBucket.balance)}).`,
    })
  }

  // ── Presupuesto ───────────────────────────────────────────────────────────

  const thisMonthSpendByCode: Record<string, number> = {}
  for (const t of expenseTxs) {
    if (t.date && t.date >= currentMonthStart && t.category_code) {
      thisMonthSpendByCode[t.category_code] = (thisMonthSpendByCode[t.category_code] ?? 0) + t.amount
    }
  }
  const budgetUsages = (budgetsRaw ?? [])
    .map(b => {
      const code = b.auto_tx_category_code as string
      const spent = thisMonthSpendByCode[code] ?? 0
      const limit = Number(b.monthly_limit ?? 0)
      return { category: b.category, spent, limit, pct: limit > 0 ? (spent / limit) * 100 : 0 }
    })
    .filter(b => b.limit > 0)
  const tightestBudget = [...budgetUsages].sort((a, b) => b.pct - a.pct)[0]
  if (tightestBudget) {
    facts.push({
      emoji: tightestBudget.pct >= 100 ? '🚨' : tightestBudget.pct >= 80 ? '⚠️' : '✅',
      text: `Este mes llevás usado el ${tightestBudget.pct.toFixed(0)}% de tu presupuesto de ${tightestBudget.category} (${fmtCRC(tightestBudget.spent)} de ${fmtCRC(tightestBudget.limit)}).`,
    })
  }

  // ── FIRE ──────────────────────────────────────────────────────────────────

  const parentEnvelopeIds = new Set(
    (envelopesRaw ?? []).filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string)
  )
  const liquidBalance = (movementsRaw ?? [])
    .filter(m => m.movement_type !== 'interes' && !parentEnvelopeIds.has(m.envelope_id))
    .reduce((s, m) => s + Number(m.amount), 0)

  const activosInvertibles = liquidBalance + totalInvestedAcrossBuckets

  const cur12mTxs = txs.filter(t => t.date && t.date >= rolling12Start && t.date < currentMonthStart)
  const avgLifestyleExpenses = cleaned
    .filter(t => t.date && t.date >= rolling12Start && t.date < currentMonthStart)
    .reduce((s, t) => s + t.amount, 0) / 12
  const avgMonthlyLoanPayments = cur12mTxs
    .filter(t => (t.movement_type === 'expense' || t.movement_type === 'cash_withdrawal') &&
      isLoanPayment(t.vendor, t.concept, t.category_code) &&
      !isExtraLoanPrincipalPayment(t.concept, t.category_code))
    .reduce((s, t) => s + t.amount, 0) / 12
  const avgMonthlyPassiveIncome = cur12mTxs
    .filter(t => t.movement_type === 'income' && t.is_passive_income && !t.is_settlement)
    .reduce((s, t) => s + t.amount, 0) / 12

  const avgMonthlyObligations = avgLifestyleExpenses + avgMonthlyLoanPayments
  const avgNetBurn = Math.max(avgMonthlyObligations - avgMonthlyPassiveIncome, 0)
  const runway = avgNetBurn > 0
    ? liquidBalance / avgNetBurn
    : avgMonthlyObligations > 0 ? liquidBalance / avgMonthlyObligations : 0

  const swr = fireConfig?.fire_withdrawal_rate ?? 0.04
  // Always the real trailing-12m average — never a manually-typed target
  // that can silently drift from actual spending. Kept in sync with /progreso.
  const targetExp = avgLifestyleExpenses
  const fireNumber = targetExp > 0 ? (targetExp * 12) / swr : 0
  const fireProgress = fireNumber > 0 ? (activosInvertibles / fireNumber) * 100 : 0

  // 12. FIRE progress
  if (fireNumber > 0) {
    facts.push({
      emoji: '🔥',
      text: `Estás al ${fireProgress.toFixed(1)}% de tu número FIRE: ${fmtCRC(activosInvertibles)} de ${fmtCRC(fireNumber)}.`,
    })
  }

  // 13. Runway
  if (runway > 0) {
    facts.push({
      emoji: '🛟',
      text: `Con tu liquidez actual (${fmtCRC(liquidBalance)}) y tu quema neta mensual, tu runway es de ${runway.toFixed(1)} meses.`,
    })
  }

  if (facts.length === 0) return null
  const idx = seededIndex(`${userId}-${todayStr}`, facts.length)
  return facts[idx]
}
