import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { PresupuestoClient } from './PresupuestoClient'
import { getGroupLabel } from '../resumen/categoryUtils'
import { fetchExchangeRate } from '@/lib/exchange-rate'

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { m } = await searchParams
  const now = new Date()
  const [yearStr, monthStr] = (m ?? '').split('-')
  const year  = parseInt(yearStr)  || now.getFullYear()
  const month = parseInt(monthStr) || (now.getMonth() + 1)

  const admin  = createAdminClient()
  const tcRate = (await fetchExchangeRate()).sell

  const [{ data: budgetRows }, { data: txRows }] = await Promise.all([
    admin
      .from('budgets')
      .select('id, category, monthly_limit, effective_from')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('category'),
    admin
      .from('transactions')
      .select('category_code, amount, currency_code, amount_usd, expense_group')
      .eq('user_id', user.id)
      .in('movement_type', ['expense', 'cash_withdrawal'])
      .eq('year', year)
      .eq('month', month)
      .not('amount', 'is', null),
  ])

  // Aggregate by L1 group, exclude savings and settlements
  const actual: Record<string, number> = {}
  for (const tx of txRows ?? []) {
    if (tx.expense_group === 'objetivos_financieros') continue
    const group = getGroupLabel(tx.category_code ?? 'MISC_EXPENSE')
    const crc = tx.currency_code === 'CRC'
      ? Number(tx.amount ?? 0)
      : Number(tx.amount_usd ?? 0) * tcRate
    actual[group] = (actual[group] ?? 0) + crc
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <PresupuestoClient
        budgets={budgetRows ?? []}
        actual={actual}
        year={year}
        month={month}
      />
    </div>
  )
}
