import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { EnvelopeSection } from './EnvelopeSection'
import { SelfLoansSection } from './SelfLoansSection'

export type Envelope = {
  id: string
  name: string
  custodio: string
  color: string | null
  sort_order: number | null
  interest_mode: string | null
  annual_rate: number | null
  balance: number
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
      .select('id, name, custodio, color, sort_order, interest_mode, annual_rate')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('envelope_movements')
      .select('envelope_id, amount')
      .eq('user_id', user.id),
    admin
      .from('self_loans')
      .select('id, description, original_amount, amount_repaid, balance_remaining, loan_date, status, source_envelope_id, notes')
      .eq('user_id', user.id)
      .order('loan_date', { ascending: false }),
  ])

  const balanceMap: Record<string, number> = {}
  for (const m of movements ?? []) {
    balanceMap[m.envelope_id] = (balanceMap[m.envelope_id] ?? 0) + Number(m.amount)
  }

  const enriched: Envelope[] = (envelopes ?? []).map(e => ({
    ...e,
    balance: balanceMap[e.id] ?? 0,
  }))

  const envelopeNameMap: Record<string, string> = {}
  for (const e of envelopes ?? []) envelopeNameMap[e.id] = e.name

  const enrichedLoans: SelfLoan[] = (loans ?? []).map(l => ({
    id: l.id,
    description: l.description,
    original_amount: Number(l.original_amount),
    amount_repaid: Number(l.amount_repaid),
    loan_date: l.loan_date,
    status: l.status,
    source_envelope_id: l.source_envelope_id ?? null,
    source_envelope_name: l.source_envelope_id ? (envelopeNameMap[l.source_envelope_id] ?? null) : null,
    notes: l.notes,
  }))

  if (enriched.length === 0) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <p className="text-[9px] font-black text-[#a3e635]/60 tracking-[0.22em] uppercase mb-1">
            Fire Oracle
          </p>
          <p className="text-3xl font-black text-white tracking-tight leading-none">Liquidez</p>
        </div>
        <div className="rounded-2xl border border-dashed border-[#a3e635]/[0.15] p-10 text-center space-y-3">
          <p className="text-zinc-400 text-sm font-semibold">Sin sobres configurados</p>
          <p className="text-zinc-600 text-xs">Creá tus sobres de ahorro en Configuración para empezar a registrar tu liquidez.</p>
          <a
            href="/configuracion"
            className="inline-block mt-2 px-4 py-2 rounded-lg bg-[#a3e635]/10 text-[#a3e635] text-xs font-black hover:bg-[#a3e635]/20 transition-all"
          >
            Ir a Configuración
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-10">
      <EnvelopeSection envelopes={enriched} />
      <div className="border-t border-white/[0.06] pt-8">
        <SelfLoansSection loans={enrichedLoans} envelopes={enriched} />
      </div>
    </div>
  )
}
