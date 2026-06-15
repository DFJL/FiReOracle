import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { PresupuestoClient } from './PresupuestoClient'
import type { Envelope, TxCategory, FinancialAccount } from './PresupuestoClient'
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

  // Last day of the viewed month (for temporal budget filtering)
  const lastDayOfMonth = new Date(year, month, 0).toISOString().slice(0, 10)

  const [
    { data: allBudgetRows },
    { data: txRows },
    { data: histRows },
    { data: incomeTxRows },
    { data: catRows },
    { data: envelopeRows },
    { data: accountRows },
    { data: monthlyDoneRows },
  ] = await Promise.all([
    admin.from('budgets')
      .select('id, category, monthly_limit, q1_amount, q2_amount, q1_done, q2_done, sort_order, budget_type, effective_from, notes, envelope_id, auto_tx_category_code, auto_tx_account_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .lte('effective_from', lastDayOfMonth)
      .order('sort_order')
      .order('category')
      .order('effective_from', { ascending: false }),

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
      .select('category_code, amount, currency_code, amount_usd, expense_group, year, month, day')
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

    admin.from('savings_envelopes')
      .select('id, name, parent_envelope_id, custodio')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),

    admin.from('financial_accounts')
      .select('id, name, account_type')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),

    // Per-month done state + manual actuals
    admin.from('budget_monthly_done')
      .select('category, q1_done, q2_done, q1_actual, q2_actual')
      .eq('user_id', user.id)
      .eq('year', year)
      .eq('month', month),
  ])

  // Dedup: keep only the most recent effective row per category
  // (rows are already sorted effective_from DESC, so first occurrence wins)
  // Done-state priority: monthly_done record > budget-row value (current month only) > false
  // This prevents marks from one month bleeding into other months while keeping the budget-row
  // as a safe fallback for the current month (avoids optimistic-rollback flicker).
  const isCurrentViewMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const seen = new Set<string>()
  const monthlyDoneMap = new Map((monthlyDoneRows ?? []).map(d => [d.category, d]))
  const budgetRows = (allBudgetRows ?? []).filter(b => {
    if (seen.has(b.category)) return false
    seen.add(b.category)
    return true
  }).map(b => {
    const md = monthlyDoneMap.get(b.category)
    const q1_done   = md ? md.q1_done   : (isCurrentViewMonth ? b.q1_done : false)
    const q2_done   = md ? md.q2_done   : (isCurrentViewMonth ? b.q2_done : false)
    const q1_actual = md?.q1_actual ?? null
    const q2_actual = md?.q2_actual ?? null
    return { ...b, q1_done, q2_done, q1_actual, q2_actual }
  })

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

  // Historical avg (last 3 months) per L1 group, split by quincena
  const histQ1PerGroupMonth: Record<string, Record<string, number>> = {}
  const histQ2PerGroupMonth: Record<string, Record<string, number>> = {}
  for (const tx of histRows ?? []) {
    const key = `${tx.year}-${tx.month}`
    if (!prevMonths.some(([py, pm]) => py === tx.year && pm === tx.month)) continue
    if (tx.expense_group === 'objetivos_financieros') continue
    const group = getGroupLabel(tx.category_code ?? 'MISC_EXPENSE')
    const crc = toCRC(tx)
    const day = tx.day ?? 0
    if (day <= 15) {
      if (!histQ1PerGroupMonth[group]) histQ1PerGroupMonth[group] = {}
      histQ1PerGroupMonth[group][key] = (histQ1PerGroupMonth[group][key] ?? 0) + crc
    } else {
      if (!histQ2PerGroupMonth[group]) histQ2PerGroupMonth[group] = {}
      histQ2PerGroupMonth[group][key] = (histQ2PerGroupMonth[group][key] ?? 0) + crc
    }
  }
  const histQ1: Record<string, number> = {}
  const histQ2: Record<string, number> = {}
  for (const [group, byMonth] of Object.entries(histQ1PerGroupMonth)) {
    const vals = Object.values(byMonth)
    if (vals.length) histQ1[group] = vals.reduce((a, b) => a + b, 0) / vals.length
  }
  for (const [group, byMonth] of Object.entries(histQ2PerGroupMonth)) {
    const vals = Object.values(byMonth)
    if (vals.length) histQ2[group] = vals.reduce((a, b) => a + b, 0) / vals.length
  }

  // Single per-quincena historical reference (avg of Q1 avg and Q2 avg)
  const history: Record<string, number> = {}
  for (const group of new Set([...Object.keys(histQ1), ...Object.keys(histQ2)])) {
    const hasQ1 = histQ1[group] !== undefined
    const hasQ2 = histQ2[group] !== undefined
    if (hasQ1 && hasQ2) history[group] = (histQ1[group] + histQ2[group]) / 2
    else if (hasQ1)     history[group] = histQ1[group]
    else                history[group] = histQ2[group]
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
        envelopes={(envelopeRows ?? []) as Envelope[]}
        txCategories={(catRows ?? []) as TxCategory[]}
        accounts={(accountRows ?? []) as FinancialAccount[]}
      />
    </div>
  )
}
