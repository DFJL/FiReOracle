import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OracleView } from './OracleView'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { inferCategory, displayCategory, isLoanPayment, SAVINGS_EXPENSE_GROUP } from '../resumen/categoryUtils'

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
  if (tx.category_code && (!tx.is_passive_income || !BUCKET_ONLY.has(tx.category_code))) return displayCategory(tx.category_code)
  if (/^abarrotes/i.test(ck)) return 'Abarrotes'
  if (/^impresion/i.test(ck)) return 'Hogar'
  if (vk && vk !== 'na' && vMap[vk]) return displayCategory(vMap[vk])
  if (ck && (!vk || vk === 'na') && cMap[ck]) return displayCategory(cMap[ck])
  return displayCategory(inferCategory(tx.vendor, tx.concept, tx.is_passive_income ? null : tx.category_code))
}

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

function isValuation(concept: string | null) {
  return /p[eé]rdida\s*valor|aumento\s*valor|valorizaci[oó]n/i.test(concept ?? '')
}

function isOutflow(tx: Tx) {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (isValuation(tx.concept)) return false
  if (tx.expense_group === SAVINGS_EXPENSE_GROUP) return isLoanPayment(tx.vendor, tx.concept, tx.category_code)
  return true
}

// Lifestyle expenses only — excludes savings, investments, loan payments and valuations.
// Matches progreso's LifestyleTrendSection logic for YoY inflation comparison.
function isLifestyleOutflow(tx: Tx) {
  if (tx.movement_type !== 'expense' && tx.movement_type !== 'cash_withdrawal') return false
  if (isValuation(tx.concept)) return false
  if (tx.expense_group === SAVINGS_EXPENSE_GROUP) return false  // no savings/investments
  if (isLoanPayment(tx.vendor, tx.concept, tx.category_code)) return false  // no cuotas/amortizaciones
  return true
}

const sum = (arr: Tx[]) => arr.reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

