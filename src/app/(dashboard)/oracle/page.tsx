import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OracleView } from './OracleView'
import { fetchExchangeRate } from '@/lib/exchange-rate'

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

function isValuation(concept: string | null) {
  return /p[eé]rdida\s*valor|aumento\s*valor/i.test(concept ?? '')
}

export default async function OraclePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const rolling12Start = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const cutStr = rolling12Start.toISOString().slice(0, 10)
  const endStr = currentMonthStart.toISOString().slice(0, 10)

  const [
    { data: fireConfig },
    { data: txs },
    { data: snapshots },
  ] = await Promise.all([
    admin.from('user_financial_config').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('transactions')
      .select('date, amount, movement_type, expense_group, category_code, concept, vendor, is_passive_income, is_settlement, is_survival_expense')
      .eq('user_id', user.id)
      .not('amount', 'is', null)
      .gte('date', cutStr)
      .lt('date', endStr),
    admin.from('net_worth_snapshots')
      .select('snapshot_date, net_worth_crc, invested_crc, liquid_crc')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: false })
      .limit(3),
  ])

  const exchangeRate = await fetchExchangeRate()
  const tcSell = exchangeRate?.sell ?? 515

  const all = txs ?? []

  // Income
  const activeIncome = all.filter(tx => tx.movement_type === 'income' && !tx.is_passive_income && !tx.is_settlement)
  const passiveIncome = all.filter(tx => tx.movement_type === 'income' && !!tx.is_passive_income && !tx.is_settlement)
  const expenses = all.filter(tx =>
    (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal') &&
    tx.expense_group !== 'objetivos_financieros' &&
    !isValuation(tx.concept)
  )
  const savings = all.filter(tx =>
    tx.expense_group === 'objetivos_financieros' &&
    !tx.is_settlement &&
    (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')
  )

  const sum = (arr: typeof all) => arr.reduce((s, tx) => s + Number(tx.amount ?? 0), 0)
  const totalActiveIncome = sum(activeIncome)
  const totalPassiveIncome = sum(passiveIncome)
  const totalIncome = totalActiveIncome + totalPassiveIncome
  const totalExpenses = sum(expenses)
  const totalSavings = sum(savings)
  const avgMonthlyIncome   = totalIncome / 12
  const avgMonthlyExpenses = totalExpenses / 12
  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0
  const netMargin   = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0

  // Category breakdown
  const catMap: Record<string, number> = {}
  for (const tx of expenses) {
    const cat = tx.category_code ?? 'Otros'
    catMap[cat] = (catMap[cat] ?? 0) + Number(tx.amount ?? 0)
  }
  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([code, amt]) => ({ code, amt, pct: totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0 }))

  const passiveCatMap: Record<string, number> = {}
  for (const tx of passiveIncome) {
    const cat = tx.category_code ?? tx.concept ?? 'Rendimientos'
    passiveCatMap[cat] = (passiveCatMap[cat] ?? 0) + Number(tx.amount ?? 0)
  }
  const topPassive = Object.entries(passiveCatMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Survival vs discretionary
  const survivalExp = sum(all.filter(tx => !!tx.is_survival_expense &&
    (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')))

  // FIRE metrics
  const swr = fireConfig?.fire_withdrawal_rate ?? 0.04
  const targetExp = fireConfig?.fire_target_monthly_exp ?? avgMonthlyExpenses
  const fireNumber = targetExp > 0 ? (targetExp * 12) / swr : 0
  const latestSnap = snapshots?.[0]
  const activosInvertibles = latestSnap ? Number(latestSnap.invested_crc ?? 0) + Number((latestSnap as { liquid_crc?: number | null }).liquid_crc ?? 0) : 0
  const fireProgress = fireNumber > 0 ? (activosInvertibles / fireNumber) * 100 : 0
  const runway = avgMonthlyExpenses > 0 && latestSnap
    ? Number((latestSnap as { liquid_crc?: number | null }).liquid_crc ?? 0) / avgMonthlyExpenses
    : null

  const passiveCoverage = avgMonthlyExpenses > 0 ? ((totalPassiveIncome / 12) / avgMonthlyExpenses) * 100 : 0

  // Net worth trend
  const nwTrend = (snapshots ?? []).map(s => ({
    date: s.snapshot_date,
    nw: Number(s.net_worth_crc),
  })).reverse()

  // Build context string for Claude
  const monthLabel = `${rolling12Start.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })} — ${new Date(endStr).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })}`
  const usd = (crc: number) => `$${Math.round(crc / tcSell).toLocaleString('en-US')}`

  const context = `PERÍODO: Últimos 12 meses completos (${monthLabel})
TIPO DE CAMBIO: ₡${tcSell.toLocaleString('es-CR')} por USD

── FLUJO DE INGRESOS ──
Ingresos activos (12m):     ${fmtCRC(totalActiveIncome)} (${usd(totalActiveIncome)}) → promedio ${fmtCRC(avgMonthlyIncome / (totalIncome > 0 ? totalIncome / totalActiveIncome : 1))}/mes
Ingresos pasivos (12m):     ${fmtCRC(totalPassiveIncome)} (${usd(totalPassiveIncome)}) → ${passiveCoverage.toFixed(1)}% de cobertura de gastos
Total ingresos (12m):       ${fmtCRC(totalIncome)}

── FLUJO DE GASTOS ──
Gastos totales (12m):       ${fmtCRC(totalExpenses)} → promedio ${fmtCRC(avgMonthlyExpenses)}/mes
  — Supervivencia:          ${fmtCRC(survivalExp)} (${totalExpenses > 0 ? ((survivalExp / totalExpenses) * 100).toFixed(0) : 0}%)
  — Discrecional:           ${fmtCRC(totalExpenses - survivalExp)} (${totalExpenses > 0 ? (((totalExpenses - survivalExp) / totalExpenses) * 100).toFixed(0) : 0}%)
Ahorro / Inversión (12m):   ${fmtCRC(totalSavings)}

── KPIs ──
Tasa de ahorro:             ${savingsRate.toFixed(1)}% ${savingsRate >= 30 ? '✓ excelente' : savingsRate >= 20 ? '~ aceptable' : '⚠ bajo'}
Margen neto:                ${netMargin.toFixed(1)}%
Cobertura de gastos pasiva: ${passiveCoverage.toFixed(1)}% ${passiveCoverage >= 100 ? '✓ FIRE alcanzado' : ''}
Runway líquido:             ${runway !== null ? `${runway.toFixed(1)} meses` : 'n/d'}

── FIRE ──
FIRE Number (${(swr * 100).toFixed(0)}% SWR): ${fmtCRC(fireNumber)} (${usd(fireNumber)})
Activos invertibles:        ${fmtCRC(activosInvertibles)} (${usd(activosInvertibles)})
Progreso FIRE:              ${fireProgress.toFixed(1)}%
${nwTrend.length >= 2 ? `Patrimonio neto reciente: ${nwTrend.map(s => `${s.date}: ${fmtCRC(s.nw)}`).join(' | ')}` : ''}

── TOP CATEGORÍAS DE GASTO ──
${topCats.map(c => `${c.code.padEnd(24)} ${fmtCRC(c.amt).padStart(16)}  (${c.pct.toFixed(0)}%)`).join('\n')}

── INGRESOS PASIVOS ──
${topPassive.map(([k, v]) => `${k.padEnd(24)} ${fmtCRC(v)}`).join('\n') || 'Sin ingresos pasivos registrados'}`

  return (
    <div className="h-[calc(100vh-4rem)] md:h-screen flex flex-col">
      <OracleView context={context} />
    </div>
  )
}
