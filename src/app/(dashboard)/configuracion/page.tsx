import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SetupWizard } from './SetupWizard'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_done, display_name, monthly_income, savings_goal_pct, main_currency')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
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
  )
}
