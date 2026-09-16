import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/app/actions/telegram'
import { getDailyFact } from '@/lib/dailyFacts'

export async function GET(req: Request) {
  // Protect: only Vercel Cron or requests with CRON_SECRET
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()

  // All users with active Telegram config
  const { data: configs } = await admin
    .from('user_telegram_config')
    .select('user_id, chat_id')
    .eq('is_active', true)

  if (!configs || configs.length === 0) return Response.json({ sent: 0 })

  let sent = 0

  for (const { user_id, chat_id } of configs) {
    const fact = await getDailyFact(user_id)
    if (!fact) continue

    const text = `${fact.emoji} *Dato del día — FiReOracle*\n\n${fact.text}`
    const err = await sendTelegramMessage(chat_id, text)
    if (!err) sent++
  }

  return Response.json({ sent, total: configs.length })
}
