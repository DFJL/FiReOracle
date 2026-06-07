import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { SetupWizard } from './SetupWizard'
import { EnvelopeManager } from './EnvelopeManager'
import { BucketManager } from './BucketManager'
import { FireConfigManager } from './FireConfigManager'
import { TelegramManager } from './TelegramManager'
import { getTelegramConfig } from '@/app/actions/telegram'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: envelopes }, { data: buckets }, { data: accounts }, { data: fireConfig }, telegramConfig] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('onboarding_done, display_name, monthly_income, savings_goal_pct, main_currency')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('savings_envelopes')
      .select('id, name, custodio, color, annual_rate, sort_order')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('user_investment_buckets')
      .select('id, bucket_type, name, industry, color, vendors, concept_map, account_id, sort_order')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('financial_accounts')
      .select('id, name, account_type')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
    admin
      .from('user_financial_config')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    getTelegramConfig(),
  ])

  return (
    <>
      <SetupWizard
        userEmail={user.email ?? ''}
        existing={
          profile
            ? {
                display_name: profile.display_name ?? '',
                monthly_income: profile.monthly_income?.toString() ?? '',
                savings_goal_pct: profile.savings_goal_pct?.toString() ?? '20',
                main_currency: profile.main_currency ?? 'CRC',
                onboarding_done: profile.onboarding_done ?? false,
              }
            : undefined
        }
      />

      <div className="px-6 pb-10 max-w-xl mx-auto space-y-10">

        <div className="border-t border-white/[0.06] pt-8">
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-1">
            Parámetros FIRE &amp; Umbrales
          </p>
          <p className="text-xs text-zinc-600 mb-4">Configura tu número FIRE, tasas y semáforos. Todos los módulos usan estos valores.</p>
          <FireConfigManager existing={fireConfig ?? null} />
        </div>

        <div className="border-t border-white/[0.06] pt-8">
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-1">
            Notificaciones Telegram
          </p>
          <p className="text-xs text-zinc-600 mb-4">
            Recibí recordatorios de pago directamente en tu cel aunque la app esté cerrada.
          </p>
          <TelegramManager initial={telegramConfig} />
        </div>

        <div className="border-t border-white/[0.06] pt-8">
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-4">
            Módulo de Liquidez
          </p>
          <EnvelopeManager envelopes={envelopes ?? []} />
        </div>

        <div className="border-t border-white/[0.06] pt-8">
          <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-4">
            Módulo de Portafolio
          </p>
          <BucketManager
            buckets={buckets ?? []}
            accounts={accounts ?? []}
          />
        </div>
      </div>
    </>
  )
}
