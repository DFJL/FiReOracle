import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { InteractiveSection, TxClient } from './InteractiveSection'

export default async function ResumenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admin client bypasses PostgREST max_rows — needed to get full history
  const { data: rawTx } = await createAdminClient()
    .from('transactions')
    .select('movement_type, amount, date, vendor, concept, category_code, expense_group, is_settlement, is_passive_income, is_survival_expense')
    .eq('user_id', user.id)
    .not('amount', 'is', null)
    .not('date', 'is', null)
    .order('date', { ascending: true })

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight text-white mb-6">Resumen</h1>
      <InteractiveSection transactions={(rawTx ?? []) as TxClient[]} />
    </div>
  )
}
