import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { EnvelopeSection } from './EnvelopeSection'
import { SelfLoansSection } from './SelfLoansSection'

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
      .select('id, name, custodio, color, sort_order, interest_mode, annual_rate, parent_envelope_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('envelope_movements')
      .select('envelope_id, amount, movement_type')
      .eq('user_id', user.id),
    admin
      .from('self_loans')
      .select('id, description, original_amount, amount_repaid, loan_date, status, source_envelope_id, envelope_split, notes')
      .eq('user_id', user.id)
      .order('loan_date', { ascending: false }),
  ])

  // Own balance from movements — exclude interes type (reference only)
  const ownBalance: Record<string, number> = {}
  const ownInterest: Record<string, number> = {}
  for (const m of movements ?? []) {
    if (m.movement_type === 'interes') {
      ownInterest[m.envelope_id] = (ownInterest[m.envelope_id] ?? 0) + Number(m.amount)
    } else {
      ownBalance[m.envelope_id] = (ownBalance[m.envelope_id] ?? 0) + Number(m.amount)
    }
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
      balance: ownBalance[e.id] ?? 0,
      interest: ownInterest[e.id] ?? 0,
    })
  }

  // Root envelopes: balance = sum of children (if has children) or own movements
  const rootEnvelopes: Envelope[] = (envelopes ?? [])
    .filter(e => !e.parent_envelope_id)
    .map(e => {
      const children = childMap[e.id] ?? []
      const balance = children.length > 0
        ? children.reduce((s, c) => s + c.balance, 0)
        : (ownBalance[e.id] ?? 0)
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
    }
  })

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-10">
      <EnvelopeSection envelopes={rootEnvelopes} leafEnvelopes={leafEnvelopes} />
      <div className="border-t border-white/[0.06] pt-8">
        <SelfLoansSection loans={enrichedLoans} envelopes={leafEnvelopes as Envelope[]} />
      </div>
    </div>
  )
}
