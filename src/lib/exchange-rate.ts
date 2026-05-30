export interface ExchangeRate {
  buy: number
  sell: number
  date: string
  source: string
}

const FALLBACK_RATE = 515 // approximate fallback if API fails

// Hacienda CR official exchange rate — no auth required
// https://api.hacienda.go.cr/indicadores/tc
export async function fetchExchangeRate(): Promise<ExchangeRate> {
  try {
    const res = await fetch('https://api.hacienda.go.cr/indicadores/tc', {
      next: { revalidate: 3600 }, // cache 1 hour
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return {
      buy:    Number(data.compra?.valor ?? FALLBACK_RATE),
      sell:   Number(data.venta?.valor  ?? FALLBACK_RATE),
      date:   (data.compra?.fecha ?? new Date().toISOString()).slice(0, 10),
      source: 'Hacienda CR',
    }
  } catch {
    return { buy: FALLBACK_RATE, sell: FALLBACK_RATE, date: new Date().toISOString().slice(0, 10), source: 'estimado' }
  }
}
