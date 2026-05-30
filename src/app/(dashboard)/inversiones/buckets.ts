// ── Investment bucket definitions ─────────────────────────────────────────────
// Vendor-based buckets: match by vendor (+ optional conceptPatterns for vendor='NA').
// Concept-based buckets: match purely by exact concept string (any vendor) — mirrors
// the SUMIFS formulas in the Excel sheet.

export interface ConceptAccounting {
  depositConcepts: string[]
  rendimientosConcepts: string[]
  valorizacionConcepts: string[]
  liquidacionConcepts: string[]
}

export interface BucketDef {
  key: string
  name: string
  industry: string
  color: string
  /** Exact vendor names (case-insensitive). Ignored when conceptAccounting is set. */
  vendors: string[]
  /** Optional concept patterns for vendor='NA'/'empty' entries (vendor-based buckets only) */
  conceptPatterns?: RegExp[]
  /** If set, ignores vendor matching entirely and uses pure concept-based accounting */
  conceptAccounting?: ConceptAccounting
}

export interface BucketData extends Omit<BucketDef, 'conceptPatterns' | 'conceptAccounting'> {
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
    vendors: [],
    // Mirrors the Excel SUMIFS formula exactly — no vendor filter
    conceptAccounting: {
      depositConcepts: [
        'Compra Bitcoins',
        'Minería Ethereum Tarjetas gráficas',
      ],
      rendimientosConcepts: [
        'Rendimientos Farming Crypto Monedas',
        'Rendimientos nodos Crypto',
      ],
      valorizacionConcepts: [
        'Aumento de valor Criptomonedas',
      ],
      liquidacionConcepts: [
        'Liquidación Rendimientos Farming Crypto Monedas',
        'Liquidación Rendimientos nodos Crypto',
        'Liquidación Criptomoneda',
      ],
    },
  },
]
