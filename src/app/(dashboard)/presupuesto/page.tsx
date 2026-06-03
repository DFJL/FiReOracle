import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { PresupuestoClient } from './PresupuestoClient'
import { getGroupLabel, displayCategory } from '../resumen/categoryUtils'
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

  // Previous 3 complete months for historical averages
  const prevMonths: [number, number][] = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(year, month - 1 - i, 1)
    prevMonths.push([d.getFullYear(), d.getMonth() + 1])
  }
  const prevYears  = [...new Set(prevMonths.map(([y]) => y))]
  const prevMonthN = prevMonths.map(([, mn]) => mn)

  const [
    { data: budgetRows },
    { data: txRows },
    { data: histRows },
    { data: incomeTxRows },
    { data: catRows },
  ] = await Promise.all([
    admin.from('budgets')
      .select('id, category, monthly_limit, q1_amount, q2_amount, q1_done, q2_done, sort_order, budget_type, effective_from, notes')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order')
      .order('category'),

    // Current month expenses split by day (for Q1/Q2 actuals)
    admin.from('transactions')
      .select('category_code, amount, currency_code, amount_usd, expense_group, day')
      .eq('user_id', user.id)
      .in('movement_type', ['expense', 'cash_withdrawal'])
      .eq('year', year)
      .eq('month', month)
      .not('amount', 'is', null),

    // Last 3 months for historical avg
    admin.from('transactions')
      .select('category_code, amount, currency_code, amount_usd, expense_group, year, month')
      .eq('user_id', user.id)
      .in('movement_type', ['expense', 'cash_withdrawal'])
      .in('year', prevYears)
      .in('month', prevMonthN)
      .not('amount', 'is', null),

    // Actual income for the month
    admin.from('transactions')
      .select('amount, currency_code, amount_usd')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .eq('is_settlement', false)
      .eq('year', year)
      .eq('month', month)
      .not('amount', 'is', null),

    admin.from('transaction_categories')
      .select('code, name')
      .eq('is_active', true)
      .order('name'),
  ])

  function toCRC(tx: { amount: number | null; currency_code: string | null; amount_usd: number | null }) {
    return tx.currency_code === 'CRC'
      ? Number(tx.amount ?? 0)
      : Number(tx.amount_usd ?? 0) * tcRate
  }

  // Actual Q1 (day 1-15) and Q2 (day 16+) by L1 group
  const actualQ1: Record<string, number> = {}
  const actualQ2: Record<string, number> = {}
  for (const tx of txRows ?? []) {
    if (tx.expense_group === 'objetivos_financieros') continue
    const group = getGroupLabel(tx.category_code ?? 'MISC_EXPENSE')
    const crc   = toCRC(tx)
    const day   = tx.day ?? 0
    if (day <= 15) actualQ1[group] = (actualQ1[group] ?? 0) + crc
    else           actualQ2[group] = (actualQ2[group] ?? 0) + crc
  }

  // Historical avg (last 3 months) per L1 group
  const histPerGroupMonth: Record<string, Record<string, number>> = {}
  for (const tx of histRows ?? []) {
    const key = `${tx.year}-${tx.month}`
    if (!prevMonths.some(([py, pm]) => py === tx.year && pm === tx.month)) continue
    if (tx.expense_group === 'objetivos_financieros') continue
    const group = getGroupLabel(tx.category_code ?? 'MISC_EXPENSE')
    if (!histPerGroupMonth[group]) histPerGroupMonth[group] = {}
    histPerGroupMonth[group][key] = (histPerGroupMonth[group][key] ?? 0) + toCRC(tx)
  }
  const history: Record<string, number> = {}
  for (const [group, byMonth] of Object.entries(histPerGroupMonth)) {
    const vals = Object.values(byMonth)
    if (vals.length) history[group] = vals.reduce((a, b) => a + b, 0) / vals.length
  }

  // Actual income
  const incomeActual = (incomeTxRows ?? []).reduce((s, tx) => s + toCRC(tx), 0)

  // Suggestions for combobox (from DB — no hardcoding)
  const suggSet = new Set<string>()
  for (const cat of catRows ?? []) {
    suggSet.add(getGroupLabel(cat.code))
    suggSet.add(displayCategory(cat.code))
    suggSet.add(cat.name)
  }
  const suggestions = [...suggSet].filter(Boolean).sort()

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PresupuestoClient
        budgets={budgetRows ?? []}
        actualQ1={actualQ1}
        actualQ2={actualQ2}
        history={history}
        incomeActual={incomeActual}
        year={year}
        month={month}
        suggestions={suggestions}
      />
    </div>
  )
}
