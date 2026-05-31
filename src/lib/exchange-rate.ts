import { createAdminClient } from '@/lib/supabase/admin'

export interface ExchangeRate {
  buy: number
  sell: number
  date: string
  source: string
}

const FALLBACK_RATE = 455   // CRC/USD — actualizado mayo 2026 (era 515)
const RATE_MIN = 300        // guardia: rechaza valores fuera de rango realista
const RATE_MAX = 700

async function getLastCachedRate(): Promise<ExchangeRate | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('exchange_rates')
      .select('rate, rate_date, source')
      .eq('from_currency', 'USD')
      .eq('to_currency', 'CRC')
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    const r = Number(data.rate)
    return {
      buy:  +(r * 0.997).toFixed(2),
      sell: r,
      date: String(data.rate_date),
      source: `${data.source ?? 'caché'} (último conocido)`,
    }
  } catch {
    return null
  }
}

async function persistRate(sell: number, buy: number, date: string, source: string) {
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

// Hacienda CR — https://api.hacienda.go.cr/indicadores/tc
export async function fetchExchangeRate(): Promise<ExchangeRate> {
  try {
    const res = await fetch('https://api.hacienda.go.cr/indicadores/tc', {
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    const buy  = Number(data.compra?.valor ?? data.compra ?? 0)
    const sell = Number(data.venta?.valor  ?? data.venta  ?? 0)
    const date = String(data.compra?.fecha ?? data.fecha ?? new Date().toISOString()).slice(0, 10)

    if (isNaN(sell) || sell < RATE_MIN || sell > RATE_MAX) {
      throw new Error(`Tasa fuera de rango: ${sell}`)
    }

    persistRate(sell, buy, date, 'Hacienda CR')
    return { buy, sell, date, source: 'Hacienda CR' }
  } catch {
    const cached = await getLastCachedRate()
    if (cached) return cached
    return {
      buy: FALLBACK_RATE,
      sell: FALLBACK_RATE,
      date: new Date().toISOString().slice(0, 10),
      source: 'estimado',
    }
  }
}
