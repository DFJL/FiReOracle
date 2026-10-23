import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { InteractiveSection, TxClient, AccountSummary } from './InteractiveSection'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { computeFlowWindow } from '@/lib/ahorroInversionFlow'
import type { IncomeFlowWindows } from './IncomeFlowSankey'

export default async function ResumenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Transactions — admin client bypasses PostgREST max_rows
  const [{ data: rawTx }, { data: categories }, { data: buckets }, { data: envelopeMovements }, { data: envelopes }] = await Promise.all([
    admin
      .from('transactions')
      .select('id, movement_type, amount, date, vendor, concept, category_code, expense_group, is_settlement, is_passive_income, is_survival_expense, notes, detail, investment_bucket_id, created_at')
      .eq('user_id', user.id)
      .eq('is_receipt_group', false)
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
    // For the Ahorro e Inversión flow card below — same envelope-contribution
    // rule /progreso and /liquidez use (counts_as_ahorro deposits only).
    admin
      .from('envelope_movements')
      .select('amount, movement_type, envelope_id, date, notes')
      .eq('user_id', user.id),
    admin
      .from('savings_envelopes')
      .select('id, name, counts_as_ahorro')
      .eq('user_id', user.id)
      .eq('is_active', true),
  ])

  // Initial account balances — parallel fetch, one query per account
  const { data: accountRows } = await admin
    .from('financial_accounts')
    .select('id, account_type')
    .eq('user_id', user.id)
    .eq('is_active', true)

  let liquidBalance = 0
  let savingsBalance = 0
  if (accountRows?.length) {
    const snaps = await Promise.all(
      accountRows.map(acc =>
        admin.from('account_balance_snapshots')
          .select('real_balance')
          .eq('account_id', acc.id)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => ({ type: acc.account_type, bal: data?.real_balance ? Number(data.real_balance) : 0 }))
      )
    )
    for (const { type, bal } of snaps) {
      if (!bal) continue
      if (type === 'checking' || type === 'cash') liquidBalance += bal
      else savingsBalance += bal
    }
  }

  const accounts: AccountSummary = { liquidBalance, savingsBalance }
  const exchangeRate = await fetchExchangeRate()

  // ── Ahorro e Inversión flow — same classification /progreso's
  // AhorroInversionSection uses (@/lib/ahorroInversionFlow, built on
  // @/lib/incomeAllocation), parametrized across 6 preset windows so the
  // card can switch between them without re-deriving the rules. 3M/6M/12M
  // stay "last N complete months"; "este mes", YTD and "todo" reach into
  // the current partial month.
  const catNameMap = new Map<string, string>()
  for (const cat of categories ?? []) catNameMap.set(cat.code, cat.name)
  const savingsEnvelopeIds = new Set(
    (envelopes ?? []).filter(e => e.counts_as_ahorro === true).map(e => e.id)
  )
  const envelopeNameMap = new Map((envelopes ?? []).map(e => [e.id, e.name ?? 'Sobre']))

  const now = new Date()
  const tomorrowStr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10)
  const thisMonthStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const monthsAgoStartStr = (n: number) => new Date(now.getFullYear(), now.getMonth() - n, 1).toISOString().slice(0, 10)
  const rolling12EndStr = thisMonthStartStr
  const yearStartStr = `${now.getFullYear()}-01-01`
  const earliestTxDate = (rawTx ?? []).reduce<string | null>(
    (min, tx) => (tx.date && (!min || tx.date < min) ? tx.date : min), null
  )

  const flowTxs = (rawTx ?? []) as Parameters<typeof computeFlowWindow>[0]
  const flowMovements = (envelopeMovements ?? []) as Parameters<typeof computeFlowWindow>[1]

  const incomeFlowWindows: IncomeFlowWindows = {
    mes:  computeFlowWindow(flowTxs, flowMovements, savingsEnvelopeIds, envelopeNameMap, catNameMap, thisMonthStartStr, tomorrowStr),
    m3:   computeFlowWindow(flowTxs, flowMovements, savingsEnvelopeIds, envelopeNameMap, catNameMap, monthsAgoStartStr(3), rolling12EndStr),
    m6:   computeFlowWindow(flowTxs, flowMovements, savingsEnvelopeIds, envelopeNameMap, catNameMap, monthsAgoStartStr(6), rolling12EndStr),
    m12:  computeFlowWindow(flowTxs, flowMovements, savingsEnvelopeIds, envelopeNameMap, catNameMap, monthsAgoStartStr(12), rolling12EndStr),
    ytd:  computeFlowWindow(flowTxs, flowMovements, savingsEnvelopeIds, envelopeNameMap, catNameMap, yearStartStr, tomorrowStr),
    todo: computeFlowWindow(flowTxs, flowMovements, savingsEnvelopeIds, envelopeNameMap, catNameMap, earliestTxDate ?? yearStartStr, tomorrowStr),
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <InteractiveSection
        transactions={(rawTx ?? []) as TxClient[]}
        categories={categories ?? []}
        buckets={buckets ?? []}
        accounts={accounts}
        exchangeRate={exchangeRate}
        incomeFlowWindows={incomeFlowWindows}
      />
    </div>
  )
}
