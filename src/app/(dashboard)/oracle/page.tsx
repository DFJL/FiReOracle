import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OracleView } from './OracleView'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { inferCategory, displayCategory, isLoanPayment, SAVINGS_EXPENSE_GROUP } from '../resumen/categoryUtils'

// ── types ──────────────────────────────────────────────────────────────────────

type Tx = {
  date: string | null
  amount: string | number | null
  movement_type: string | null
  expense_group: string | null
  category_code: string | null
  concept: string | null
  vendor: string | null
  is_passive_income: boolean | null
  is_settlement: boolean
  is_survival_expense: boolean | null
}

// ── category resolution (mirrors InteractiveSection logic) ────────────────────

type CatMap = Record<string, string>

function buildVendorCatMap(txs: Tx[]): CatMap {
  const votes: Record<string, Record<string, number>> = {}
  for (const tx of txs) {
    if (!tx.category_code || !tx.vendor) continue
    const k = tx.vendor.toLowerCase().trim()
    if (!k || k === 'na') continue
    if (!votes[k]) votes[k] = {}
    votes[k][tx.category_code] = (votes[k][tx.category_code] ?? 0) + 1
  }
  const map: CatMap = {}
  for (const [v, counts] of Object.entries(votes)) {
    const w = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (w) map[v] = w[0]
  }
  return map
}

function buildConceptCatMap(txs: Tx[]): CatMap {
  const votes: Record<string, Record<string, number>> = {}
  for (const tx of txs) {
    if (!tx.category_code || !tx.concept) continue
    const vendor = (tx.vendor ?? '').toLowerCase().trim()
    if (vendor && vendor !== 'na') continue
    const k = tx.concept.toLowerCase().trim()
    if (!k) continue
    if (!votes[k]) votes[k] = {}
    votes[k][tx.category_code] = (votes[k][tx.category_code] ?? 0) + 1
  }
  const map: CatMap = {}
  for (const [c, counts] of Object.entries(votes)) {
    const w = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (w && w[1] >= 2) map[c] = w[0]
  }
  return map
}

const BUCKET_ONLY = new Set(['SAVINGS', 'INCOME', 'SAVINGS_INVESTMENT', 'PASSIVE_INCOME'])

function resolveDisplayCat(tx: Tx, vMap: CatMap, cMap: CatMap): string {
  if (tx.is_settlement) return 'Liquidaciones'
  if (isLoanPayment(tx.vendor, tx.concept, tx.category_code)) return 'Préstamos'

  const ck = (tx.concept ?? '').toLowerCase().trim()
  const vk = (tx.vendor ?? '').toLowerCase().trim()

  if (tx.category_code && (!tx.is_passive_income || !BUCKET_ONLY.has(tx.category_code))) {
    return displayCategory(tx.category_code)
  }
  if (/^abarrotes/i.test(ck)) return 'Abarrotes'
  if (/^impresion/i.test(ck)) return 'Hogar'
  if (vk && vk !== 'na' && vMap[vk]) return displayCategory(vMap[vk])
  if (ck && (!vk || vk === 'na') && cMap[ck]) return displayCategory(cMap[ck])
  return displayCategory(inferCategory(tx.vendor, tx.concept, tx.is_passive_income ? null : tx.category_code))
}

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

function isValuation(concept: string | null) {
  return /p[eé]rdida\s*valor|aumento\s*valor/i.test(concept ?? '')
}

function isOutflow(tx: Tx) {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (isValuation(tx.concept)) return false
  if (tx.expense_group === SAVINGS_EXPENSE_GROUP) return isLoanPayment(tx.vendor, tx.concept, tx.category_code)
  return true
}

