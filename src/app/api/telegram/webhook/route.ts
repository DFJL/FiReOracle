// Telegram webhook — bot replies to any message with the sender's chat_id
// so users can copy it and paste it in the app settings.

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
  if (!msg) return new Response('ok')

  const chatId   = msg.chat.id
  const name     = msg.from?.first_name ?? 'ahí'
  const replyText =
    `👋 Hola ${name}\\!\n\n` +
    `Tu *Chat ID* es:\n\`${chatId}\`\n\n` +
    `Copialo y pegalo en *FiReOracle → Configuración → Notificaciones Telegram*\\.`

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'MarkdownV2' }),
  })

  return new Response('ok')
}
