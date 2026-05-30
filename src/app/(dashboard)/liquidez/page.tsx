import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { EnvelopeSection } from './EnvelopeSection'

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

export default async function LiquidezPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: envelopes } = await admin
    .from('savings_envelopes')
    .select('id, name, custodio, color, sort_order, interest_mode, annual_rate')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('sort_order')

  const { data: movements } = await admin
    .from('envelope_movements')
    .select('envelope_id, amount')
    .eq('user_id', user.id)

  const balanceMap: Record<string, number> = {}
  for (const m of movements ?? []) {
    balanceMap[m.envelope_id] = (balanceMap[m.envelope_id] ?? 0) + Number(m.amount)
  }

  const enriched: Envelope[] = (envelopes ?? []).map(e => ({
    ...e,
    balance: balanceMap[e.id] ?? 0,
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
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <EnvelopeSection envelopes={enriched} />
    </div>
  )
}
