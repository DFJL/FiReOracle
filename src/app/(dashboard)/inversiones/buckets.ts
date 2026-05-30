// ── Investment bucket definitions ─────────────────────────────────────────────
// Add new buckets or vendors here — no other code changes needed.
// Formula per bucket (cash-based, excludes mark-to-market valuations):
//   balance = deposits - liquidaciones + rendimientos_cash

export interface BucketDef {
  key: string
  name: string
  industry: string
  color: string
  /** Exact vendor names (case-insensitive match) */
  vendors: string[]
  /** Optional concept patterns for transactions with vendor='NA' or 'na' */
  conceptPatterns?: RegExp[]
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
  {
    key: 'bac_pension',
    name: 'Pensión Voluntaria',
    industry: 'Pensión',
    color: '#10b981',
    vendors: ['BAC'],
    conceptPatterns: [/regimen de pensi[oó]n voluntaria/i],
  },
]
