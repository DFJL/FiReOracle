import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { InteractiveSection, TxClient, AccountSummary } from './InteractiveSection'
import { LifestyleInflationSection } from './LifestyleInflationSection'
import { fetchExchangeRate } from '@/lib/exchange-rate'

export default async function ResumenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Transactions — admin client bypasses PostgREST max_rows
  const [{ data: rawTx }, { data: categories }, { data: buckets }] = await Promise.all([
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
    admin
      .from('user_investment_buckets')
      .select('id, name')
      .eq('user_id', user.id)
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

  // Lifestyle Inflation: last 12 complete months vs prior 12 months
  const now = new Date()
  const curEnd   = new Date(now.getFullYear(), now.getMonth(), 1)          // start of this month
  const curStart = new Date(now.getFullYear(), now.getMonth() - 12, 1)     // 12m back
  const prvStart = new Date(now.getFullYear(), now.getMonth() - 24, 1)     // 24m back
  const curEndStr   = curEnd.toISOString().slice(0, 10)
  const curStartStr = curStart.toISOString().slice(0, 10)
  const prvStartStr = prvStart.toISOString().slice(0, 10)

  const LIFESTYLE_GROUPS = ['personal', 'necesario', 'na']
  const GROUP_LABELS: Record<string, string> = {
    personal: 'Personal', necesario: 'Necesario', na: 'Sin categoría',
  }

  const curByGroup: Record<string, number> = {}
  const prvByGroup: Record<string, number> = {}

  for (const tx of rawTx ?? []) {
    if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') continue
    if (tx.expense_group === 'objetivos_financieros') continue
    if (!tx.date) continue
    const group = (tx.expense_group as string | null) ?? 'na'
    const amt   = Number(tx.amount ?? 0)
    if (tx.date >= curStartStr && tx.date < curEndStr) {
      curByGroup[group] = (curByGroup[group] ?? 0) + amt
    } else if (tx.date >= prvStartStr && tx.date < curStartStr) {
      prvByGroup[group] = (prvByGroup[group] ?? 0) + amt
    }
  }

  const lifestyleGroups = LIFESTYLE_GROUPS
    .filter(g => (curByGroup[g] ?? 0) > 0 || (prvByGroup[g] ?? 0) > 0)
    .map(g => {
      const cur = curByGroup[g] ?? 0
      const prv = prvByGroup[g] ?? 0
      return {
        group: g,
        label: GROUP_LABELS[g] ?? g,
        cur,
        prv,
        pctChange: prv > 0 ? (cur - prv) / prv : null,
      }
    })

  const totalCur = lifestyleGroups.reduce((s, g) => s + g.cur, 0)
  const totalPrv = lifestyleGroups.reduce((s, g) => s + g.prv, 0)
  const inflationRate = (fireConfig?.fire_inflation_rate as number | null) ?? 0.04

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <InteractiveSection
        transactions={(rawTx ?? []) as TxClient[]}
        categories={categories ?? []}
        buckets={buckets ?? []}
        accounts={accounts}
        exchangeRate={exchangeRate}
        defaultCurrency={(fireConfig?.preferred_currency as 'CRC' | 'USD') ?? 'USD'}
      />
      <LifestyleInflationSection
        inflationRate={inflationRate}
        totalCur={totalCur}
        totalPrv={totalPrv}
        byGroup={lifestyleGroups}
      />
    </div>
  )
}