// ── page ──────────────────────────────────────────────────────────────────────

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
    { data: allTxRaw },
    { data: snapshots },
  ] = await Promise.all([
    admin.from('user_financial_config').select('*').eq('user_id', user.id).maybeSingle(),
    // Load ALL transactions for accurate vendor/concept learning maps
    admin.from('transactions')
      .select('date, amount, movement_type, expense_group, category_code, concept, vendor, is_passive_income, is_settlement, is_survival_expense')
      .eq('user_id', user.id)
      .not('amount', 'is', null)
      .not('date', 'is', null),
    admin.from('net_worth_snapshots')
      .select('snapshot_date, net_worth_crc, invested_crc, liquid_crc')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: false })
      .limit(3),
  ])

  const exchangeRate = await fetchExchangeRate()
  const tcSell = exchangeRate?.sell ?? 515

  const allTxs = (allTxRaw ?? []) as Tx[]

  // Build category maps from full history for accurate inference
  const vMap = buildVendorCatMap(allTxs)
  const cMap = buildConceptCatMap(allTxs)

  // Filter to last 12 complete months for metrics
  const all = allTxs.filter(tx => tx.date && tx.date >= cutStr && tx.date < endStr)

  // Classify flows
  const activeIncome  = all.filter(tx => tx.movement_type === 'income' && !tx.is_passive_income && !tx.is_settlement)
  const passiveIncome = all.filter(tx => tx.movement_type === 'income' && !!tx.is_passive_income && !tx.is_settlement)
  const expenses      = all.filter(isOutflow)
  const savings       = all.filter(tx =>
    tx.expense_group === SAVINGS_EXPENSE_GROUP && !tx.is_settlement &&
    (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')
  )

  const sum = (arr: Tx[]) => arr.reduce((s, tx) => s + Number(tx.amount ?? 0), 0)
  const totalActiveIncome  = sum(activeIncome)
  const totalPassiveIncome = sum(passiveIncome)
  const totalIncome        = totalActiveIncome + totalPassiveIncome
  const totalExpenses      = sum(expenses)
  const totalSavings       = sum(savings)
  const avgMonthlyExpenses = totalExpenses / 12
  const savingsRate        = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0
  const netMargin          = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0
  const passiveCoverage    = avgMonthlyExpenses > 0 ? ((totalPassiveIncome / 12) / avgMonthlyExpenses) * 100 : 0

  // Survival vs discretionary
  const survivalExp = sum(all.filter(tx =>
    !!tx.is_survival_expense && (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')
  ))

  // Resolved category breakdown (same logic as Resumen page)
  const catMap: Record<string, number> = {}
  for (const tx of expenses) {
    const cat = resolveDisplayCat(tx, vMap, cMap)
    catMap[cat] = (catMap[cat] ?? 0) + Number(tx.amount ?? 0)
  }
  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, amt]) => ({ name, amt, pct: totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0 }))

  // Passive income breakdown
  const passiveCatMap: Record<string, number> = {}
  for (const tx of passiveIncome) {
    const cat = tx.category_code ? displayCategory(tx.category_code) : (tx.concept ?? 'Rendimientos')
    passiveCatMap[cat] = (passiveCatMap[cat] ?? 0) + Number(tx.amount ?? 0)
  }
  const topPassive = Object.entries(passiveCatMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Savings/investment breakdown — concept-first to avoid vendor-map noise
  function resolveSavingsCat(tx: Tx): string {
    if (tx.category_code && !BUCKET_ONLY.has(tx.category_code)) return displayCategory(tx.category_code)
    // For savings, concept is more reliable than vendor (e.g. "Regimen de pensión voluntaria" on vendor BAC)
    return displayCategory(inferCategory(tx.vendor, tx.concept, null))
  }
  const savingsCatMap: Record<string, number> = {}
  for (const tx of savings) {
    const cat = resolveSavingsCat(tx)
    savingsCatMap[cat] = (savingsCatMap[cat] ?? 0) + Number(tx.amount ?? 0)
  }
  const topSavings = Object.entries(savingsCatMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  // FIRE metrics
  const swr        = fireConfig?.fire_withdrawal_rate   ?? 0.04
  const targetExp  = fireConfig?.fire_target_monthly_exp ?? avgMonthlyExpenses
  const fireNumber = targetExp > 0 ? (targetExp * 12) / swr : 0
  const latestSnap = snapshots?.[0]
  const liquid     = latestSnap ? Number((latestSnap as { liquid_crc?: number | null }).liquid_crc ?? 0) : 0
  const invested   = latestSnap ? Number(latestSnap.invested_crc ?? 0) : 0
  const activosInvertibles = liquid + invested
  const fireProgress = fireNumber > 0 ? (activosInvertibles / fireNumber) * 100 : 0
  const runway       = avgMonthlyExpenses > 0 ? liquid / avgMonthlyExpenses : null

  // Net worth trend
  const nwTrend = (snapshots ?? []).map(s => ({ date: s.snapshot_date, nw: Number(s.net_worth_crc) })).reverse()

  // Build context string
  const monthLabel = `${rolling12Start.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })} — ${new Date(endStr).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })}`
  const usd = (crc: number) => `$${Math.round(crc / tcSell).toLocaleString('en-US')}`

  const context = `PERÍODO: Últimos 12 meses completos (${monthLabel})
TIPO DE CAMBIO: ₡${tcSell.toLocaleString('es-CR')} por USD

── FLUJO DE INGRESOS ──
Ingresos activos (12m):     ${fmtCRC(totalActiveIncome)} (${usd(totalActiveIncome)})
Ingresos pasivos (12m):     ${fmtCRC(totalPassiveIncome)} (${usd(totalPassiveIncome)}) → ${passiveCoverage.toFixed(1)}% de cobertura de gastos
Total ingresos (12m):       ${fmtCRC(totalIncome)} → promedio ${fmtCRC(totalIncome / 12)}/mes

── FLUJO DE GASTOS ──
Gastos totales (12m):       ${fmtCRC(totalExpenses)} → promedio ${fmtCRC(avgMonthlyExpenses)}/mes
  — Supervivencia:          ${fmtCRC(survivalExp)} (${totalExpenses > 0 ? ((survivalExp / totalExpenses) * 100).toFixed(0) : 0}%)
  — Discrecional:           ${fmtCRC(totalExpenses - survivalExp)} (${totalExpenses > 0 ? (((totalExpenses - survivalExp) / totalExpenses) * 100).toFixed(0) : 0}%)
Ahorro / Inversión (12m):   ${fmtCRC(totalSavings)}

── KPIs ──
Tasa de ahorro:             ${savingsRate.toFixed(1)}% ${savingsRate >= 30 ? '✓ excelente' : savingsRate >= 20 ? '~ aceptable' : '⚠ bajo'}
Margen neto:                ${netMargin.toFixed(1)}%
Cobertura pasiva de gastos: ${passiveCoverage.toFixed(1)}% ${passiveCoverage >= 100 ? '✓ FIRE alcanzado' : ''}
Runway líquido:             ${runway !== null ? `${runway.toFixed(1)} meses` : 'n/d'}

── FIRE ──
FIRE Number (SWR ${(swr * 100).toFixed(0)}%): ${fmtCRC(fireNumber)} (${usd(fireNumber)})
Activos invertibles:        ${fmtCRC(activosInvertibles)} (${usd(activosInvertibles)})
  — Liquidez:               ${fmtCRC(liquid)}
  — Inversiones:            ${fmtCRC(invested)}
Progreso FIRE:              ${fireProgress.toFixed(1)}%
${nwTrend.length >= 2 ? `Patrimonio neto reciente: ${nwTrend.map(s => `${s.date}: ${fmtCRC(s.nw)}`).join(' | ')}` : ''}

── TOP CATEGORÍAS DE GASTO (últimos 12m) ──
${topCats.map(c => `${c.name.padEnd(26)} ${fmtCRC(c.amt).padStart(14)}  (${c.pct.toFixed(0)}%)`).join('\n')}

── AHORRO E INVERSIÓN (últimos 12m) ──
${topSavings.map(([k, v]) => `${k.padEnd(26)} ${fmtCRC(v).padStart(14)}  (${totalSavings > 0 ? ((v / totalSavings) * 100).toFixed(0) : 0}%)`).join('\n') || 'Sin aportes registrados'}

── INGRESOS PASIVOS (últimos 12m) ──
${topPassive.map(([k, v]) => `${k.padEnd(26)} ${fmtCRC(v)}`).join('\n') || 'Sin ingresos pasivos registrados'}`

  return (
    <div className="h-[calc(100vh-4rem)] md:h-screen flex flex-col">
      <OracleView context={context} />
    </div>
  )
}
