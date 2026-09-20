import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { EnvelopeSection } from './EnvelopeSection'
import { SelfLoansSection } from './SelfLoansSection'
import { SobresEvolucionSection } from './SobresEvolucionSection'
import { computeEnvelopeBalances, rollupBalance } from '@/lib/envelopeBalances'

export type SubEnvelope = {
  id: string
  name: string
  custodio: string
  color: string | null
  sort_order: number | null
  interest_mode: string | null
  annual_rate: number | null
  parent_envelope_id: string
  balance: number   // principal only (excludes interes movements)
  interest: number  // sum of interes movements (reference only)
  counts_as_ahorro: boolean
  grandchildren: { id: string; name: string; balance: number; interest: number }[]
}

export type Envelope = {
  id: string
  name: string
  custodio: string
  color: string | null
  sort_order: number | null
  interest_mode: string | null
  annual_rate: number | null
  parent_envelope_id: null
  balance: number   // principal only; sum of children if has children
  interest: number  // reference only; sum of children if has children
  counts_as_ahorro: boolean
  children: SubEnvelope[]
}

export type SelfLoan = {
  id: string
  description: string
  original_amount: number
  amount_repaid: number
  loan_date: string
  status: string
  source_envelope_id: string | null
  source_envelope_name: string | null
  envelope_split: { envelope_id: string; name: string; amount: number }[] | null
  notes: string | null
  linked_transaction: { concept: string | null; vendor: string | null; date: string } | null
}

export type SobreEvolucion = {
  name: string
  balance: number
  change: number
  since: string   // ISO date — when the comparison window actually starts for this envelope
}

