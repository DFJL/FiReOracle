import { createAdminClient } from '@/lib/supabase/admin'

export interface ExchangeRate {
  buy: number
  sell: number
  date: string
  source: string
}

const FALLBACK_RATE = 515   // CRC/USD — estimado junio 2026
const RATE_MIN = 300
const RATE_MAX = 700

// How many hours before we consider the DB entry stale
const STALE_HOURS = 25

async function getLastCachedRate(maxAgeHours = STALE_HOURS): Promise<ExchangeRate | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('exchange_rates')
      .select('rate, rate_date, source, created_at')
      .eq('from_currency', 'USD')
      .eq('to_currency', 'CRC')
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null

    // Check freshness
    const createdAt = data.created_at ? new Date(data.created_at as string) : null
    if (maxAgeHours < Infinity && createdAt) {
      const ageMs = Date.now() - createdAt.getTime()
      if (ageMs > maxAgeHours * 3600 * 1000) return null
    }

    const r = Number(data.rate)
    return {
      buy:    +(r * 0.997).toFixed(2),
      sell:   r,
      date:   String(data.rate_date),
      source: String(data.source ?? 'caché'),
    }
  } catch {
    return null
  }
}

export async function persistRate(sell: number, buy: number, date: string, source: string) {
  try {
    const admin = createAdminClient()
    await admin.from('exchange_rates').upsert(
      { rate_date: date, from_currency: 'USD', to_currency: 'CRC', rate: sell, source },
      { onConflict: 'rate_date,from_currency,to_currency' }
    )
  } catch {
    // non-critical
  }
}

// ── External sources ────────────────────────────────────────────────────────

async function tryHacienda(): Promise<{ sell: number; buy: number; date: string } | null> {
  try {
    const res = await fetch('https://api.hacienda.go.cr/indicadores/tc', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const buy  = Number(data.compra?.valor ?? data.compra ?? 0)
    const sell = Number(data.venta?.valor  ?? data.venta  ?? 0)
    const date = String(data.compra?.fecha ?? data.fecha ?? new Date().toISOString()).slice(0, 10)
    if (sell < RATE_MIN || sell > RATE_MAX) return null
    return { sell, buy, date }
  } catch {
    return null
  }
}

async function tryOpenERAPI(): Promise<{ sell: number; date: string } | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const sell = Number(data?.rates?.CRC ?? 0)
    if (sell < RATE_MIN || sell > RATE_MAX) return null
    const date = data?.time_last_update_utc
      ? new Date(data.time_last_update_utc as string).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
    return { sell, date }
  } catch {
    return null
  }
}

async function tryFrankfurter(): Promise<{ sell: number; date: string } | null> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=CRC', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const sell = Number(data?.rates?.CRC ?? 0)
    if (sell < RATE_MIN || sell > RATE_MAX) return null
    return { sell, date: String(data?.date ?? new Date().toISOString().slice(0, 10)) }
  } catch {
    return null
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

async function fetchFromAPIs(): Promise<ExchangeRate | null> {
  const hacienda = await tryHacienda()
  if (hacienda) {
    persistRate(hacienda.sell, hacienda.buy, hacienda.date, 'Hacienda CR')
    return { buy: hacienda.buy, sell: hacienda.sell, date: hacienda.date, source: 'Hacienda CR' }
  }

  const openER = await tryOpenERAPI()
  if (openER) {
    const buy = +(openER.sell * 0.997).toFixed(2)
    persistRate(openER.sell, buy, openER.date, 'open.er-api.com')
    return { buy, sell: openER.sell, date: openER.date, source: 'open.er-api.com' }
  }

  const frank = await tryFrankfurter()
  if (frank) {
    const buy = +(frank.sell * 0.997).toFixed(2)
    persistRate(frank.sell, buy, frank.date, 'frankfurter.app')
    return { buy, sell: frank.sell, date: frank.date, source: 'frankfurter.app' }
  }

  return null
}

export async function fetchExchangeRate(): Promise<ExchangeRate> {
  // 1. DB-first: if we have a fresh entry (< STALE_HOURS), skip external calls
  const fresh = await getLastCachedRate(STALE_HOURS)
  if (fresh) return fresh

  // 2. Try external sources in order
  const live = await fetchFromAPIs()
  if (live) return live

  // 3. Stale DB cache (any age)
  const stale = await getLastCachedRate(Infinity)
  if (stale) return { ...stale, source: stale.source + ' (caché)' }

  // 4. Hardcoded fallback
  return {
    buy:    FALLBACK_RATE,
    sell:   FALLBACK_RATE,
    date:   new Date().toISOString().slice(0, 10),
    source: 'estimado',
  }
}

// Force a fresh fetch from APIs (used by the daily cron job)
export async function refreshExchangeRate(): Promise<ExchangeRate> {
  const live = await fetchFromAPIs()
  if (live) return live

  // Even if APIs fail, return whatever is in DB (any age)
  const stale = await getLastCachedRate(Infinity)
  if (stale) return stale

  return {
    buy:    FALLBACK_RATE,
    sell:   FALLBACK_RATE,
    date:   new Date().toISOString().slice(0, 10),
    source: 'estimado',
  }
}
