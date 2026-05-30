import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SetupWizard } from './SetupWizard'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // If already onboarded, show a simple "already done" state
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_done, display_name, monthly_income, savings_goal_pct, main_currency')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.onboarding_done) {
    // TODO: show editable settings page
    // For now redirect to resumen — will build full settings later
    redirect('/resumen')
  }

  return <SetupWizard userEmail={user.email ?? ''} />
}