export default async function LiquidezPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [
    { data: envelopes },
    { data: movements },
    { data: loans },
  ] = await Promise.all([
    admin
      .from('savings_envelopes')
      .select('id, name, custodio, color, sort_order, interest_mode, annual_rate, parent_envelope_id, counts_as_ahorro')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('envelope_movements')
      .select('envelope_id, amount, movement_type, date')
      .eq('user_id', user.id),
    admin
      .from('self_loans')
      .select('id, description, original_amount, amount_repaid, loan_date, status, source_envelope_id, envelope_split, notes, linked_transaction_id')
      .eq('user_id', user.id)
      .order('loan_date', { ascending: false }),
  ])

  const linkedTxIds = [...new Set((loans ?? []).map(l => l.linked_transaction_id).filter((id): id is string => !!id))]
  const linkedTxMap: Record<string, { concept: string | null; vendor: string | null; date: string }> = {}
  if (linkedTxIds.length > 0) {
    const { data: linkedTxs } = await admin
      .from('transactions')
      .select('id, concept, vendor, date')
      .in('id', linkedTxIds)
    for (const t of linkedTxs ?? []) {
      linkedTxMap[t.id] = { concept: t.concept, vendor: t.vendor, date: t.date ?? '' }
    }
  }

  // Canonical envelope rule, shared with /auditoria and /patrimonio
  const { ownBalance, ownInterest, countableIds } =
    computeEnvelopeBalances(envelopes ?? [], movements ?? [])

  // Children by parent, used to roll balances up through every level
  const childrenByParent: Record<string, { id: string; parent_envelope_id: string | null }[]> = {}
  for (const e of envelopes ?? []) {
    if (!e.parent_envelope_id) continue
    if (!childrenByParent[e.parent_envelope_id]) childrenByParent[e.parent_envelope_id] = []
    childrenByParent[e.parent_envelope_id].push(e)
  }

  // Group children by parent
  const childMap: Record<string, SubEnvelope[]> = {}
  for (const e of envelopes ?? []) {
    if (!e.parent_envelope_id) continue
    if (!childMap[e.parent_envelope_id]) childMap[e.parent_envelope_id] = []
    childMap[e.parent_envelope_id].push({
      id: e.id,
      name: e.name,
      custodio: e.custodio,
      color: e.color,
      sort_order: e.sort_order,
      interest_mode: e.interest_mode,
      annual_rate: e.annual_rate,
      parent_envelope_id: e.parent_envelope_id,
      // rolled up: an intermediate parent's balance includes its grandchildren
      balance: rollupBalance(e.id, childrenByParent, ownBalance, countableIds),
      interest: ownInterest[e.id] ?? 0,
      counts_as_ahorro: (e as { counts_as_ahorro?: boolean }).counts_as_ahorro ?? false,
      grandchildren: [],
    })
  }
  // Attach any 3rd-level envelopes as grandchildren of their parent sub-envelope
  for (const children of Object.values(childMap)) {
    for (const sub of children) {
      sub.grandchildren = (childMap[sub.id] ?? []).map(gc => ({
        id: gc.id, name: gc.name, balance: gc.balance, interest: gc.interest,
      }))
    }
  }

  // Root envelopes: balance = sum of children (if has children) or own movements
  const rootEnvelopes: Envelope[] = (envelopes ?? [])
    .filter(e => !e.parent_envelope_id)
    .map(e => {
      const children = childMap[e.id] ?? []
      // Rolls up the whole subtree (children + grandchildren); a root container's
      // own structural movements are excluded via countableIds.
      const balance = rollupBalance(e.id, childrenByParent, ownBalance, countableIds)
      const interest = children.length > 0
        ? children.reduce((s, c) => s + c.interest, 0)
        : (ownInterest[e.id] ?? 0)
      return {
        id: e.id,
        name: e.name,
        custodio: e.custodio,
        color: e.color,
        sort_order: e.sort_order,
        interest_mode: e.interest_mode,
        annual_rate: e.annual_rate,
        parent_envelope_id: null,
        balance,
        interest,
        counts_as_ahorro: (e as { counts_as_ahorro?: boolean }).counts_as_ahorro ?? false,
        children,
      }
    })

  // Flat leaf envelopes (for interest distribution — only leaves hold actual movements)
  const leafEnvelopes: (Envelope | SubEnvelope)[] = rootEnvelopes.flatMap<Envelope | SubEnvelope>(e =>
    e.children.length > 0 ? e.children : [e]
  )

  // Envelope name map for self-loans
  const envelopeNameMap: Record<string, string> = {}
  for (const e of envelopes ?? []) envelopeNameMap[e.id] = e.name

  // Balance evolution — current vs. ~12 months ago, or since tracking
  // began if shorter. A data migration around mid-2026 reset several
  // envelopes' movement history (bulk "Restauración saldo previo" entries),
  // so several goal envelopes only have ~4-5 months of real history —
  // pretending they all have a full 12 months to compare against would be
  // dishonest, so each envelope shows its own "desde" date.
  const now = new Date()
  const rolling12StartStr = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate()).toISOString().slice(0, 10)
  const firstMovementByEnvelope: Record<string, string> = {}
  for (const m of movements ?? []) {
    const d = (m as { date?: string | null }).date
    if (!d) continue
    if (!firstMovementByEnvelope[m.envelope_id] || d < firstMovementByEnvelope[m.envelope_id]) {
      firstMovementByEnvelope[m.envelope_id] = d
    }
  }
  const priorMovements = (movements ?? []).filter(m => {
    const d = (m as { date?: string | null }).date
    return d && d < rolling12StartStr
  })
  const { ownBalance: priorOwnBalance } = computeEnvelopeBalances(envelopes ?? [], priorMovements)
  const sobresEvolucion: SobreEvolucion[] = leafEnvelopes
    .map(e => {
      const firstDate = firstMovementByEnvelope[e.id] ?? null
      const since = firstDate && firstDate > rolling12StartStr ? firstDate : rolling12StartStr
      return { name: e.name, balance: e.balance, change: e.balance - (priorOwnBalance[e.id] ?? 0), since }
    })
    .filter(e => e.balance !== 0 || e.change !== 0)
    .sort((a, b) => b.balance - a.balance)

  const enrichedLoans: SelfLoan[] = (loans ?? []).map(l => {
    const rawSplit = l.envelope_split
    let split: { envelope_id: string; name: string; amount: number }[] | null = null
    if (Array.isArray(rawSplit)) {
      split = (rawSplit as { envelope_id: string; amount: number }[]).map(s => ({
        envelope_id: s.envelope_id,
        amount: Number(s.amount),
        name: envelopeNameMap[s.envelope_id] ?? '?',
      }))
    } else if (rawSplit && typeof rawSplit === 'object') {
      split = Object.entries(rawSplit as Record<string, number>).map(([envelope_id, amount]) => ({
        envelope_id,
        amount: Number(amount),
        name: envelopeNameMap[envelope_id] ?? '?',
      }))
    }
    return {
      id: l.id,
      description: l.description,
      original_amount: Number(l.original_amount),
      amount_repaid: Number(l.amount_repaid),
      loan_date: l.loan_date,
      status: l.status,
      source_envelope_id: l.source_envelope_id ?? null,
      source_envelope_name: l.source_envelope_id ? (envelopeNameMap[l.source_envelope_id] ?? null) : null,
      envelope_split: split,
      notes: l.notes,
      linked_transaction: l.linked_transaction_id ? (linkedTxMap[l.linked_transaction_id] ?? null) : null,
    }
  })

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-10">
      <EnvelopeSection envelopes={rootEnvelopes} leafEnvelopes={leafEnvelopes} />
      <div className="border-t border-white/[0.06] pt-8">
        <SobresEvolucionSection sobres={sobresEvolucion} />
      </div>
      <div className="border-t border-white/[0.06] pt-8">
        <SelfLoansSection loans={enrichedLoans} envelopes={leafEnvelopes as Envelope[]} />
      </div>
    </div>
  )
}
