import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { INVESTMENT_BUCKETS, type BucketDef, type BucketData } from './buckets'
import { PortfolioView } from './PortfolioView'
import { fetchExchangeRate } from '@/lib/exchange-rate'

function matchesBucket(vendor: string, concept: string, def: BucketDef): boolean {
  const v = vendor.toLowerCase().trim()
  const c = concept.toLowerCase().trim()

  if (def.vendors.some(dv => dv.toLowerCase() === v)) return true
  if (def.conceptPatterns?.some(re => re.test(c))) return true
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
    let deposits = 0, liquidaciones = 0, rendimientos = 0, passiveValuation = 0, markToMarketLoss = 0

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
      // Cash rendimientos: passive income with real movement_type (hit a bank account)
      else if (tx.is_passive_income && tx.movement_type === 'income') {
        rendimientos += amt
      }
      // NAV appreciation: passive income with NULL movement_type (stays in vehicle)
      else if (tx.is_passive_income && !tx.movement_type) {
        passiveValuation += amt
      }
      // Unrealized loss: expense, expense_group='na', not passive income
      else if (tx.movement_type === 'expense' && tx.expense_group === 'na' && !tx.is_passive_income) {
        markToMarketLoss += amt
      }
    }

    const balance = deposits + passiveValuation + rendimientos - liquidaciones
    const valorizationNet = passiveValuation - markToMarketLoss

    // Exclude conceptPatterns (RegExp) — not serializable for client components
    return {
      key: def.key, name: def.name, industry: def.industry,
      color: def.color, vendors: def.vendors,
      deposits, liquidaciones, rendimientos, passiveValuation, markToMarketLoss, balance, valorizationNet,
    }
  })

  const totalInvested = buckets.reduce((s, b) => s + b.balance, 0)
  const totalPatrimony = totalInvested + liquidBalance
  const exchangeRate = await fetchExchangeRate()

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <PortfolioView
        buckets={buckets}
        liquidBalance={liquidBalance}
        totalInvested={totalInvested}
        totalPatrimony={totalPatrimony}
        exchangeRate={exchangeRate}
      />
    </div>
  )
}
