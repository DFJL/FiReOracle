import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { ReporteView } from './ReporteView'

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export default async function ReportePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // 2. Parse month
  const { month: monthParam } = await searchParams
  let month: string
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    month = monthParam
  } else {
    // Default: last complete month
    // If today >= 5th: current month - 1, else current month - 2
    const today = new Date()
    const lag = today.getDate() >= 5 ? 1 : 2
    const d = new Date(today.getFullYear(), today.getMonth() - lag, 1)
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // 3. Compute date ranges
  const monthStart = `${month}-01`
  const nextMonthStart = addMonths(monthStart, 1)
  const prevMonthStart = addMonths(monthStart, -1)
  const yearAgoStart = addMonths(monthStart, -12)
  const yearAgoEnd = addMonths(yearAgoStart, 1)

  // 4. Fetch in parallel
  const [
    { data: curTx },
    { data: prevTx },
    { data: yearAgoTx },
    { data: snapshots },
    { data: categories },
  ] = await Promise.all([
    admin
      .from('transactions')
      .select('movement_type, amount, category_code, expense_group')
      .eq('user_id', user.id)
      .gte('date', monthStart)
      .lt('date', nextMonthStart)
      .not('amount', 'is', null),
    admin
      .from('transactions')
      .select('movement_type, amount, category_code, expense_group')
      .eq('user_id', user.id)
      .gte('date', prevMonthStart)
      .lt('date', monthStart)
      .not('amount', 'is', null),
    admin
      .from('transactions')
      .select('movement_type, amount, category_code, expense_group')
      .eq('user_id', user.id)
      .gte('date', yearAgoStart)
      .lt('date', yearAgoEnd)
      .not('amount', 'is', null),
    admin
      .from('net_worth_snapshots')
      .select('snapshot_date, net_worth_crc')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true }),
    admin
      .from('transaction_categories')
      .select('code, name, group_gasto'),
  ])

  // 5. Compute aggregations
  function computePeriod(txs: typeof curTx) {
    let income = 0
    let expenses = 0
    for (const tx of txs ?? []) {
      const amt = Number(tx.amount ?? 0)
      if (tx.movement_type === 'income') income += amt
      else if (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal') expenses += amt
    }
    const net = income - expenses
    const savingsRate = income > 0 ? (net / income) * 100 : 0
    return { income, expenses, net, savingsRate }
  }

  const cur = computePeriod(curTx)
  const prev = computePeriod(prevTx)
  const yearAgo = computePeriod(yearAgoTx)

  // Top categories (current month expenses)
  const catMap = new Map<string, number>()
  for (const tx of curTx ?? []) {
    if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') continue
    const code = tx.category_code ?? 'sin_categoria'
    catMap.set(code, (catMap.get(code) ?? 0) + Number(tx.amount ?? 0))
  }

  const categoryNames = new Map<string, string>()
  for (const cat of categories ?? []) {
    categoryNames.set(cat.code, cat.name)
  }

  const sortedCats = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const totalExpForPct = sortedCats.reduce((s, [, v]) => s + v, 0) || 1
  const topCategories = sortedCats.map(([code, amount]) => ({
    code,
    name: categoryNames.get(code) ?? code,
    amount,
    pct: (amount / totalExpForPct) * 100,
  }))

  // Expense by group
  const expenseByGroup: Record<string, number> = {}
  for (const tx of curTx ?? []) {
    if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') continue
    const group = tx.expense_group ?? 'sin_grupo'
    expenseByGroup[group] = (expenseByGroup[group] ?? 0) + Number(tx.amount ?? 0)
  }

  // NW snapshots
  const snapshotMap = new Map<string, number>()
  for (const snap of snapshots ?? []) {
    snapshotMap.set(snap.snapshot_date, Number(snap.net_worth_crc ?? 0))
  }

  const nwStart = snapshotMap.has(monthStart) ? snapshotMap.get(monthStart)! : null
  const nwEnd = snapshotMap.has(nextMonthStart) ? snapshotMap.get(nextMonthStart)! : null
  const nwDelta = nwEnd !== null && nwStart !== null ? nwEnd - nwStart : null
  const nwDeltaPct =
    nwDelta !== null && nwStart !== null && nwStart !== 0
      ? (nwDelta / Math.abs(nwStart)) * 100
      : null

  return (
    <ReporteView
      month={month}
      cur={cur}
      prev={prev}
      yearAgo={yearAgo}
      topCategories={topCategories}
      expenseByGroup={expenseByGroup}
      nwStart={nwStart}
      nwEnd={nwEnd}
      nwDelta={nwDelta}
      nwDeltaPct={nwDeltaPct}
    />
  )
}
