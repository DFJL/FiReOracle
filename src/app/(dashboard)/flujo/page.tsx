import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CashFlowSection, TxRow } from './CashFlowSection'

export default async function FlujoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: rawTx } = await admin
    .from('transactions')
    .select('movement_type, amount, date, expense_group, concept, vendor, category_code, is_settlement, is_passive_income')
    .eq('user_id', user.id)
    .not('amount', 'is', null)
    .not('date', 'is', null)
    .not('movement_type', 'is', null)
    .order('date', { ascending: true })

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <CashFlowSection transactions={(rawTx ?? []) as TxRow[]} />
    </div>
  )
}
