// One-time setup: registers the webhook URL with Telegram.
// Call once after deploy: GET /api/telegram/setup-webhook

import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const token  = process.env.TELEGRAM_BOT_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
  if (!token)  return Response.json({ error: 'TELEGRAM_BOT_TOKEN no configurado' }, { status: 503 })
  if (!appUrl) return Response.json({ error: 'NEXT_PUBLIC_APP_URL no configurado' }, { status: 503 })

  const webhookUrl = `https://${appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}/api/telegram/webhook`
  const secret     = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url: webhookUrl, secret_token: secret || undefined }),
    },
  )
  const data = await res.json()
  return Response.json({ webhookUrl, telegram: data })
}
