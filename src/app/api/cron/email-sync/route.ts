import { createAdminClient } from '@/lib/supabase/admin'
import { refreshGmailAccessToken, syncGmailAccount } from '@/lib/gmail-sync'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()

  const { data: accounts } = await admin
    .from('connected_email_accounts')
    .select('id, email, user_id, refresh_token, provider')
    .eq('provider', 'gmail')

  if (!accounts || accounts.length === 0) {
    return Response.json({ synced: 0, inserted: 0 })
  }

  const today = new Date().toISOString().slice(0, 10)
  let totalInserted = 0
  const results: { email: string; found: number; inserted: number; error?: string }[] = []

  for (const account of accounts) {
    const accessToken = await refreshGmailAccessToken(account.refresh_token)
    if (!accessToken) {
      results.push({ email: account.email, found: 0, inserted: 0, error: 'Token inválido' })
      console.error(`[email-sync] Token inválido para ${account.email}`)
      continue
    }
    try {
      const { found, inserted } = await syncGmailAccount(accessToken, account.user_id, account.id, admin, today)
      totalInserted += inserted
      results.push({ email: account.email, found, inserted })
    } catch (err) {
      console.error(`[email-sync] Error en ${account.email}:`, err)
      results.push({ email: account.email, found: 0, inserted: 0, error: String(err) })
    }
  }

  console.log(`[email-sync] Cron completado: ${totalInserted} nuevos de ${accounts.length} cuentas`)
  return Response.json({ synced: accounts.length, inserted: totalInserted, accounts: results })
}
