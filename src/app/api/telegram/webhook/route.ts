// Telegram webhook — two behaviors:
// - Not linked yet (or /start): reply with the sender's chat_id so they can
//   paste it into Configuración → Notificaciones Telegram.
// - Linked: route the message through the same Oracle engine the web chat
//   uses (@/lib/oracleEngine, @/lib/oracleContext), so you can ask Oracle
//   things directly from Telegram, not just receive the daily fact.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/app/actions/telegram'
import { buildOracleContext } from '@/lib/oracleContext'
import { runOracleEngine, type OracleMessage } from '@/lib/oracleEngine'
import { toTelegramText, chunkForTelegram } from '@/lib/telegramFormat'

// Oracle's tool-calling loop can take a while (several model round-trips +
// DB queries) — extend past the default 10s to the Hobby-plan ceiling.
export const maxDuration = 60

// Keeps roughly the last ~5 exchanges per chat — enough for follow-up
// questions ("¿y en marzo?") without paying (uncached) history tokens on
// every message as the conversation grows.
const MAX_HISTORY = 10

export async function POST(req: Request) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return new Response('Bot not configured', { status: 503 })

  const update = await req.json() as {
    message?: {
      chat: { id: number }
      from?: { first_name?: string }
      text?: string
    }
  }

  const msg = update.message
  if (!msg?.text) return new Response('ok')

  const chatId = String(msg.chat.id)
  const text   = msg.text.trim()
  const admin  = createAdminClient()

  const { data: config } = text === '/start'
    ? { data: null }
    : await admin
        .from('user_telegram_config')
        .select('user_id, oracle_history')
        .eq('chat_id', chatId)
        .eq('is_active', true)
        .maybeSingle()

  if (!config) {
    // Not linked yet (or /start) — onboarding reply, unchanged from before
    // Oracle could talk back here.
    const name = msg.from?.first_name ?? 'ahí'
    const replyText =
      `👋 Hola ${name}\\!\n\n` +
      `Tu *Chat ID* es:\n\`${chatId}\`\n\n` +
      `Copialo y pegalo en *FiReOracle → Configuración → Notificaciones Telegram*\\.\n\n` +
      `Una vez vinculado, podés preguntarme lo que quieras sobre tus finanzas directamente acá\\.`

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'MarkdownV2' }),
    })
    return new Response('ok')
  }

  const history = Array.isArray(config.oracle_history) ? (config.oracle_history as unknown as OracleMessage[]) : []
  const nextMessages: OracleMessage[] = [...history, { role: 'user', content: text }]

  // If anything here throws (Anthropic API error, DB error, etc.), the user
  // must still get SOME reply — silently swallowing it left them staring at
  // a chat that "doesn't respond" with no indication anything went wrong.
  try {
    const context  = await buildOracleContext(config.user_id)
    const replyRaw = await runOracleEngine(config.user_id, nextMessages, context)

    const updatedHistory = [...nextMessages, { role: 'assistant' as const, content: replyRaw }].slice(-MAX_HISTORY)
    await admin.from('user_telegram_config').update({ oracle_history: updatedHistory }).eq('chat_id', chatId)

    const replyText = toTelegramText(replyRaw) || 'No pude generar una respuesta esta vez — probá reformular la pregunta.'
    for (const chunk of chunkForTelegram(replyText)) {
      await sendTelegramMessage(chatId, chunk, null)
    }
  } catch (err) {
    console.error('Oracle Telegram error:', err)
    await sendTelegramMessage(
      chatId,
      '⚠️ Tuve un problema respondiendo tu pregunta. Puede ser un error temporal del servicio de IA — probá de nuevo en un rato.',
      null,
    )
  }

  return new Response('ok')
}
