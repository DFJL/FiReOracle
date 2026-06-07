import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { InteractiveSection, TxClient, AccountSummary } from './InteractiveSection'
import { fetchExchangeRate } from '@/lib/exchange-rate'

export default async function ResumenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Transactions — admin client bypasses PostgREST max_rows
  const [{ data: rawTx }, { data: categories }] = await Promise.all([
    admin
      .from('transactions')
      .select('id, movement_type, amount, date, vendor, concept, category_code, expense_group, is_settlement, is_passive_income, is_survival_expense, notes, investment_bucket_id, created_at')
      .eq('user_id', user.id)
      .not('amount', 'is', null)
      .not('date', 'is', null)
      .order('date', { ascending: true }),
    admin
      .from('transaction_categories')
      .select('code, name, parent_code, category_type, group_gasto, is_passive_income, is_survival_expense, is_settlement')
      .eq('is_active', true)
      .order('sort_order'),
  ])

  // Initial account balances — separate liquid (checking/cash) from savings/investment
  const { data: accountRows } = await admin
    .from('financial_accounts')
    .select('id, account_type')
    .eq('user_id', user.id)
    .eq('is_active', true)

  let liquidBalance = 0
  let savingsBalance = 0
  if (accountRows) {
    for (const acc of accountRows) {
      const { data: snap } = await admin
        .from('account_balance_snapshots')
        .select('real_balance')
        .eq('account_id', acc.id)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!snap?.real_balance) continue
      const bal = Number(snap.real_balance)
      if (acc.account_type === 'checking' || acc.account_type === 'cash') liquidBalance += bal
      else savingsBalance += bal
    }
  }

  const accounts: AccountSummary = { liquidBalance, savingsBalance }
  const exchangeRate = await fetchExchangeRate()

  const { data: fireConfig } = await admin
    .from('user_financial_config')
    .select('preferred_currency, fire_inflation_rate')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <InteractiveSection
        transactions={(rawTx ?? []) as TxClient[]}
        categories={categories ?? []}
        accounts={accounts}
        exchangeRate={exchangeRate}
        defaultCurrency={((fireConfig?.preferred_currency) as 'CRC' | 'USD') ?? 'USD'}
      />
    </div>
  )
}
