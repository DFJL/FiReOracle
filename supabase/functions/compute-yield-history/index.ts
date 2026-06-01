import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXCHANGE_RATE_URL = 'https://tipodecambio.paginasweb.cr/api'
const FALLBACK_RATE = 520

// ── Types ─────────────────────────────────────────────────────────────────────

type ConceptMap = {
  depositConcepts: string[]
  rendimientosConcepts: string[]
  valorizacionConcepts: string[]
  liquidacionConcepts: string[]
}

type Bucket = {
  id: string
  name: string
  bucket_type: string
  vendors: string[] | null
  concept_map: ConceptMap | null
  user_id: string
}

type Transaction = {
  vendor: string | null
  concept: string | null
  movement_type: string | null
  expense_group: string | null
  is_settlement: boolean
  is_passive_income: boolean
  amount: number | null
  date: string | null
}

type MonthlyAccumulator = {
  income_crc: number
  delta_crc: number
}

type YieldRow = {
  user_id: string
  bucket_id: string
  product_name: string
  year_month: string
  yield_usd: number
  invested_usd: number
  yield_pct: number
  exchange_rate: number
  source: 'computed'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toYearMonth(date: string): string {
  return date.slice(0, 7) + '-01'
}

function matchesVendor(vendor: string | null, vendors: string[]): boolean {
  if (!vendor) return false
  const lower = vendor.toLowerCase()
  return vendors.some((v) => v.toLowerCase() === lower)
}

function matchesConcept(concept: string | null, concepts: string[]): boolean {
  if (!concept) return false
  const lower = concept.toLowerCase()
  return concepts.some((c) => c.toLowerCase() === lower)
}

async function fetchSellRate(): Promise<number> {
  try {
    const res = await fetch(EXCHANGE_RATE_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const sell = Number(data.venta ?? data.sell ?? 0)
    if (!sell || sell < 300 || sell > 700) throw new Error(`Rate out of range: ${sell}`)
    return sell
  } catch (err) {
    console.warn('compute-yield-history: exchange rate fetch failed, using fallback', err)
    return FALLBACK_RATE
  }
}

// ── Core computation ──────────────────────────────────────────────────────────

function computeYieldRows(
  bucket: Bucket,
  transactions: Transaction[],
  exchangeRate: number,
  currentYearMonth: string,
): YieldRow[] {
  if (bucket.bucket_type === 'snapshot_based') return []

  const byMonth = new Map<string, MonthlyAccumulator>()

  for (const tx of transactions) {
    if (!tx.date || tx.amount == null) continue

    const ym = toYearMonth(tx.date)
    if (ym >= currentYearMonth) continue

    let isIncome = false
    let isDelta = false
    let sign = 1

    if (bucket.bucket_type === 'vendor_based') {
      const vendors = bucket.vendors ?? []
      if (!matchesVendor(tx.vendor, vendors)) continue

      if (tx.is_passive_income && tx.movement_type === 'income') {
        isIncome = true
        isDelta = true
        sign = 1
      } else if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) {
        isDelta = true
        sign = 1
      } else if (tx.is_settlement) {
        isDelta = true
        sign = -1
      } else if (tx.is_passive_income && tx.movement_type == null) {
        isDelta = true
        sign = 1
      } else {
        continue
      }
    } else if (bucket.bucket_type === 'concept_based') {
      const cm = bucket.concept_map
      if (!cm) continue

      if (matchesConcept(tx.concept, cm.rendimientosConcepts)) {
        isIncome = true
        isDelta = true
        sign = 1
      } else if (
        matchesConcept(tx.concept, cm.depositConcepts) ||
        matchesConcept(tx.concept, cm.valorizacionConcepts)
      ) {
        isDelta = true
        sign = 1
      } else if (matchesConcept(tx.concept, cm.liquidacionConcepts)) {
        isDelta = true
        sign = -1
      } else {
        continue
      }
    } else {
      continue
    }

    const acc = byMonth.get(ym) ?? { income_crc: 0, delta_crc: 0 }
    if (isIncome) acc.income_crc += tx.amount
    if (isDelta) acc.delta_crc += sign * tx.amount
    byMonth.set(ym, acc)
  }

  if (byMonth.size === 0) return []

  const sortedMonths = Array.from(byMonth.keys()).sort()
  const rows: YieldRow[] = []
  let balance = 0

  for (const ym of sortedMonths) {
    const { income_crc, delta_crc } = byMonth.get(ym)!

    if (income_crc > 0) {
      const yieldPct = balance > 0 ? (income_crc / balance) * 100 : 0
      rows.push({
        user_id: bucket.user_id,
        bucket_id: bucket.id,
        product_name: bucket.name,
        year_month: ym,
        yield_usd: income_crc / exchangeRate,
        invested_usd: balance / exchangeRate,
        yield_pct: yieldPct,
        exchange_rate: exchangeRate,
        source: 'computed',
      })
    }

    balance += delta_crc
  }

  return rows
}

async function processUser(
  userId: string,
  supabase: ReturnType<typeof createClient>,
  exchangeRate: number,
  currentYearMonth: string,
): Promise<number> {
  // Fetch active buckets for user
  const { data: bucketsRaw, error: bucketsErr } = await supabase
    .from('user_investment_buckets')
    .select('id, name, bucket_type, vendors, concept_map, user_id')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (bucketsErr) {
    console.error(`[${userId}] buckets fetch error:`, bucketsErr.message)
    return 0
  }
  if (!bucketsRaw?.length) return 0

  const buckets = bucketsRaw as Bucket[]

  // Fetch transactions for user
  const { data: txRaw, error: txErr } = await supabase
    .from('transactions')
    .select('vendor, concept, movement_type, expense_group, is_settlement, is_passive_income, amount, date')
    .eq('user_id', userId)
    .not('date', 'is', null)
    .not('amount', 'is', null)

  if (txErr) {
    console.error(`[${userId}] transactions fetch error:`, txErr.message)
    return 0
  }

  const transactions = (txRaw ?? []) as Transaction[]

  // Compute yield rows
  const allRows: YieldRow[] = []
  for (const bucket of buckets) {
    const rows = computeYieldRows(bucket, transactions, exchangeRate, currentYearMonth)
    allRows.push(...rows)
  }

  if (allRows.length === 0) return 0

  const { error: upsertErr } = await supabase
    .from('investment_yield_history')
    .upsert(allRows, { onConflict: 'user_id,product_name,year_month' })

  if (upsertErr) {
    console.error(`[${userId}] upsert error:`, upsertErr.message)
    return 0
  }

  return allRows.length
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const url = new URL(req.url)
    const filterUserId = url.searchParams.get('user_id') ?? null

    // Determine users to process
    let userIds: string[]

    if (filterUserId) {
      userIds = [filterUserId]
    } else {
      const { data: profiles, error: profilesErr } = await supabase
        .from('user_profiles')
        .select('user_id')

      if (profilesErr) throw profilesErr
      userIds = (profiles ?? []).map((p: { user_id: string }) => p.user_id)
    }

    if (userIds.length === 0) {
      return Response.json({ ok: true, users: 0, rows: 0 })
    }

    const exchangeRate = await fetchSellRate()

    // Current year-month (first day) — skip partial current month
    const now = new Date()
    const currentYearMonth =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    let totalRows = 0

    for (const userId of userIds) {
      const rows = await processUser(userId, supabase, exchangeRate, currentYearMonth)
      totalRows += rows
      console.log(`[compute-yield-history] user=${userId} rows=${rows}`)
    }

    return Response.json({ ok: true, users: userIds.length, rows: totalRows })
  } catch (err) {
    console.error('compute-yield-history fatal error:', err)
    return Response.json({ ok: false, error: String(err) }, { status: 500 })
  }
})