export default async function OraclePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const rolling12Start    = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const prevYearStart     = new Date(now.getFullYear(), now.getMonth() - 24, 1)
  const cutStr   = rolling12Start.toISOString().slice(0, 10)
  const endStr   = currentMonthStart.toISOString().slice(0, 10)
  const prevCut  = prevYearStart.toISOString().slice(0, 10)
  const days60   = new Date(now.getTime() - 60 * 86400000).toISOString().slice(0, 10)

  const [
    { data: fireConfig },
    { data: allTxRaw },
    { data: snapshots },
    { data: loansRaw },
    { data: assetsRaw },
    { data: liabilitiesRaw },
    { data: bucketsRaw },
    { data: envelopesRaw },
    { data: movementsRaw },
    { data: loanPaymentsRaw },
  ] = await Promise.all([
    admin.from('user_financial_config').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('transactions')
      .select('date, amount, movement_type, expense_group, category_code, concept, vendor, is_passive_income, is_settlement, is_survival_expense')
      .eq('user_id', user.id)
      .not('amount', 'is', null)
      .not('date', 'is', null)
      .gte('date', prevCut),       // 24m for YoY comparison
    admin.from('net_worth_snapshots')
      .select('snapshot_date, net_worth_crc, invested_crc, liquid_crc, liabilities_crc')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true }),
    admin.from('loans')
      .select('id, name, lender, loan_type, currency_code, current_balance, interest_rate, end_date')
      .eq('user_id', user.id).eq('is_active', true).order('sort_order'),
    admin.from('assets')
      .select('name, asset_type, value_crc, is_investable')
      .eq('user_id', user.id).eq('is_active', true).order('sort_order'),
    admin.from('liabilities')
      .select('name, liability_type, current_balance, interest_rate')
      .eq('user_id', user.id).eq('is_active', true),
    admin.from('user_investment_buckets')
      .select('id, name, bucket_type, vendors, concept_map, account_id')
      .eq('user_id', user.id).eq('is_active', true),
    admin.from('savings_envelopes')
      .select('id, name, parent_envelope_id')
      .eq('user_id', user.id).eq('is_active', true),
    admin.from('envelope_movements')
      .select('amount, movement_type, envelope_id, date')
      .eq('user_id', user.id),
    admin.from('loan_payments')
      .select('loan_id, payment_type, amount, payment_date')
      .eq('user_id', user.id)
      .gte('payment_date', cutStr)
      .lt('payment_date', endStr),
  ])

  const exchangeRate = await fetchExchangeRate()
  const tcSell = exchangeRate?.sell ?? 515
  const usd = (crc: number) => `$${Math.round(crc / tcSell).toLocaleString('en-US')}`

  const allTxs = (allTxRaw ?? []) as Tx[]
  const vMap   = buildVendorCatMap(allTxs)
  const cMap   = buildConceptCatMap(allTxs)

  // Current 12m window
  const cur12  = allTxs.filter(tx => tx.date && tx.date >= cutStr && tx.date < endStr)
  // Prior 12m window (for YoY)
  const prev12 = allTxs.filter(tx => tx.date && tx.date >= prevCut && tx.date < cutStr)
  // Last 60 days (current month included)
  const recent = allTxs.filter(tx => tx.date && tx.date >= days60).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  // ── KPI helpers ────────────────────────────────────────────────────────────
  function kpis(txs: Tx[]) {
    // Active income: includes settlements (matches progreso formula exactly)
    const activeIncome  = txs.filter(tx => tx.movement_type === 'income' && !tx.is_passive_income)
    const passiveIncome = txs.filter(tx => tx.movement_type === 'income' && !!tx.is_passive_income && !tx.is_settlement)
    const expenses      = txs.filter(isOutflow)
    // Savings: must be SAVINGS_* code, no settlements, no valuations (matches progreso exactly)
    const savings       = txs.filter(tx =>
      (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal') &&
      tx.expense_group === SAVINGS_EXPENSE_GROUP &&
      !tx.is_settlement &&
      (tx.category_code ?? '').startsWith('SAVINGS_') &&
      !/p[eé]rdida\s*valor|aumento\s*valor|valorizaci[oó]n/i.test(tx.concept ?? '')
    )
    const totalActiveIncome  = sum(activeIncome)
    const totalPassiveIncome = sum(passiveIncome)
    const totalIncome        = totalActiveIncome + totalPassiveIncome
    const totalExpenses      = sum(expenses)
    const totalSavings       = sum(savings)
    const survivalExp = sum(txs.filter(tx => !!tx.is_survival_expense && isOutflow(tx)))
    return { totalActiveIncome, totalPassiveIncome, totalIncome, totalExpenses, totalSavings, survivalExp, expenses, passiveIncome, savings }
  }

  const c = kpis(cur12)
  const p = kpis(prev12)

  // Lifestyle expenses (no préstamos, no inversiones) — matches progreso inflation calc
  const lifestyleCur  = sum(cur12.filter(isLifestyleOutflow))
  const lifestylePrev = sum(prev12.filter(isLifestyleOutflow))
  const loanPaymentsCur  = sum(cur12.filter(tx => isLoanPayment(tx.vendor, tx.concept, tx.category_code) && (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')))
  const loanPaymentsPrev = sum(prev12.filter(tx => isLoanPayment(tx.vendor, tx.concept, tx.category_code) && (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')))

  const avgMonthlyExpenses   = c.totalExpenses / 12
  const avgLifestyleExpenses = lifestyleCur / 12
  // Survival split — lifestyle only (loan payments excluded, they're equity building)
  const survivalLifestyle = sum(cur12.filter(tx => !!tx.is_survival_expense && isLifestyleOutflow(tx)))
  // Savings rate denominator = active income only (matches progreso formula exactly)
  const savingsRate     = c.totalActiveIncome > 0 ? (c.totalSavings / c.totalActiveIncome) * 100 : 0
  // Net margin: income not consumed by lifestyle (loans build equity, not consumed)
  const netMargin       = c.totalIncome > 0 ? ((c.totalIncome - lifestyleCur) / c.totalIncome) * 100 : 0
  const passiveCoverage = avgLifestyleExpenses > 0 ? ((c.totalPassiveIncome / 12) / avgLifestyleExpenses) * 100 : 0

  // ── Monthly breakdown (current 12m) ────────────────────────────────────────
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)
    months.push(d.toISOString().slice(0, 7))
  }

  const monthlyRows = months.map(m => {
    const mTxs     = cur12.filter(tx => tx.date?.startsWith(m))
    const k         = kpis(mTxs)
    const lifestyle = sum(mTxs.filter(isLifestyleOutflow))
    const loans     = sum(mTxs.filter(tx => isLoanPayment(tx.vendor, tx.concept, tx.category_code) && (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')))
    return { m, inc: k.totalIncome, lifestyle, loans, sav: k.totalSavings, net: k.totalIncome - k.totalExpenses }
  })

  // ── Top vendors by lifestyle spend (loans excluded — shown separately) ───────
  const lifestyleTxs = cur12.filter(isLifestyleOutflow)
  const vendorSpend: Record<string, number> = {}
  for (const tx of lifestyleTxs) {
    const v = (tx.vendor ?? tx.concept ?? 'Desconocido').trim()
    if (!v || v.toLowerCase() === 'na') continue
    vendorSpend[v] = (vendorSpend[v] ?? 0) + Number(tx.amount ?? 0)
  }
  const topVendors = Object.entries(vendorSpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)

  // ── Top categories (lifestyle only) ────────────────────────────────────────
  const catSpend: Record<string, number> = {}
  for (const tx of lifestyleTxs) {
    const cat = resolveDisplayCat(tx, vMap, cMap)
    catSpend[cat] = (catSpend[cat] ?? 0) + Number(tx.amount ?? 0)
  }
  const topCats = Object.entries(catSpend).sort((a, b) => b[1] - a[1]).slice(0, 12)

  // ── Passive income breakdown ────────────────────────────────────────────────
  const passiveCatMap: Record<string, number> = {}
  for (const tx of c.passiveIncome) {
    const cat = tx.category_code ? displayCategory(tx.category_code) : (tx.concept ?? 'Rendimientos')
    passiveCatMap[cat] = (passiveCatMap[cat] ?? 0) + Number(tx.amount ?? 0)
  }

  // ── Savings breakdown ───────────────────────────────────────────────────────
  const savingsBreakdown: Record<string, number> = {}
  for (const tx of c.savings) {
    const cat = tx.category_code && !BUCKET_ONLY.has(tx.category_code)
      ? displayCategory(tx.category_code)
      : displayCategory(inferCategory(tx.vendor, tx.concept, null))
    savingsBreakdown[cat] = (savingsBreakdown[cat] ?? 0) + Number(tx.amount ?? 0)
  }

  // ── FIRE metrics ──────────────────────────────────────────────────────────
  const swr        = fireConfig?.fire_withdrawal_rate   ?? 0.04
  const targetExp  = fireConfig?.fire_target_monthly_exp ?? avgLifestyleExpenses
  const expReturn  = fireConfig?.fire_expected_return   ?? 0.07
  const fireNumber = targetExp > 0 ? (targetExp * 12) / swr : 0
  const latestSnap = (snapshots ?? []).slice(-1)[0]
  const liquid     = latestSnap ? Number((latestSnap as { liquid_crc?: number | null }).liquid_crc ?? 0) : 0
  const invested   = latestSnap ? Number(latestSnap.invested_crc ?? 0) : 0
  const activosInvertibles = liquid + invested
  const fireProgress  = fireNumber > 0 ? (activosInvertibles / fireNumber) * 100 : 0
  // Runway based on lifestyle only — how long liquid assets cover real living costs
  const runway        = avgLifestyleExpenses > 0 ? liquid / avgLifestyleExpenses : null

  // Real portfolio return from NW snapshot deltas (not from cash transactions)
  // This captures NAV appreciation from funds like Dominion/TRANSCOMER that don't pay cash dividends
  const sortedSnaps   = [...(snapshots ?? [])].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
  const snap12mAgo    = sortedSnaps.filter(s => s.snapshot_date <= cutStr).slice(-1)[0]
  const invested12mAgo = snap12mAgo ? Number(snap12mAgo.invested_crc ?? 0) : 0
  // portfolioReturn = change in invested balance − new deposits sent during the period
  const portfolioReturn12m = invested12mAgo > 0 ? invested - invested12mAgo - c.totalSavings : null
  const portfolioReturnPct = invested12mAgo > 0 && portfolioReturn12m !== null
    ? (portfolioReturn12m / invested12mAgo) * 100 : null

  // Monthly simulation — matches progreso's forecast formula exactly
  const avgMonthlySavings = c.totalSavings / 12
  const monthlyReturn     = Math.pow(1 + expReturn, 1 / 12) - 1
  let yearsToFire = 0
  if (fireNumber > activosInvertibles && avgMonthlySavings > 0) {
    let fb = activosInvertibles
    for (let y = 1; y <= 40; y++) {
      for (let m = 0; m < 12; m++) fb = fb * (1 + monthlyReturn) + avgMonthlySavings
      if (fb >= fireNumber) { yearsToFire = y; break }
    }
  }

  // ── Envelope / liquid breakdown ────────────────────────────────────────────
  const parentIds = new Set(
    (envelopesRaw ?? []).filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string)
  )
  const rootParentIds = new Set(
    (envelopesRaw ?? []).filter(e => !e.parent_envelope_id && parentIds.has(e.id)).map(e => e.id)
  )
  const envBalMap: Record<string, number> = {}
  for (const m of movementsRaw ?? []) {
    if (m.movement_type === 'interes' || rootParentIds.has(m.envelope_id)) continue
    envBalMap[m.envelope_id] = (envBalMap[m.envelope_id] ?? 0) + Number(m.amount)
  }
  const envelopeRows = (envelopesRaw ?? [])
    .filter(e => !rootParentIds.has(e.id) && Math.abs(envBalMap[e.id] ?? 0) > 100)
    .map(e => ({ name: e.name, balance: envBalMap[e.id] ?? 0 }))
    .sort((a, b) => b.balance - a.balance)

  // ── YoY comparison ──────────────────────────────────────────────────────────
  const yoyIncome       = p.totalIncome  > 0 ? ((c.totalIncome  - p.totalIncome)  / p.totalIncome  * 100).toFixed(1) : 'n/d'
  const yoyLifestyle    = lifestylePrev  > 0 ? ((lifestyleCur   - lifestylePrev)  / lifestylePrev  * 100).toFixed(1) : 'n/d'
  const yoyLoanPayments = loanPaymentsPrev > 0 ? ((loanPaymentsCur - loanPaymentsPrev) / loanPaymentsPrev * 100).toFixed(1) : 'n/d'
  const yoySavings      = p.totalSavings > 0 ? ((c.totalSavings - p.totalSavings) / p.totalSavings * 100).toFixed(1) : 'n/d'

  // ── Recent transactions (60d) ──────────────────────────────────────────────
  const recentTxLines = recent
    .filter(tx => tx.movement_type && Number(tx.amount ?? 0) > 500)
    .slice(0, 60)
    .map(tx => {
      const type = tx.movement_type === 'income' ? '↑' : tx.expense_group === SAVINGS_EXPENSE_GROUP ? '💰' : '↓'
      const cat  = resolveDisplayCat(tx, vMap, cMap)
      const v    = (tx.vendor ?? tx.concept ?? '').slice(0, 22).padEnd(22)
      const d    = (tx.date ?? '').slice(5)
      return `${d} ${type} ${v} ${fmtCRC(Number(tx.amount ?? 0)).padStart(14)} [${cat}]`
    })

  // ── NW history (all snapshots) ─────────────────────────────────────────────
  const nwHistory = (snapshots ?? []).map(s => ({
    date:  s.snapshot_date,
    nw:    Number(s.net_worth_crc),
    inv:   Number(s.invested_crc ?? 0),
    liq:   Number((s as { liquid_crc?: number | null }).liquid_crc ?? 0),
    liab:  Number((s as { liabilities_crc?: number | null }).liabilities_crc ?? 0),
  }))

  const monthLabel = `${rolling12Start.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })} — ${new Date(endStr).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })}`

  // ── Loan payment breakdown (normal vs extraordinary) ──────────────────────
  const loanPayments = loanPaymentsRaw ?? []
  type LoanPaymentSummary = {
    name: string
    normalCount: number; normalTotal: number; normalAvgMonthly: number
    extraCount: number;  extraTotal: number
  }
  const loanSummaries: LoanPaymentSummary[] = (loansRaw ?? []).map(loan => {
    const payments = loanPayments.filter(p => p.loan_id === (loan as { id?: string }).id)
    const normal = payments.filter(p => p.payment_type === 'normal')
    const extra  = payments.filter(p => p.payment_type === 'extra' || p.payment_type === 'partial')
    return {
      name:             loan.name ?? 'Préstamo',
      normalCount:      normal.length,
      normalTotal:      normal.reduce((s, p) => s + Number(p.amount ?? 0), 0),
      normalAvgMonthly: normal.length > 0 ? normal.reduce((s, p) => s + Number(p.amount ?? 0), 0) / 12 : 0,
      extraCount:       extra.length,
      extraTotal:       extra.reduce((s, p) => s + Number(p.amount ?? 0), 0),
    }
  })

  // ── Expense pattern analysis (median vs average, spike detection) ──────────
  function median(vals: number[]): number {
    if (!vals.length) return 0
    const sorted = [...vals].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  // Per top-category: monthly totals → average, median, max (lifestyle only)
  const catMonthlyTotals: Record<string, number[]> = {}
  for (const tx of lifestyleTxs) {
    const cat = resolveDisplayCat(tx, vMap, cMap)
    const m   = (tx.date ?? '').slice(0, 7)
    if (!m) continue
    if (!catMonthlyTotals[cat]) catMonthlyTotals[cat] = Array(12).fill(0)
    const mIdx = months.indexOf(m)
    if (mIdx >= 0) catMonthlyTotals[cat][mIdx] += Number(tx.amount ?? 0)
  }

  const expensePatterns = topCats.map(([cat]) => {
    const monthly = catMonthlyTotals[cat] ?? []
    const nonZero = monthly.filter(v => v > 0)
    const avg     = monthly.reduce((s, v) => s + v, 0) / 12
    const med     = median(monthly)
    const max     = Math.max(...monthly, 0)
    const activeMonths = nonZero.length
    // Spike: any month > 3× median (and median > 0)
    const spikeMonths = med > 0 ? monthly.filter(v => v > med * 3).length : 0
    return { cat, avg, med, max, activeMonths, spikeMonths }
  }).filter(p => p.avg > 0)

  // ─────────────────────────── BUILD CONTEXT ──────────────────────────────────
  const context = `FECHA HOY: ${now.toISOString().slice(0, 10)}
TIPO DE CAMBIO: ₡${tcSell.toLocaleString('es-CR')} por USD
PERÍODO PRINCIPAL: Últimos 12 meses completos (${monthLabel})

══════════════════════════════════════════════════════════
 KPIs PRINCIPALES (12m)
══════════════════════════════════════════════════════════
Ingresos activos:        ${fmtCRC(c.totalActiveIncome)} (${usd(c.totalActiveIncome)})  → ${fmtCRC(c.totalActiveIncome / 12)}/mes
Ingresos pasivos:        ${fmtCRC(c.totalPassiveIncome)} (${usd(c.totalPassiveIncome)}) → ${fmtCRC(c.totalPassiveIncome / 12)}/mes
Total ingresos:          ${fmtCRC(c.totalIncome)} → ${fmtCRC(c.totalIncome / 12)}/mes
Gastos de vida:          ${fmtCRC(lifestyleCur)} → ${fmtCRC(avgLifestyleExpenses)}/mes  [consumo real, excluye préstamos e inversiones]
  — Supervivencia:       ${fmtCRC(survivalLifestyle)} (${lifestyleCur > 0 ? ((survivalLifestyle / lifestyleCur) * 100).toFixed(0) : 0}% del gasto de vida)
  — Discrecional:        ${fmtCRC(lifestyleCur - survivalLifestyle)} (${lifestyleCur > 0 ? (((lifestyleCur - survivalLifestyle) / lifestyleCur) * 100).toFixed(0) : 0}% del gasto de vida)
Cuotas / préstamos:      ${fmtCRC(loanPaymentsCur)} → ${fmtCRC(loanPaymentsCur / 12)}/mes  [amortización de capital — NO es gasto de consumo]
Ahorro / Inversión:      ${fmtCRC(c.totalSavings)} → ${fmtCRC(c.totalSavings / 12)}/mes
Tasa de ahorro:          ${savingsRate.toFixed(1)}%
Margen neto:             ${netMargin.toFixed(1)}%  [% del ingreso no destinado a gasto de vida]
Cobertura pasiva:        ${passiveCoverage.toFixed(1)}%
Runway líquido:          ${runway !== null ? `${runway.toFixed(1)} meses de gasto de vida` : 'n/d'}

══════════════════════════════════════════════════════════
 AÑO CONTRA AÑO (12m actual vs 12m anterior)
══════════════════════════════════════════════════════════
Ingresos:              ${fmtCRC(c.totalIncome)} vs ${fmtCRC(p.totalIncome)}  (${yoyIncome}%)
Gastos de vida:        ${fmtCRC(lifestyleCur)} vs ${fmtCRC(lifestylePrev)}  (${yoyLifestyle}%)  [sin préstamos ni inversiones — cifra relevante para inflación personal]
Cuotas/préstamos:      ${fmtCRC(loanPaymentsCur)} vs ${fmtCRC(loanPaymentsPrev)}  (${yoyLoanPayments}%)  [NO son gasto de vida; cuotas + abonos extraordinarios]
Ahorro/Inversión:      ${fmtCRC(c.totalSavings)} vs ${fmtCRC(p.totalSavings)}  (${yoySavings}%)

══════════════════════════════════════════════════════════
 DESGLOSE MENSUAL (últimos 12 meses completos)
══════════════════════════════════════════════════════════
Nota: "Gasto vida" excluye préstamos e inversiones. "Cuotas" incluye amortizaciones ordinarias y extraordinarias.
Mes        Ingreso        Gasto vida     Cuotas         Ahorro         Neto flujo
${monthlyRows.map(r =>
  `${r.m}   ${fmtCRC(r.inc).padStart(13)}   ${fmtCRC(r.lifestyle).padStart(13)}   ${fmtCRC(r.loans).padStart(13)}   ${fmtCRC(r.sav).padStart(13)}   ${fmtCRC(r.net).padStart(13)}`
).join('\n')}

══════════════════════════════════════════════════════════
 TOP CATEGORÍAS DE GASTO DE VIDA (12m, excluye préstamos e inversiones)
══════════════════════════════════════════════════════════
${topCats.map(([n, v]) => `${n.padEnd(28)} ${fmtCRC(v).padStart(14)}  (${lifestyleCur > 0 ? ((v / lifestyleCur) * 100).toFixed(0) : 0}%)`).join('\n')}

══════════════════════════════════════════════════════════
 TOP 25 COMERCIOS / VENDEDORES POR GASTO (12m)
══════════════════════════════════════════════════════════
${topVendors.map(([v, amt]) => `${v.slice(0, 30).padEnd(30)} ${fmtCRC(amt).padStart(14)}`).join('\n')}

══════════════════════════════════════════════════════════
 INGRESOS PASIVOS (12m)
══════════════════════════════════════════════════════════
${Object.entries(passiveCatMap).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.padEnd(28)} ${fmtCRC(v)}`).join('\n') || 'Sin registros'}

══════════════════════════════════════════════════════════
 RENDIMIENTO REAL DEL PORTAFOLIO (12m — via apreciación NAV)
══════════════════════════════════════════════════════════
NOTA CRÍTICA: fondos como Dominion, TRANSCOMER, acciones y crypto generan retorno
principalmente via apreciación del NAV — NO pagan dividendos en efectivo.
El retorno real se mide como el cambio en el valor del portafolio menos nuevos aportes,
NO como ingresos pasivos en transacciones.

Portafolio inicio período (${snap12mAgo?.snapshot_date ?? 'sin dato'}):  ${fmtCRC(invested12mAgo)}
Portafolio fin período (${latestSnap?.snapshot_date ?? 'sin dato'}):     ${fmtCRC(invested)}
Nuevos aportes al portafolio (12m):   ${fmtCRC(c.totalSavings)}
Apreciación / Retorno neto estimado:  ${portfolioReturn12m !== null ? `${fmtCRC(portfolioReturn12m)} (${portfolioReturnPct !== null ? portfolioReturnPct.toFixed(1) : 'n/d'}% sobre capital inicial)` : 'Insuficientes snapshots para calcular'}
Distribuciones en efectivo (pasivos): ${fmtCRC(c.totalPassiveIncome)}  [solo la parte que llegó como ingreso a cuenta]
Retorno total estimado (apreciación + distribuciones): ${portfolioReturn12m !== null ? fmtCRC(portfolioReturn12m + c.totalPassiveIncome) : 'n/d'}

IMPORTANTE: NO uses la tasa de "ingresos pasivos / portafolio" como rendimiento.
Esa tasa solo mide distribuciones en efectivo, no la apreciación del NAV.
La tasa relevante es: Retorno total estimado / Portafolio inicio.

══════════════════════════════════════════════════════════
 AHORRO E INVERSIÓN (12m)
══════════════════════════════════════════════════════════
${Object.entries(savingsBreakdown).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.padEnd(28)} ${fmtCRC(v)}`).join('\n') || 'Sin registros'}

══════════════════════════════════════════════════════════
 FIRE
══════════════════════════════════════════════════════════
FIRE Number (SWR ${(swr * 100).toFixed(0)}%):  ${fmtCRC(fireNumber)} (${usd(fireNumber)})
Meta mensual en retiro:  ${fmtCRC(targetExp)}
Activos invertibles:     ${fmtCRC(activosInvertibles)} (${usd(activosInvertibles)}) → ${fireProgress.toFixed(1)}% del FIRE
  — Liquidez:            ${fmtCRC(liquid)}
  — Inversiones:         ${fmtCRC(invested)}
Retorno esperado:        ${(expReturn * 100).toFixed(0)}% anual
Años estimados a FIRE:   ${yearsToFire > 0 ? `~${yearsToFire} años` : fireProgress >= 100 ? 'FIRE alcanzado' : 'n/d'}
Runway:                  ${runway !== null ? `${runway.toFixed(1)} meses` : 'n/d'}

══════════════════════════════════════════════════════════
 LIQUIDEZ — SALDO POR SOBRE
══════════════════════════════════════════════════════════
${envelopeRows.length > 0
  ? envelopeRows.map(e => `${e.name.padEnd(28)} ${fmtCRC(e.balance).padStart(14)}`).join('\n')
  : 'Sin sobres activos'}

══════════════════════════════════════════════════════════
 PRÉSTAMOS ACTIVOS (saldo + pagos 12m)
══════════════════════════════════════════════════════════
${loanSummaries.length > 0 ? loanSummaries.map(ls => {
  const loan = (loansRaw ?? []).find(l => l.name === ls.name)
  const bal = Number(loan?.current_balance ?? 0)
  const balCrc = loan?.currency_code === 'USD' ? bal * tcSell : bal
  const balStr = loan?.currency_code === 'USD' ? `$${bal.toLocaleString('en-US')}` : fmtCRC(bal)
  let s = `${ls.name.padEnd(28)} saldo: ${balStr} @ ${Number(loan?.interest_rate ?? 0).toFixed(2)}% · vence ${loan?.end_date ?? 'n/d'}`
  if (ls.normalCount > 0) {
    s += `\n  → Cuotas normales (12m): ${ls.normalCount} pagos · total ${fmtCRC(ls.normalTotal)} · promedio ${fmtCRC(ls.normalAvgMonthly)}/mes`
  }
  if (ls.extraCount > 0) {
    s += `\n  → Abonos extraordinarios (12m): ${ls.extraCount} pagos · total ${fmtCRC(ls.extraTotal)} [NO son gasto recurrente — reducen capital directamente]`
  }
  if (ls.normalCount === 0 && ls.extraCount === 0) {
    s += `\n  → Sin pagos registrados en los últimos 12m`
  }
  return s
}).join('\n') : 'Sin préstamos activos'}

══════════════════════════════════════════════════════════
 PATRONES DE GASTO — RECURRENTE vs PUNTUAL
══════════════════════════════════════════════════════════
IMPORTANTE: usa esta tabla para distinguir gastos recurrentes de spikes. No trates un spike como gasto mensual habitual.
Categoría                    Prom/mes      Mediana/mes   Meses activos  Spikes
${expensePatterns.map(p =>
  `${p.cat.slice(0, 28).padEnd(28)} ${fmtCRC(p.avg).padStart(13)} ${fmtCRC(p.med).padStart(13)}   ${String(p.activeMonths).padStart(2)}/12           ${p.spikeMonths > 0 ? `⚠ ${p.spikeMonths} mes(es) atípico(s) (>${fmtCRC(p.med * 3)})` : 'recurrente'}`
).join('\n') || 'Sin datos'}

══════════════════════════════════════════════════════════
 ACTIVOS
══════════════════════════════════════════════════════════
${(assetsRaw ?? []).map(a =>
  `${(a.name ?? '').padEnd(28)} ${fmtCRC(Number(a.value_crc)).padStart(14)} [${a.asset_type}]${a.is_investable ? ' ✓invertible' : ''}`
).join('\n') || 'Sin activos registrados'}
${(liabilitiesRaw ?? []).length > 0 ? `\nPasivos manuales:\n${(liabilitiesRaw ?? []).map(l =>
  `${(l.name ?? '').padEnd(28)} ${fmtCRC(Number(l.current_balance)).padStart(14)}`
).join('\n')}` : ''}

══════════════════════════════════════════════════════════
 PATRIMONIO NETO — HISTORIAL COMPLETO
══════════════════════════════════════════════════════════
Fecha        Patrim.Neto       Invertido         Liquidez        Pasivos
${nwHistory.map(s =>
  `${s.date}   ${fmtCRC(s.nw).padStart(14)}   ${fmtCRC(s.inv).padStart(14)}   ${fmtCRC(s.liq).padStart(14)}   ${fmtCRC(s.liab).padStart(14)}`
).join('\n') || '(Sin snapshots)'}

══════════════════════════════════════════════════════════
 TRANSACCIONES RECIENTES (últimos 60 días, >₡500)
══════════════════════════════════════════════════════════
Fecha  T  Comercio/Concepto        Monto             Categoría
${recentTxLines.join('\n') || '(Sin transacciones recientes)'}
`

  return (
    <div className="h-[calc(100vh-4rem)] md:h-screen flex flex-col">
      <OracleView context={context} />
    </div>
  )
}
