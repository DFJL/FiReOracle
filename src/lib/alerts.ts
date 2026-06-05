export type Alert = {
  id: string
  type: 'runway' | 'budget' | 'goal'
  severity: 'warning' | 'error'
  title: string
  message: string
}

function fmtCRC(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n)
}

export function computeAlerts({
  liquidBalance,
  avgMonthlyExpense,
  runwayYellowMonths,
  runwayGreenMonths,
  budgetsWithCode,
  thisMonthSpendByCode,
  goals,
  goalFundingAlertRatio,
}: {
  liquidBalance: number
  avgMonthlyExpense: number
  runwayYellowMonths: number
  runwayGreenMonths: number
  budgetsWithCode: Array<{ id: string; category: string; auto_tx_category_code: string; monthly_limit: number }>
  thisMonthSpendByCode: Record<string, number>
  goals: Array<{ id: string; name: string; current_amount: number; target_amount_crc: number; target_date: string | null }>
  goalFundingAlertRatio: number
}): Alert[] {
  const alerts: Alert[] = []

  // Runway Alert
  if (avgMonthlyExpense > 0) {
    const runwayMonths = liquidBalance / avgMonthlyExpense
    if (runwayMonths < runwayYellowMonths) {
      alerts.push({
        id: 'runway',
        type: 'runway',
        severity: runwayMonths < runwayYellowMonths * 0.5 ? 'error' : 'warning',
        title: 'Runway bajo',
        message: `Tu liquidez cubre ${runwayMonths.toFixed(1)} meses de gastos. Meta: ${runwayGreenMonths} meses.`,
      })
    }
  }

  // Category Budget Alert
  for (const budget of budgetsWithCode) {
    const spent = thisMonthSpendByCode[budget.auto_tx_category_code] ?? 0
    if (spent > budget.monthly_limit) {
      alerts.push({
        id: `budget-${budget.id}`,
        type: 'budget',
        severity: 'warning',
        title: budget.category,
        message: `Superó el presupuesto: ${fmtCRC(spent)} de ${fmtCRC(budget.monthly_limit)}.`,
      })
    }
  }

  // Goal at Risk Alert
  for (const goal of goals) {
    if (!goal.target_date) continue
    const ratio = goal.target_amount_crc > 0 ? goal.current_amount / goal.target_amount_crc : 0
    if (ratio < goalFundingAlertRatio) {
      alerts.push({
        id: `goal-${goal.id}`,
        type: 'goal',
        severity: 'warning',
        title: goal.name,
        message: `Al ${(ratio * 100).toFixed(0)}% del capital necesario antes de ${goal.target_date.slice(0, 7)}.`,
      })
    }
  }

  return alerts
}
