import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeBucketTotals, type BucketConceptMap } from '@/lib/bucketBalance'
import { TransactionEntryFAB } from './TransactionEntryFAB'

export async function TransactionEntryWrapper() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  const [{ data: envelopes }, { data: categories }, { data: bucketRows }, { data: loans }, { data: mortgageLoans }] = await Promise.all([
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
      .select('id, name, bucket_type, concept_map, baseline_date, baseline_value_crc')
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
      .select('id, name, lender, currency_code, current_balance, interest_rate')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name'),
  ])

  // Buckets that support "saldo actual" entry (value-adjustment via concept
  // text, e.g. ROP & FCL, Pensión Voluntaria) need their live balance here so
  // the FAB can infer the delta instead of making the user compute it.
  const valorizacionBuckets = (bucketRows ?? []).filter(b =>
    b.bucket_type === 'concept_based' &&
    ((b.concept_map as unknown as BucketConceptMap | null)?.valorizacionConcepts?.length ?? 0) > 0
  )
  const valorizacionBucketIds = valorizacionBuckets.map(b => b.id)

  const { data: valorizacionTxs } = valorizacionBucketIds.length > 0
    ? await admin
        .from('transactions')
        .select('date, amount, concept, vendor, category_code, movement_type, expense_group, is_settlement, is_passive_income, investment_bucket_id')
        .eq('user_id', user.id)
        .in('investment_bucket_id', valorizacionBucketIds)
    : { data: [] as { date: string | null; amount: number | null; concept: string | null; vendor: string | null; category_code: string | null; movement_type: string | null; expense_group: string | null; is_settlement: boolean | null; is_passive_income: boolean | null; investment_bucket_id: string | null }[] }

  const buckets = (bucketRows ?? []).map(b => {
    const cm = b.concept_map as unknown as BucketConceptMap | null
    const isValorizacion = valorizacionBucketIds.includes(b.id)
    if (!isValorizacion) return { id: b.id, name: b.name }
    const totals = computeBucketTotals(
      { id: b.id, name: b.name, bucket_type: b.bucket_type, vendors: null, concept_map: cm, baseline_date: b.baseline_date, baseline_value_crc: b.baseline_value_crc },
      (valorizacionTxs ?? []).filter(t => t.investment_bucket_id === b.id)
    )
    return {
      id: b.id,
      name: b.name,
      currentBalance: totals.balance,
      valorizacionConcept: cm?.valorizacionConcepts?.[0],
    }
  })

  return (
    <TransactionEntryFAB
      envelopes={envelopes ?? []}
      categories={categories ?? []}
      buckets={buckets}
      loans={loans ?? []}
      mortgageLoans={mortgageLoans ?? []}
    />
  )
}
