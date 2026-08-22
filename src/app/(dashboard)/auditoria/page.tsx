import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AuditView } from './AuditView'
import { computeEnvelopeBalances } from '@/lib/envelopeBalances'

export type RecentIncome = {
  id: string
  date: string
  amount: number
  concept: string | null
  vendor: string | null
  is_settlement: boolean
  is_passive_income: boolean
}

export type CustodioInfo = {
  name: string
  systemTotal: number
  leafEnvelopes: { id: string; name: string }[]
}

export type FlowData = {
  incomeRegular: number
  incomePassive: number
  incomeSettlement: number
  expenseTotal: number
  cashWithdrawals: number
  ledgerNet: number
  envelopeTotal: number
  recentIncome: RecentIncome[]
}

export default async function AuditoriaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [
    { data: envelopes },
    { data: movements },
    { data: txRows },
    { data: recentIncomeRaw },
  ] = await Promise.all([
    admin.from('savings_envelopes')
      .select('id, name, custodio, parent_envelope_id')
      .eq('user_id', user.id)
      .eq('is_active', true),
    admin.from('envelope_movements')
      .select('envelope_id, amount, movement_type')
      .eq('user_id', user.id),
    admin.from('transactions')
      .select('movement_type, is_settlement, is_passive_income, amount')
      .eq('user_id', user.id),
    admin.from('transactions')
      .select('id, date, amount, concept, vendor, is_settlement, is_passive_income')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .order('date', { ascending: false })
      .limit(30),
  ])

  // Canonical envelope rule, shared with /liquidez and /patrimonio
  const { ownBalance, countableIds, liquidTotal } =
    computeEnvelopeBalances(envelopes ?? [], movements ?? [])

  // Build custodio totals — skip only root-level parents; include intermediate parents (they hold real money)
  const custodioMap = new Map<string, CustodioInfo>()
  for (const e of envelopes ?? []) {
    if (!countableIds.has(e.id)) continue
    if (!custodioMap.has(e.custodio)) {
      custodioMap.set(e.custodio, { name: e.custodio, systemTotal: 0, leafEnvelopes: [] })
    }
    const info = custodioMap.get(e.custodio)!
    info.systemTotal += (ownBalance[e.id] ?? 0)  // principal only, no interest
    info.leafEnvelopes.push({ id: e.id, name: e.name })
  }
  const custodios = [...custodioMap.values()]

  // Ledger totals
  // Passive income (farming, NAV appreciation, airdrops) is excluded from ledgerNet —
  // these are investment returns that may not be liquid cash, so they should not trigger
  // a reconciliation gap. They are shown separately as informational only.
  let incomeRegular = 0, incomePassive = 0, incomeSettlement = 0, expenseTotal = 0, cashWithdrawals = 0
  for (const tx of txRows ?? []) {
    const amt = Number(tx.amount ?? 0)
    if (tx.movement_type === 'income' && tx.is_passive_income)  incomePassive    += amt
    else if (tx.movement_type === 'income' && !tx.is_settlement) incomeRegular   += amt
    else if (tx.movement_type === 'income' && tx.is_settlement)  incomeSettlement += amt
    else if (tx.movement_type === 'expense')                      expenseTotal    += amt
    else if (tx.movement_type === 'cash_withdrawal')              cashWithdrawals += amt
  }

  // envelopeTotal: principal only, all active envelopes except root-level parents
  const envelopeTotal = liquidTotal

  const flowData: FlowData = {
    incomeRegular,
    incomePassive,
    incomeSettlement,
    expenseTotal,
    cashWithdrawals,
    ledgerNet: incomeRegular + incomePassive + incomeSettlement - expenseTotal - cashWithdrawals,
    envelopeTotal,
    recentIncome: (recentIncomeRaw ?? [])
      .filter(r => r.date !== null)
      .map(r => ({
        id: r.id,
        date: r.date as string,
        amount: Number(r.amount),
        concept: r.concept,
        vendor: r.vendor,
        is_settlement: r.is_settlement ?? false,
        is_passive_income: r.is_passive_income ?? false,
      })),
  }

  return <AuditView custodios={custodios} flowData={flowData} />
}
