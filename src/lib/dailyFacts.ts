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

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })
}

// Deterministic PRNG (mulberry32) seeded from a string — same sequence every
// time for the same seed, no state stored anywhere.
function seededRng(seedStr: string): () => number {
  let hash = 0
  for (let i = 0; i < seedStr.length; i++) hash = (hash * 31 + seedStr.charCodeAt(i)) | 0
  let seed = hash >>> 0
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  const rng = seededRng(seedStr)
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Picks one phrasing out of several for the same underlying fact, seeded
// independently of which fact gets chosen — so even a fact that recurs
// across cycles doesn't read like the exact same sentence every time.
function pickPhrasing(variants: string[], seedStr: string): string {
  const rng = seededRng(seedStr)
  return variants[Math.floor(rng() * variants.length)]
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
    admin.from('savings_envelopes').select('id, name, parent_envelope_id').eq('user_id', userId).eq('is_active', true),
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

  const firstDate = txs.reduce((min, t) => (t.date && t.date < min ? t.date : min), txs[0].date ?? todayStr)
  const daysSince = (dateStr: string) =>
    Math.max(1, Math.floor((now.getTime() - new Date(dateStr + 'T12:00:00').getTime()) / 86_400_000))

  // Shared seed for phrasing variety — one draw per day, independent of
  // which fact ends up chosen, so the tone doesn't feel templated.
  const phraseSeed = `${userId}-${todayStr}-phrasing`

  const parentEnvelopeIds = new Set(
    (envelopesRaw ?? []).filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string)
  )
  const envelopeNameById = Object.fromEntries((envelopesRaw ?? []).map(e => [e.id, (e as { name?: string | null }).name ?? '']))

  // 1. Biggest single expense ever
  if (expenseTxs.length > 0) {
    const biggest = expenseTxs.reduce((a, b) => (b.amount > a.amount ? b : a))
    const detail = biggest.concept ? ` (${biggest.concept})` : ''
    facts.push({
      emoji: '💸',
      text: pickPhrasing([
        `Tu gasto más grande registrado es de ${fmtCRC(biggest.amount)}, el ${fmtDate(biggest.date!)}${detail}.`,
        `El récord de gasto en una sola transacción lo tenés vos: ${fmtCRC(biggest.amount)}${detail}, el ${fmtDate(biggest.date!)}.`,
        `¿Te acordás del ${fmtDate(biggest.date!)}? Ahí hiciste tu gasto más grande hasta ahora: ${fmtCRC(biggest.amount)}${detail}.`,
      ], `${phraseSeed}-biggest`),
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
    const [name, total] = topVendor
    facts.push({
      emoji: '🛍️',
      text: pickPhrasing([
        `${name} es tu comercio histórico número 1 — llevás ${fmtCRC(total)} gastados ahí en total.`,
        `Nadie se lleva más plata tuya que ${name}: ${fmtCRC(total)} acumulados a lo largo de tu historial.`,
        `Si tuvieras que nombrar un lugar favorito según tu billetera, sería ${name} — ${fmtCRC(total)} invertidos ahí.`,
      ], `${phraseSeed}-topvendor`),
    })
  }

  // 3b. Vendor frequency — different axis than "spent the most": who you see
  // most *often*, even if each visit is modest.
  const vendorStats: Record<string, { total: number; count: number }> = {}
  for (const t of expenseTxs) {
    const v = (t.vendor ?? '').trim()
    if (!v || v.toLowerCase() === 'na') continue
    const s = (vendorStats[v] ??= { total: 0, count: 0 })
    s.total += t.amount
    s.count += 1
  }
  const mostFrequent = Object.entries(vendorStats).filter(([, s]) => s.count >= 5).sort((a, b) => b[1].count - a[1].count)[0]
  if (mostFrequent) {
    const [name, s] = mostFrequent
    const everyDays = Math.round(daysSince(firstDate) / s.count)
    facts.push({
      emoji: '🔁',
      text: pickPhrasing([
        `${name} es donde más repetís: ${s.count} transacciones, una cada ${everyDays} días en promedio.`,
        `En promedio volvés a ${name} cada ${everyDays} días — ${s.count} veces en total.`,
      ], `${phraseSeed}-frequency`),
    })
  }

  // 3c. "Gasto hormiga" — frequent small-ticket vendor whose lifetime total
  // becomes surprising once annualized. The aha is the contrast between
  // "feels small each time" and "adds up to real money per year."
  const hormiga = Object.entries(vendorStats)
    .filter(([, s]) => s.count >= 8 && s.total / s.count < 15_000)
    .sort((a, b) => b[1].total - a[1].total)[0]
  if (hormiga) {
    const [name, s] = hormiga
    const perVisit = s.total / s.count
    const monthsOfHistory = Math.max(1, daysSince(firstDate) / 30)
    const perYear = (s.total / monthsOfHistory) * 12
    facts.push({
      emoji: '🐜',
      text: pickPhrasing([
        `${name} parece poca cosa cada vez (${fmtCRC(perVisit)} en promedio) — pero a tu ritmo actual, son ${fmtCRC(perYear)} al año.`,
        `Gasto hormiga detectado: ${name}, ${s.count} veces por ${fmtCRC(perVisit)} cada una. Anualizado, eso es ${fmtCRC(perYear)}.`,
      ], `${phraseSeed}-hormiga`),
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

  // 6b. Cheapest month ever (complete months only — never the in-progress one)
  const monthlyExpense: Record<string, number> = {}
  for (const t of expenseTxs) {
    if (!t.date) continue
    const ym = t.date.slice(0, 7)
    monthlyExpense[ym] = (monthlyExpense[ym] ?? 0) + t.amount
  }
  const completeMonths = Object.entries(monthlyExpense).filter(([ym]) => ym !== todayStr.slice(0, 7))
  if (completeMonths.length >= 3) {
    const cheapest = completeMonths.reduce((a, b) => (b[1] < a[1] ? b : a))
    facts.push({
      emoji: '🏆',
      text: pickPhrasing([
        `Tu mes más barato hasta ahora fue ${fmtMonth(cheapest[0])}, con solo ${fmtCRC(cheapest[1])} gastados en total.`,
        `El récord de mes más disciplinado es de ${fmtMonth(cheapest[0])}: ${fmtCRC(cheapest[1])} y nada más.`,
      ], `${phraseSeed}-cheapmonth`),
    })

    // 6c. Same calendar month vs. a year ago — strips out seasonality noise
    // that a flat rolling-12m comparison can hide (e.g. December is always
    // pricier than August, regardless of any real trend).
    const lastComplete = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastCompleteYm = lastComplete.toISOString().slice(0, 7)
    const sameMonthLastYearYm = new Date(lastComplete.getFullYear() - 1, lastComplete.getMonth(), 1).toISOString().slice(0, 7)
    const lastCompleteTotal = monthlyExpense[lastCompleteYm] ?? 0
    const sameMonthLastYearTotal = monthlyExpense[sameMonthLastYearYm] ?? 0
    if (lastCompleteTotal > 0 && sameMonthLastYearTotal > 50_000) {
      const pct = ((lastCompleteTotal - sameMonthLastYearTotal) / sameMonthLastYearTotal) * 100
      if (Math.abs(pct) >= 10) {
        facts.push({
          emoji: pct < 0 ? '🙌' : '👀',
          text: `${fmtMonth(lastCompleteYm)} gastaste ${Math.abs(pct).toFixed(0)}% ${pct < 0 ? 'menos' : 'más'} que en ${fmtMonth(sameMonthLastYearYm)} — mismo mes, un año de diferencia.`,
        })
      }
    }
  }

  // 7. Account age
  const daysTracking = daysSince(firstDate)
  if (daysTracking > 30) {
    facts.push({
      emoji: '🗓️',
      text: pickPhrasing([
        `Llevás ${Math.floor(daysTracking / 30)} meses (${daysTracking.toLocaleString('es-CR')} días) registrando tus finanzas — desde el ${fmtDate(firstDate)}.`,
        `Todo esto arrancó el ${fmtDate(firstDate)} — ${daysTracking.toLocaleString('es-CR')} días construyendo este historial.`,
      ], `${phraseSeed}-age`),
    })
  }

  // 7b. Average daily spend — the same money feels different as a daily drip
  if (daysTracking > 30) {
    const totalExpense = expenseTxs.reduce((s, t) => s + t.amount, 0)
    const perDay = totalExpense / daysTracking
    facts.push({
      emoji: '☕',
      text: pickPhrasing([
        `En promedio gastás ${fmtCRC(perDay)} por día — unos ${fmtCRC(perDay * 30)} al mes.`,
        `Visto día a día, tu ritmo de gasto es de ${fmtCRC(perDay)} diarios.`,
      ], `${phraseSeed}-perday`),
    })
  }

  // 8. Transaction volume
  facts.push({
    emoji: '🧾',
    text: pickPhrasing([
      `Llevás ${txs.length.toLocaleString('es-CR')} transacciones registradas en total. Cada una de esas es una decisión que ya tomaste — este dashboard solo te ayuda a verla.`,
      `${txs.length.toLocaleString('es-CR')} transacciones y contando — cada una es un dato real sobre cómo vivís, no una suposición.`,
    ], `${phraseSeed}-txcount`),
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

  // 9b. Streak of consecutive snapshots where net worth didn't drop
  if (snapshots && snapshots.length > 2) {
    let streak = 0
    for (let i = snapshots.length - 1; i > 0; i--) {
      if (Number(snapshots[i].net_worth_crc) >= Number(snapshots[i - 1].net_worth_crc)) streak++
      else break
    }
    if (streak >= 2) {
      facts.push({
        emoji: '🧱',
        text: pickPhrasing([
          `Llevás ${streak} meses seguidos en que tu patrimonio neto no baja — seguís construyendo, mes a mes.`,
          `${streak} cortes de mes consecutivos sin retroceder en patrimonio neto. Esa es la racha que importa.`,
        ], `${phraseSeed}-streak`),
      })
    }
  }

  // 9c. Distance to the next round-number net worth milestone
  if (snapshots && snapshots.length > 0) {
    const latestNw = Number(snapshots[snapshots.length - 1].net_worth_crc)
    if (latestNw > 500_000) {
      const step = latestNw >= 50_000_000 ? 10_000_000 : latestNw >= 10_000_000 ? 5_000_000 : 1_000_000
      const nextMilestone = Math.ceil((latestNw + 1) / step) * step
      const falta = nextMilestone - latestNw
      if (falta > 0 && falta < step) {
        facts.push({
          emoji: '🎯',
          text: pickPhrasing([
            `Te faltan ${fmtCRC(falta)} para llegar a ${fmtCRC(nextMilestone)} de patrimonio neto.`,
            `${fmtCRC(nextMilestone)} de patrimonio está a solo ${fmtCRC(falta)} de distancia.`,
          ], `${phraseSeed}-milestone`),
        })
      }
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

  // 11b. Envelope/sobre that's grown the most — leaf sobres only, since a
  // parent container's "growth" is really just its children's growth double-counted.
  const envelopeGrowth: Record<string, number> = {}
  for (const m of (movementsRaw ?? [])) {
    if (m.movement_type === 'interes') continue
    envelopeGrowth[m.envelope_id] = (envelopeGrowth[m.envelope_id] ?? 0) + Number(m.amount)
  }
  const topGrowthEnvelope = Object.entries(envelopeGrowth)
    .filter(([id]) => !parentEnvelopeIds.has(id) && envelopeNameById[id])
    .sort((a, b) => b[1] - a[1])[0]
  if (topGrowthEnvelope && topGrowthEnvelope[1] > 0) {
    const name = envelopeNameById[topGrowthEnvelope[0]]
    facts.push({
      emoji: '🌱',
      text: pickPhrasing([
        `Tu sobre "${name}" es el que más ha crecido: ${fmtCRC(topGrowthEnvelope[1])} acumulados.`,
        `"${name}" lidera entre tus sobres — ${fmtCRC(topGrowthEnvelope[1])} y sumando.`,
      ], `${phraseSeed}-envgrowth`),
    })
  }

  // ── FIRE ──────────────────────────────────────────────────────────────────

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
  // Real trailing-12m average whenever there's spending history; the manual
  // config value is only a bootstrap fallback for a brand-new user with no
  // history yet. Kept in sync with /progreso.
  const targetExp = avgLifestyleExpenses > 0 ? avgLifestyleExpenses : (fireConfig?.fire_target_monthly_exp ?? 0)
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

  // Cycle through every available fact once before any of them repeats,
  // instead of a flat hash-per-day pick that could (and did) land on the
  // same fact again just a couple days later with no guarantee of hitting
  // the rest of the pool first. Each block of facts.length days is its own
  // shuffled cycle, reseeded per cycle so the order itself keeps changing.
  const daysSinceEpoch = Math.floor(new Date(todayStr + 'T00:00:00Z').getTime() / 86_400_000)
  const cycleLen = facts.length
  const cycleNumber = Math.floor(daysSinceEpoch / cycleLen)
  const dayInCycle = daysSinceEpoch % cycleLen
  const order = seededShuffle(facts.map((_, i) => i), `${userId}-cycle-${cycleNumber}-len-${cycleLen}`)
  return facts[order[dayInCycle]]
}
