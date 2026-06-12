export interface BucketData {
  key: string
  name: string
  industry: string
  color: string
  vendors: string[]
  deposits: number
  liquidaciones: number
  rendimientos: number
  passiveValuation: number
  markToMarketLoss: number
  balance: number
  valorizationNet: number
}

export type BucketTxType = 'deposit' | 'liquidacion' | 'rendimiento' | 'valorizacion' | 'perdida'

export interface BucketTx {
  id: string
  date: string
  amount: number
  concept: string | null
  vendor: string | null
  tx_type: BucketTxType
}
