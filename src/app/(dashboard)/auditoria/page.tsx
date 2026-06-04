import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AuditView } from './AuditView'

export type RecentIncome = {
  id: string
  date: string
  amount: number
  concept: string | null
  vendor: string | null
  is_settlement: boolean
}

export type CustodioInfo = {
  name: string
  systemTotal: number
  leafEnvelopes: { id: string; name: string }[]
}

export type FlowData = {
  incomeRegular: number
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
      .select('movement_type, is_settlement, amount')
      .eq('user_id', user.id),
    admin.from('transactions')
      .select('id, date, amount, concept, vendor, is_settlement')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .order('date', { ascending: false })
      .limit(30),
  ])

  // Per-envelope balance
  const ownBalance: Record<string, number> = {}
  const ownInterest: Record<string, number> = {}
  for (const m of movements ?? []) {
    if (m.movement_type === 'interes') {
      ownInterest[m.envelope_id] = (ownInterest[m.envelope_id] ?? 0) + Number(m.amount)
    } else {
      ownBalance[m.envelope_id] = (ownBalance[m.envelope_id] ?? 0) + Number(m.amount)
    }
  }

  // parentIds = envelopes that have at least one child
  const parentIds = new Set(
    (envelopes ?? []).filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string)
  )
  // rootParentIds = root-level parents only (no parent themselves, but have children)
  // These are container envelopes like "Transitorio" whose own movements shouldn't be counted
  const rootParentIds = new Set(
    (envelopes ?? []).filter(e => !e.parent_envelope_id && parentIds.has(e.id)).map(e => e.id)
  )
  const activeEnvelopeIds = new Set((envelopes ?? []).map(e => e.id))

  // Build custodio totals — skip only root-level parents; include intermediate parents (they hold real money)
  const custodioMap = new Map<string, CustodioInfo>()
  for (const e of envelopes ?? []) {
    if (rootParentIds.has(e.id)) continue
    if (!custodioMap.has(e.custodio)) {
      custodioMap.set(e.custodio, { name: e.custodio, systemTotal: 0, leafEnvelopes: [] })
    }
    const info = custodioMap.get(e.custodio)!
    info.systemTotal += (ownBalance[e.id] ?? 0)  // principal only, no interest
    info.leafEnvelopes.push({ id: e.id, name: e.name })
  }
  const custodios = [...custodioMap.values()]

  // Ledger totals
  let incomeRegular = 0, incomeSettlement = 0, expenseTotal = 0, cashWithdrawals = 0
  for (const tx of txRows ?? []) {
    const amt = Number(tx.amount ?? 0)
    if (tx.movement_type === 'income' && !tx.is_settlement)     incomeRegular    += amt
    else if (tx.movement_type === 'income' && tx.is_settlement) incomeSettlement += amt
    else if (tx.movement_type === 'expense')                     expenseTotal     += amt
    else if (tx.movement_type === 'cash_withdrawal')             cashWithdrawals  += amt
  }

  // envelopeTotal: principal only, all active envelopes except root-level parents
  const envelopeTotal = (movements ?? [])
    .filter(m =>
      m.movement_type !== 'interes' &&
      activeEnvelopeIds.has(m.envelope_id) &&
      !rootParentIds.has(m.envelope_id)
    )
    .reduce((s, m) => s + Number(m.amount), 0)

  const flowData: FlowData = {
    incomeRegular,
    incomeSettlement,
    expenseTotal,
    cashWithdrawals,
    ledgerNet: incomeRegular + incomeSettlement - expenseTotal - cashWithdrawals,
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
      })),
  }

  return <AuditView custodios={custodios} flowData={flowData} />
}
