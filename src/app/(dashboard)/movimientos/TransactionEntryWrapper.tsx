import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TransactionEntryFAB } from './TransactionEntryFAB'

export async function TransactionEntryWrapper() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  const [{ data: envelopes }, { data: categories }, { data: buckets }, { data: loans }, { data: mortgageLoans }] = await Promise.all([
    admin
      .from('savings_envelopes')
      .select('id, name, custodio, parent_envelope_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
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
      .order('name'),
    admin
      .from('self_loans')
      .select('id, description, original_amount, amount_repaid, status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'partial'])
      .order('loan_date', { ascending: false }),
    admin
      .from('loans')
      .select('id, name, lender, currency_code, current_balance')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name'),
  ])

  return (
    <TransactionEntryFAB
      envelopes={envelopes ?? []}
      categories={categories ?? []}
      buckets={buckets ?? []}
      loans={loans ?? []}
      mortgageLoans={mortgageLoans ?? []}
    />
  )
}
