'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { revalidatePath } from 'next/cache'

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
      const yieldPct = balance > 0 ? income_crc / balance : 0
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
    const rows = computeYieldRows(
      bucket,
      transactions,
      exchangeRate,
      user.id,
      currentYearMonth,
    )
    allRows.push(...rows)
  }

  if (allRows.length === 0) {
    revalidatePath('/inversiones')
    return { error: null, rows: 0 }
  }

  // 6. Upsert computed rows
  const { error: upsertErr } = await admin
    .from('investment_yield_history')
    .upsert(allRows, { onConflict: 'user_id,product_name,year_month' })

  if (upsertErr) return { error: upsertErr.message, rows: 0 }

  revalidatePath('/inversiones')
  return { error: null, rows: allRows.length }
}

// Alias used by PortfolioYield component
export const recomputeYieldHistory = computeYieldHistory
