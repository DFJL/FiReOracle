import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { INVESTMENT_BUCKETS, type BucketDef } from './buckets'
import { PortfolioView } from './PortfolioView'

export interface BucketData {
  key: string
  name: string
  industry: string
  color: string
  deposits: number       // cash in (aperturas, compras)
  liquidaciones: number  // cash out (settlements)
  rendimientos: number   // cash returns (intereses, farming liquidados)
  balance: number        // deposits - liquidaciones + rendimientos
  valorizationNet: number // mark-to-market net (informational only, not cash)
}

function matchesBucket(vendor: string, concept: string, def: BucketDef): boolean {
  const v = vendor.toLowerCase().trim()
  const c = concept.toLowerCase().trim()

  const vendorMatch = def.vendors.some(dv => dv.toLowerCase() === v)
  if (vendorMatch) return true

  if (def.conceptPatterns && (v === 'na' || v === '')) {
    return def.conceptPatterns.some(re => re.test(c))
  }
  return false
}

export default async function InversionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: txs } = await admin
    .from('transactions')
    .select('vendor, concept, movement_type, expense_group, is_settlement, is_passive_income, amount')
    .eq('user_id', user.id)
    .not('amount', 'is', null)

  // Liquid balance: initial snapshots for checking+cash accounts
  const { data: accountRows } = await admin
    .from('financial_accounts')
    .select('id, account_type')
    .eq('user_id', user.id)

  let liquidBalance = 0
  if (accountRows) {
    for (const acc of accountRows) {
      if (acc.account_type !== 'checking' && acc.account_type !== 'cash' && acc.account_type !== 'savings') continue
      const { data: snap } = await admin
        .from('account_balance_snapshots')
        .select('real_balance')
        .eq('account_id', acc.id)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (snap?.real_balance) liquidBalance += Number(snap.real_balance)
    }
  }

  // Compute bucket balances from transaction history
  const buckets: BucketData[] = INVESTMENT_BUCKETS.map(def => {
    let deposits = 0, liquidaciones = 0, rendimientos = 0, valorizationNet = 0

    for (const tx of txs ?? []) {
      const vendor = tx.vendor ?? ''
      const concept = tx.concept ?? ''
      if (!matchesBucket(vendor, concept, def)) continue

      const amt = Number(tx.amount ?? 0)

      // Cash-in: expense to objetivos_financieros (not a settlement)
      if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) {
        deposits += amt
      }
      // Cash-out: settlement (liquidación)
      else if (tx.is_settlement) {
        liquidaciones += amt
      }
      // Cash returns: passive income that has movement_type (income) — cash rendimientos
      else if (tx.is_passive_income && tx.movement_type === 'income') {
        rendimientos += amt
      }
      // Mark-to-market: passive income with no movement_type = unrealized gain
      else if (tx.is_passive_income && !tx.movement_type) {
        valorizationNet += amt
      }
      // Mark-to-market: expense with expense_group='na' and no category = unrealized loss
      else if (tx.movement_type === 'expense' && tx.expense_group === 'na' && !tx.is_passive_income) {
        valorizationNet -= amt
      }
    }

    const balance = deposits - liquidaciones + rendimientos

    return { ...def, deposits, liquidaciones, rendimientos, balance, valorizationNet }
  })

  const totalInvested = buckets.reduce((s, b) => s + b.balance, 0)
  const totalPatrimony = totalInvested + liquidBalance

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <PortfolioView
        buckets={buckets}
        liquidBalance={liquidBalance}
        totalInvested={totalInvested}
        totalPatrimony={totalPatrimony}
      />
    </div>
  )
}
