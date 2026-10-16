// Literal TypeScript port of DeFiReTracker's src/utils/pnl.js — pure,
// dependency-free valuation math. DeFiReTracker has no backend of its own
// (Vite SPA), so there's no live endpoint to call into instead; this port is
// the closest thing to a shared source of truth available. If pnl.js ever
// changes, mirror the change here too.

export interface CryptoTx {
  type: string
  qty: number
  price_usd: number
  fee_usd: number | null
  date: string
}

export interface AssetPnl {
  qty: number
  avgCost: number
  costBasis: number
  grossInvested: number
  realizedPnl: number
  unrealizedPnl: number | null
  unrealizedPct: number | null
  currentValue: number | null
  hasPrice: boolean
}

export function computeAssetPnl(transactions: CryptoTx[], currentPrice: number | null): AssetPnl {
  let totalCost = 0
  let totalQty = 0
  let realizedPnl = 0
  let grossInvested = 0

  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  for (const tx of sorted) {
    const qty = Number(tx.qty)
    const price = Number(tx.price_usd)
    const fee = Number(tx.fee_usd ?? 0)

    if (tx.type === 'buy' || tx.type === 'transfer_in' || tx.type === 'earn') {
      totalCost += qty * price + fee
      totalQty += qty
      grossInvested += qty * price + fee
    } else if (tx.type === 'sell' || tx.type === 'transfer_out') {
      const avgCostNow = totalQty > 0 ? totalCost / totalQty : 0
      realizedPnl += (price - avgCostNow) * qty - fee
      totalCost -= avgCostNow * qty
      totalQty -= qty
    }
  }

  const qty = Math.max(0, totalQty)
  const avgCost = qty > 0 ? totalCost / qty : 0
  const currentValue = currentPrice != null ? qty * currentPrice : null
  const unrealizedPnl = currentPrice != null ? (currentPrice - avgCost) * qty : null
  const unrealizedPct = avgCost > 0 && unrealizedPnl != null ? (unrealizedPnl / (avgCost * qty)) * 100 : null

  const costBasis = Math.max(0, totalCost)
  return { qty, avgCost, costBasis, grossInvested, realizedPnl, unrealizedPnl, unrealizedPct, currentValue, hasPrice: currentPrice != null }
}

export interface PortfolioTotals {
  totalValue: number
  totalUnrealized: number
  totalRealized: number
  totalInvested: number
  totalGrossInvested: number
}

export function aggregatePortfolio(assetRows: AssetPnl[]): PortfolioTotals {
  let totalValue = 0, totalUnrealized = 0, totalRealized = 0, totalInvested = 0, totalGrossInvested = 0
  for (const row of assetRows) {
    totalValue += row.currentValue ?? 0
    totalUnrealized += row.unrealizedPnl ?? 0
    totalRealized += row.realizedPnl ?? 0
    totalInvested += row.costBasis ?? 0
    totalGrossInvested += row.grossInvested ?? 0
  }
  return { totalValue, totalUnrealized, totalRealized, totalInvested, totalGrossInvested }
}

// DeFiLlama current-price fetch — same source DeFiReTracker's priceService.js
// uses, called live instead of reading crypto.price_cache so a day nobody
// opens DeFiReTracker doesn't leave this sync on a stale price.
export async function fetchLivePrices(coingeckoIds: string[]): Promise<Record<string, number>> {
  if (coingeckoIds.length === 0) return {}
  const coinKeys = coingeckoIds.map(id => `coingecko:${id}`).join(',')
  const res = await fetch(`https://coins.llama.fi/prices/current/${coinKeys}`, { cache: 'no-store' })
  if (!res.ok) return {}
  const data = await res.json()
  const prices: Record<string, number> = {}
  for (const id of coingeckoIds) {
    const p = data?.coins?.[`coingecko:${id}`]?.price
    if (p != null) prices[id] = p
  }
  return prices
}
