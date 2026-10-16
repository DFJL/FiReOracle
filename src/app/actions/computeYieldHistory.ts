'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { revalidatePath } from 'next/cache'

function createCryptoAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'crypto' } }
  )
}

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

function toYearMonth(date: string): string {
  // Returns "YYYY-MM-01" — first day of the month, suitable for DATE column
  return date.slice(0, 7) + '-01'
}

// Strips stray punctuation (typos like a trailing backtick/quote) and collapses
// whitespace so "TRANSCOMER`" still matches the bucket's "TRANSCOMER" vendor.
function normalizeVendor(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, '').trim().replace(/\s+/g, ' ')
}

function matchesVendor(vendor: string | null, vendors: string[]): boolean {
  if (!vendor) return false
  const norm = normalizeVendor(vendor)
  return vendors.some((v) => normalizeVendor(v) === norm)
}

function matchesConcept(concept: string | null, concepts: string[]): boolean {
  if (!concept) return false
  const lower = concept.toLowerCase()
  return concepts.some((c) => c.toLowerCase() === lower)
}

function computeYieldRows(
  bucket: Bucket,
  transactions: Transaction[],
  exchangeRate: number,
  userId: string,
  currentYearMonth: string,
): YieldRow[] {
  if (bucket.bucket_type === 'snapshot_based') return []

  // Group transactions by year-month
  const byMonth = new Map<string, MonthlyAccumulator>()

  for (const tx of transactions) {
    if (!tx.date || tx.amount == null) continue

    const ym = toYearMonth(tx.date)
    // Skip the current (partial) month
    if (ym >= currentYearMonth) continue

    let isIncome = false
    let isDelta = false
    let sign = 1 // positive = increases balance

    if (bucket.bucket_type === 'vendor_based') {
      const vendors = bucket.vendors ?? []
      if (!matchesVendor(tx.vendor, vendors)) continue

      if (tx.is_passive_income && tx.movement_type === 'income') {
        // Passive income: yield for the month
        isIncome = true
        isDelta = true
        sign = 1
      } else if (
        tx.expense_group === 'objetivos_financieros' &&
        !tx.is_settlement
      ) {
        // Deposit: increases balance
        isDelta = true
        sign = 1
      } else if (tx.is_settlement) {
        // Liquidacion: decreases balance
        isDelta = true
        sign = -1
      } else if (tx.is_passive_income && tx.movement_type == null) {
        // Passive valuation: increases balance (not income)
        isDelta = true
        sign = 1
      } else {
        continue
      }
    } else if (bucket.bucket_type === 'concept_based') {
      const cm = bucket.concept_map
      if (!cm) continue

      if (matchesConcept(tx.concept, cm.rendimientosConcepts)) {
        // Income: yield for the month
        isIncome = true
        isDelta = true
        sign = 1
      } else if (
        matchesConcept(tx.concept, cm.depositConcepts) ||
        matchesConcept(tx.concept, cm.valorizacionConcepts)
      ) {
        // Deposit / valuation: increases balance
        isDelta = true
        sign = 1
      } else if (matchesConcept(tx.concept, cm.liquidacionConcepts)) {
        // Liquidacion: decreases balance
        isDelta = true
        sign = -1
      } else {
        continue
      }
    } else {
      continue
    }

    const acc = byMonth.get(ym) ?? { income_crc: 0, delta_crc: 0 }
    if (isIncome) {
      acc.income_crc += tx.amount
    }
    if (isDelta) {
      acc.delta_crc += sign * tx.amount
    }
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
        user_id: userId,
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

// snapshot_based buckets have no concept_map to replay — computeYieldRows
// above always skips them, which is exactly why IBKR has never had a single
// yield-history row despite being snapshot_based for months. For a bucket
// fed live by DeFiReTracker (crypto_portfolio_links), yield for a month is
// derivable anyway: the month's balance change minus that month's net new
// capital (buys/transfers in, minus sells/transfers out, weighted by
// ownership %) is the part of the change that wasn't just money moving —
// i.e. the actual gain. Only covers months where this bucket already has
// two consecutive monthly snapshots, so it starts accumulating from the
// sync's first full month forward; it doesn't back-fill history before that.
async function computeSnapshotBucketYieldRows(
  admin: ReturnType<typeof createAdminClient>,
  bucket: { id: string; name: string },
  userId: string,
  currentYearMonth: string,
  exchangeRate: number,
): Promise<YieldRow[]> {
  const { data: links } = await admin
    .from('crypto_portfolio_links')
    .select('portfolio_id, ownership_pct')
    .eq('bucket_id', bucket.id)
    .eq('is_active', true)
  if (!links || links.length === 0) return []

  const { data: bucketRow } = await admin
    .from('user_investment_buckets')
    .select('account_id')
    .eq('id', bucket.id)
    .maybeSingle()
  if (!bucketRow?.account_id) return []

  const { data: snaps } = await admin
    .from('account_balance_snapshots')
    .select('snapshot_date, real_balance_native')
    .eq('account_id', bucketRow.account_id)
    .order('snapshot_date', { ascending: true })
  if (!snaps || snaps.length === 0) return []

  // Last snapshot within a month wins (snaps are sorted ascending).
  const monthlyBalance = new Map<string, number>()
  for (const s of snaps) {
    if (s.real_balance_native == null || !s.snapshot_date) continue
    monthlyBalance.set(String(s.snapshot_date).slice(0, 7), Number(s.real_balance_native))
  }

  const crypto = createCryptoAdminClient()
  const portfolioIds = links.map(l => l.portfolio_id)
  const { data: txs } = await crypto
    .from('transactions')
    .select('portfolio_id, type, qty, price_usd, fee_usd, date')
    .in('portfolio_id', portfolioIds)
    .range(0, 49999)

  const pctByPortfolio = new Map(links.map(l => [l.portfolio_id, Number(l.ownership_pct) / 100]))
  const monthlyFlowUsd = new Map<string, number>()
  for (const t of (txs ?? []) as { portfolio_id: string; type: string; qty: number; price_usd: number; fee_usd: number | null; date: string }[]) {
    const pct = pctByPortfolio.get(t.portfolio_id)
    if (pct == null || !t.date) continue
    const ym = t.date.slice(0, 7)
    const qty = Number(t.qty), price = Number(t.price_usd), fee = Number(t.fee_usd ?? 0)
    let flow = 0
    if (t.type === 'buy' || t.type === 'transfer_in') flow = (qty * price + fee) * pct
    else if (t.type === 'sell' || t.type === 'transfer_out') flow = -(qty * price - fee) * pct
    else continue
    monthlyFlowUsd.set(ym, (monthlyFlowUsd.get(ym) ?? 0) + flow)
  }

  const months = [...monthlyBalance.keys()].sort()
  const rows: YieldRow[] = []
  for (let i = 1; i < months.length; i++) {
    const ym = months[i]
    const ymFull = `${ym}-01`
    if (ymFull >= currentYearMonth) continue

    const startBal = monthlyBalance.get(months[i - 1])!
    const endBal = monthlyBalance.get(ym)!
    const flow = monthlyFlowUsd.get(ym) ?? 0
    const yieldUsd = endBal - startBal - flow
    if (Math.abs(yieldUsd) < 0.005) continue

    rows.push({
      user_id: userId,
      bucket_id: bucket.id,
      product_name: bucket.name,
      year_month: ymFull,
      yield_usd: yieldUsd,
      invested_usd: startBal,
      yield_pct: startBal > 0 ? (yieldUsd / startBal) * 100 : 0,
      exchange_rate: exchangeRate,
      source: 'computed',
    })
  }

  return rows
}

export async function computeYieldHistory(): Promise<{
  error: string | null
  rows: number
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado', rows: 0 }

  const admin = createAdminClient()

  // 1. Fetch active buckets
  const { data: bucketsRaw, error: bucketsErr } = await admin
    .from('user_investment_buckets')
    .select('id, name, bucket_type, vendors, concept_map')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (bucketsErr) return { error: bucketsErr.message, rows: 0 }
  if (!bucketsRaw?.length) return { error: null, rows: 0 }

  const buckets = bucketsRaw as Bucket[]

  // 2. Fetch transactions
  const { data: txRaw, error: txErr } = await admin
    .from('transactions')
    .select(
      'vendor, concept, movement_type, expense_group, is_settlement, is_passive_income, amount, date',
    )
    .eq('user_id', user.id)
    .not('date', 'is', null)
    .not('amount', 'is', null)
    // PostgREST caps unpaginated selects at 1000 rows silently — this user
    // has ~8,800 transactions, so this was quietly truncating.
    .range(0, 49999)

  if (txErr) return { error: txErr.message, rows: 0 }

  const transactions = (txRaw ?? []) as Transaction[]

  // 3. Fetch exchange rate
  const { sell: exchangeRate } = await fetchExchangeRate()

  // 4. Current year-month (first day), for excluding partial months
  const now = new Date()
  const currentYearMonth =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // 5. Compute yield rows for each bucket
  const allRows: YieldRow[] = []
  for (const bucket of buckets) {
    const rows = bucket.bucket_type === 'snapshot_based'
      ? await computeSnapshotBucketYieldRows(admin, bucket, user.id, currentYearMonth, exchangeRate)
      : computeYieldRows(bucket, transactions, exchangeRate, user.id, currentYearMonth)
    allRows.push(...rows)
  }

  if (allRows.length === 0) {
    revalidatePath('/inversiones')
    return { error: null, rows: 0 }
  }

  // 6. Protect imported rows — only upsert months not already covered by manual imports
  const { data: importedRows } = await admin
    .from('investment_yield_history')
    .select('product_name, year_month')
    .eq('user_id', user.id)
    .eq('source', 'imported')

  const importedKeys = new Set(
    (importedRows ?? []).map((r: { product_name: string; year_month: string }) => `${r.product_name}|${r.year_month}`)
  )
  const rowsToUpsert = allRows.filter(r => !importedKeys.has(`${r.product_name}|${r.year_month}`))

  if (rowsToUpsert.length === 0) {
    revalidatePath('/inversiones')
    return { error: null, rows: 0 }
  }

  const { error: upsertErr } = await admin
    .from('investment_yield_history')
    .upsert(rowsToUpsert, { onConflict: 'user_id,product_name,year_month' })

  if (upsertErr) return { error: upsertErr.message, rows: 0 }

  revalidatePath('/inversiones')
  return { error: null, rows: allRows.length }
}

// Alias used by PortfolioYield component
export const recomputeYieldHistory = computeYieldHistory
