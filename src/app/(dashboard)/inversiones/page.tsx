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
    .eq('is_active', true)

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
      const amt = Number(tx.amount ?? 0)

      if (def.conceptAccounting) {
        // Concept-based bucket (e.g. Crypto): mirrors exact Excel SUMIFS formula
        const c = tx.concept ?? ''
        if (def.conceptAccounting.depositConcepts.includes(c)) {
          deposits += amt
        } else if (def.conceptAccounting.rendimientosConcepts.includes(c)) {
          rendimientos += amt
        } else if (def.conceptAccounting.valorizacionConcepts.includes(c)) {
          passiveValuation += amt
        } else if (def.conceptAccounting.liquidacionConcepts.includes(c)) {
          liquidaciones += amt
        }
      } else {
        // Vendor-based bucket (TRANSCOMER, Dominion)
        const vendor = tx.vendor ?? ''
        const concept = tx.concept ?? ''
        if (!matchesBucket(vendor, concept, def)) continue

        if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) {
          deposits += amt
        } else if (tx.is_settlement) {
          liquidaciones += amt
        } else if (tx.is_passive_income && tx.movement_type === 'income') {
          rendimientos += amt
        } else if (tx.is_passive_income && !tx.movement_type) {
          passiveValuation += amt
        } else if (tx.movement_type === 'expense' && tx.expense_group === 'na' && !tx.is_passive_income) {
          markToMarketLoss += amt
        }
      }
    }

    const balance = deposits + passiveValuation + rendimientos - liquidaciones
    const valorizationNet = passiveValuation - markToMarketLoss

    // Exclude non-serializable fields (RegExp, ConceptAccounting) for client component
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
