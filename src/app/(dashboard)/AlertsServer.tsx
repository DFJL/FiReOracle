import { createAdminClient } from '@/lib/supabase/admin'
import { computeAlerts } from '@/lib/alerts'
import { AlertsBanner } from '@/components/AlertsBanner'
import { isLoanPayment } from './resumen/categoryUtils'

export async function AlertsServer({ userId }: { userId: string }) {
  const admin = createAdminClient()

  const { data: config } = await admin
    .from('user_financial_config')
    .select('runway_yellow_months, runway_green_months, goal_funding_alert_ratio')
    .eq('user_id', userId)
    .maybeSingle()

  if (!config) return null

  // Liquid balance from leaf envelope movements (same source as FIRE progreso page)
  const { data: envelopes } = await admin
    .from('savings_envelopes')
    .select('id, parent_envelope_id')
    .eq('user_id', userId)
    .eq('is_active', true)

  const { data: allMovements } = await admin
    .from('envelope_movements')
    .select('amount, movement_type, envelope_id')
    .eq('user_id', userId)

  const parentEnvelopeIds = new Set(
    (envelopes ?? []).filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string)
  )
  const liquidBalance = (allMovements ?? [])
    .filter(m => m.movement_type !== 'interes' && !parentEnvelopeIds.has(m.envelope_id))
    .reduce((s, m) => s + Number(m.amount), 0)

  // 12-month window (excludes current partial month) — matches progreso's exact window
  const now = new Date()
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const twelveMonthsBack = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const twelveMonthsBackStr = `${twelveMonthsBack.getFullYear()}-${String(twelveMonthsBack.getMonth() + 1).padStart(2, '0')}-01`

  const { data: prevTx } = await admin
    .from('transactions')
    .select('amount, date, category_code, movement_type, expense_group, concept, vendor, is_passive_income, is_settlement')
    .eq('user_id', userId)
    .gte('date', twelveMonthsBackStr)
    .lt('date', thisMonthStart)

  // Lifestyle expenses only — same filter as progreso's avgMonthlyExpenses
  let lifestyleTotal = 0
  let loanTotal = 0
  let passiveTotal = 0
  for (const tx of prevTx ?? []) {
    if (!tx.date) continue
    if (tx.movement_type === 'income' && tx.is_passive_income && !tx.is_settlement) {
      passiveTotal += Number(tx.amount)
    } else if (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal') {
      if (isLoanPayment(tx.vendor, tx.concept, tx.category_code)) {
        loanTotal += Number(tx.amount)
      } else if (tx.expense_group !== 'objetivos_financieros') {
        lifestyleTotal += Number(tx.amount)
      }
    }
  }
  // Obligations = lifestyle + loans (both are real monthly cash requirements)
  const avgMonthlyExpense = (lifestyleTotal + loanTotal) / 12
  const avgMonthlyPassive = passiveTotal / 12
  const avgNetBurn = Math.max(avgMonthlyExpense - avgMonthlyPassive, 0)

  // This month's spending by category_code (for budget alerts)
  const { data: thisMoTx } = await admin
    .from('transactions')
    .select('amount, category_code')
    .eq('user_id', userId)
    .in('movement_type', ['expense', 'cash_withdrawal'])
    .gte('date', thisMonthStart)

  const thisMonthSpendByCode: Record<string, number> = {}
  for (const tx of thisMoTx ?? []) {
    if (tx.category_code) {
      thisMonthSpendByCode[tx.category_code] = (thisMonthSpendByCode[tx.category_code] ?? 0) + Number(tx.amount)
    }
  }

  // Active budgets with a category code mapping
  const { data: budgets } = await admin
    .from('budgets')
    .select('id, category, auto_tx_category_code, monthly_limit')
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('auto_tx_category_code', 'is', null)

  const budgetsWithCode = (budgets ?? [])
    .filter((b) => b.auto_tx_category_code)
    .map((b) => ({
      id: b.id,
      category: b.category,
      auto_tx_category_code: b.auto_tx_category_code as string,
      monthly_limit: Number(b.monthly_limit),
    }))

  // Active goals with current capital
  const { data: rawGoals } = await admin
    .from('goals')
    .select('id, name, target_amount_crc, target_date, manual_current_amount_crc, linked_envelope_id, linked_bucket_id')
    .eq('user_id', userId)
    .eq('is_active', true)

  const linkedEnvelopeIds = (rawGoals ?? []).filter((g) => g.linked_envelope_id).map((g) => g.linked_envelope_id as string)

  // Batch fetch envelope balances
  let envelopeBalances: Record<string, number> = {}
  if (linkedEnvelopeIds.length > 0) {
    const { data: envMovements } = await admin
      .from('envelope_movements')
      .select('envelope_id, amount')
      .in('envelope_id', linkedEnvelopeIds)
    for (const m of envMovements ?? []) {
      envelopeBalances[m.envelope_id] = (envelopeBalances[m.envelope_id] ?? 0) + Number(m.amount)
    }
  }

  const linkedBucketIds = (rawGoals ?? []).filter((g) => g.linked_bucket_id).map((g) => g.linked_bucket_id as string)
  let bucketBalances: Record<string, number> = {}
  if (linkedBucketIds.length > 0) {
    const { data: buckets } = await admin
      .from('savings_buckets')
      .select('id, current_amount')
      .in('id', linkedBucketIds)
    for (const b of buckets ?? []) {
      bucketBalances[b.id] = Number(b.current_amount ?? 0)
    }
  }

  const goals = (rawGoals ?? []).map((g) => {
    let current_amount = Number(g.manual_current_amount_crc ?? 0)
    if (g.linked_envelope_id) current_amount = envelopeBalances[g.linked_envelope_id] ?? 0
    else if (g.linked_bucket_id) current_amount = bucketBalances[g.linked_bucket_id] ?? 0
    return {
      id: g.id,
      name: g.name,
      target_amount_crc: Number(g.target_amount_crc),
      target_date: g.target_date as string | null,
      current_amount,
    }
  })

  const alerts = computeAlerts({
    liquidBalance,
    avgMonthlyExpense: avgNetBurn > 0 ? avgNetBurn : avgMonthlyExpense,
    runwayYellowMonths: Number(config.runway_yellow_months ?? 3),
    runwayGreenMonths: Number(config.runway_green_months ?? 6),
    budgetsWithCode,
    thisMonthSpendByCode,
    goals,
    goalFundingAlertRatio: Number(config.goal_funding_alert_ratio ?? 0.8),
  })

  if (alerts.length === 0) return null

  return <AlertsBanner alerts={alerts} />
}
