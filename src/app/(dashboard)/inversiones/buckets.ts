// ── Investment bucket definitions ─────────────────────────────────────────────
// Add new buckets or vendors here — no other code changes needed.
// Formula per bucket:
//   balance = deposits + passiveValuation + rendimientos - liquidaciones
//   valorizationNet = passiveValuation - markToMarketLoss  (display only, not in balance)

export interface BucketDef {
  key: string
  name: string
  industry: string
  color: string
  /** Exact vendor names (case-insensitive match) */
  vendors: string[]
  /** Optional concept patterns — matched regardless of vendor */
  conceptPatterns?: RegExp[]
}

export interface BucketData extends Omit<BucketDef, 'conceptPatterns'> {
  deposits: number
  liquidaciones: number
  rendimientos: number
  passiveValuation: number
  markToMarketLoss: number
  balance: number
  valorizationNet: number
}

export const INVESTMENT_BUCKETS: BucketDef[] = [
  {
    key: 'transcomer',
    name: 'TRANSCOMER',
    industry: 'Bienes Raíces',
    color: '#f59e0b',
    vendors: ['TRANSCOMER'],
  },
  {
    key: 'dominion',
    name: 'Dominion',
    industry: 'Bolsa',
    color: '#3b82f6',
    vendors: ['Dominion'],
  },
  {
    key: 'crypto',
    name: 'Crypto / DeFi',
    industry: 'Criptomonedas',
    color: '#a855f7',
    vendors: [
      'Binance', 'Bull Bitcoin', 'ArbiRoul', 'Bitcoin Jungle', 'El Dorado',
      'Celestia', 'Meteora', 'Debank',
    ],
    conceptPatterns: [/^(compra|hodl)\s*(bitcoin|cripto|btc|eth)/i],
  },
]
