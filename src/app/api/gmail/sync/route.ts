import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshGmailAccessToken, syncGmailAccount } from '@/lib/gmail-sync'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()

  const { data: accounts } = await admin
    .from('connected_email_accounts')
    .select('id, email, refresh_token')
    .eq('user_id', user.id)
    .eq('provider', 'gmail')

  if (!accounts || accounts.length === 0) {
    return Response.json({ error: 'No hay cuentas conectadas' }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  let totalFound = 0
  let totalInserted = 0
  const results: { email: string; found: number; inserted: number; error?: string }[] = []

  for (const account of accounts) {
    const accessToken = await refreshGmailAccessToken(account.refresh_token)
    if (!accessToken) {
      results.push({ email: account.email, found: 0, inserted: 0, error: 'Token inválido' })
      continue
    }
    const { found, inserted } = await syncGmailAccount(accessToken, user.id, account.id, admin, today)
    totalFound    += found
    totalInserted += inserted
    results.push({ email: account.email, found, inserted })
  }

  return Response.json({ found: totalFound, inserted: totalInserted, accounts: results })
}
