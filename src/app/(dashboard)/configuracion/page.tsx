import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { SetupWizard } from './SetupWizard'
import { EnvelopeManager } from './EnvelopeManager'
import { BucketManager } from './BucketManager'
import { FireConfigManager } from './FireConfigManager'
import { TelegramManager } from './TelegramManager'
import { PaymentRemindersManager } from './PaymentRemindersManager'
import { getPaymentReminders, suggestPaymentReminders } from '@/app/actions/inbox'
import { getTelegramConfig } from '@/app/actions/telegram'

function Section({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">{label}</p>
        {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [
    { data: profile },
    { data: envelopes },
    { data: buckets },
    { data: accounts },
    { data: fireConfig },
    { data: loans },
    telegramConfig,
    paymentReminders,
    reminderSuggestions,
  ] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('onboarding_done, display_name, monthly_income, savings_goal_pct, main_currency')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin.from('savings_envelopes')
      .select('id, name, custodio, color, annual_rate, sort_order, envelope_type')
      .eq('user_id', user.id).eq('is_active', true).order('sort_order'),
    admin.from('user_investment_buckets')
      .select('id, bucket_type, name, industry, color, vendors, concept_map, account_id, sort_order')
      .eq('user_id', user.id).eq('is_active', true).order('sort_order'),
    admin.from('financial_accounts')
      .select('id, name, account_type, currency_code')
      .eq('user_id', user.id).eq('is_active', true).order('name'),
    admin.from('user_financial_config')
      .select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('loans')
      .select('id, name, payment_day, currency_code')
      .eq('user_id', user.id).eq('is_active', true).order('sort_order'),
    getTelegramConfig(),
    getPaymentReminders(),
    suggestPaymentReminders(),
  ])

  return (
    <>
      <SetupWizard
        userEmail={user.email ?? ''}
        existing={profile ? {
          display_name:      profile.display_name ?? '',
          monthly_income:    profile.monthly_income?.toString() ?? '',
          savings_goal_pct:  profile.savings_goal_pct?.toString() ?? '20',
          main_currency:     profile.main_currency ?? 'CRC',
          onboarding_done:   profile.onboarding_done ?? false,
        } : undefined}
      />

      <div className="px-4 md:px-6 pb-12 max-w-xl mx-auto space-y-10">

        {/* ── 1. Perfil & FIRE ─────────────────────── */}
        <Section label="Perfil & FIRE" sub="Parámetros iniciales — actualizalos cuando cambien tus metas o ingresos.">
          <FireConfigManager existing={fireConfig ?? null} />
        </Section>

        {/* ── 2. Alertas & Recordatorios ───────────── */}
        <div className="border-t border-white/[0.06] pt-8 space-y-8">
          <Section label="Alertas & Recordatorios" sub="Notificaciones y pagos recurrentes — mantenimiento regular.">

            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-zinc-400">Telegram</p>
              <TelegramManager initial={telegramConfig} />
            </div>

            <div className="space-y-1.5 pt-2 border-t border-white/[0.04]">
              <p className="text-[10px] font-bold text-zinc-400">Recordatorios de pago</p>
              <PaymentRemindersManager
                initialReminders={paymentReminders}
                loans={loans ?? []}
                suggestions={reminderSuggestions}
              />
            </div>

          </Section>
        </div>

        {/* ── 3. Módulos ───────────────────────────── */}
        <div className="border-t border-white/[0.06] pt-8 space-y-10">
          <Section label="Módulos" sub="Setup de instrumentos financieros — configuración inicial, rara vez cambia.">

            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-zinc-400">Liquidez — Sobres</p>
              <EnvelopeManager envelopes={envelopes ?? []} />
            </div>

            <div className="space-y-1.5 pt-2 border-t border-white/[0.04]">
              <p className="text-[10px] font-bold text-zinc-400">Portafolio — Cubetas de inversión</p>
              <BucketManager buckets={buckets ?? []} accounts={accounts ?? []} />
            </div>

          </Section>
        </div>

      </div>
    </>
  )
}
