import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ImapFlow } from 'imapflow'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const EXTRACTION_SYSTEM = `Sos un extractor de datos de correos de notificación bancaria de Costa Rica.
Analizás el asunto y cuerpo del correo y extraés los datos de la transacción.
Bancos soportados: BAC Costa Rica, Banco Nacional (BNCR), BCR, Scotiabank, SINPE Móvil.
HOY: __TODAY__
REGLAS:
- Montos en CRC salvo que el correo diga explícitamente USD
- Fechas en YYYY-MM-DD; si no hay fecha en el correo, usá la fecha del correo o hoy
- vendor = nombre del comercio, persona o banco
- concept = descripción corta
- movement_type: "expense" para débitos/compras, "income" para créditos/depósitos/SINPE recibido, "cash_withdrawal" para retiros
- confidence: "high", "medium", o "low"
FORMATO — respondé SOLO con JSON:
{"amount":15000,"currency":"CRC","vendor":"Walmart","concept":"Compra supermercado","date":"2026-06-01","movement_type":"expense","category_code":"FOOD_MARKET","confidence":"high"}
Si no podés extraer datos de transacción: {"skip":true,"reason":"No es notificación de transacción"}`

// Bank sender patterns to filter in Yahoo Mail
const BANK_FROM_PATTERNS = [
  'baccredomatic',
  'bancobcr',
  'bncr.fi.cr',
  'scotiabank',
  'bcr.fi.cr',
  'sinpe',
]

async function refreshYahooToken(refreshToken: string): Promise<string | null> {
  const credentials = Buffer.from(
    `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) return null
  const data = await res.json() as { access_token?: string }
  return data.access_token ?? null
}

function isBankEmail(from: string, subject: string): boolean {
  const haystack = `${from} ${subject}`.toLowerCase()
  if (BANK_FROM_PATTERNS.some(p => haystack.includes(p))) return true
  const subjectLC = subject.toLowerCase()
  return (
    subjectLC.includes('transacci') ||
    subjectLC.includes('aviso') ||
    subjectLC.includes('débito') ||
    subjectLC.includes('crédito') ||
    subjectLC.includes('sinpe') ||
    subjectLC.includes('compra') ||
    subjectLC.includes('retiro') ||
    subjectLC.includes('depósito')
  )
}

export async function POST(req: Request) {
  const { accountId } = await req.json() as { accountId: string }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()

  const { data: account } = await admin
    .from('connected_email_accounts')
    .select('email, refresh_token')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .eq('provider', 'yahoo')
    .single()

  if (!account) return Response.json({ error: 'Cuenta no encontrada' }, { status: 404 })

  const accessToken = await refreshYahooToken(account.refresh_token)
  if (!accessToken) return Response.json({ error: 'Token inválido — reconectá la cuenta' }, { status: 401 })

  // Connect via IMAP with OAuth2
  const client = new ImapFlow({
    host:   'imap.mail.yahoo.com',
    port:   993,
    secure: true,
    auth:   { user: account.email, accessToken },
    logger: false,
  })

  let found = 0
  let inserted = 0
  const today = new Date().toISOString().slice(0, 10)
  const system = EXTRACTION_SYSTEM.replace('__TODAY__', today)
  const since = new Date()
  since.setDate(since.getDate() - 90)

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    // Search for emails in the last 90 days
    const searchResult = await client.search({ since })
    const uids = Array.isArray(searchResult) ? searchResult : []
    found = uids.length

    if (uids.length === 0) {
      await client.logout()
      return Response.json({ found: 0, inserted: 0 })
    }

    // Fetch message details for all matching UIDs
    for await (const msg of client.fetch(uids, {
      uid:      true,
      envelope: true,
      source:   true,
    })) {
      try {
        const msgId    = `yahoo_${account.email}_${msg.uid}`
        const subject  = msg.envelope?.subject ?? ''
        const fromAddr = msg.envelope?.from?.[0]?.address ?? ''
        const fromName = msg.envelope?.from?.[0]?.name ?? ''
        const from     = `${fromName} <${fromAddr}>`
        const emailDate = msg.envelope?.date?.toISOString() ?? new Date().toISOString()

        if (!isBankEmail(from, subject)) continue

        // Check if already in inbox
        const { data: existing } = await admin
          .from('transaction_inbox')
          .select('id')
          .eq('user_id', user.id)
          .eq('email_id', msgId)
          .maybeSingle()

        if (existing) continue

        // Get plain text body
        let body = ''
        if (msg.source) {
          const raw = msg.source.toString('utf-8')
          // Extract text/plain from raw email
          const plainMatch = raw.match(/Content-Type: text\/plain[^\n]*\n(?:[^\n]*\n)*\n([\s\S]*?)(?=\n--|\z)/)
          if (plainMatch) {
            body = plainMatch[1]
              .replace(/=\r?\n/g, '')  // quoted-printable line continuations
              .replace(/=[0-9A-F]{2}/gi, c => String.fromCharCode(parseInt(c.slice(1), 16)))
              .slice(0, 2000)
          } else {
            // Fallback: strip all headers and use rest
            body = raw.replace(/^[\s\S]*?\n\n/, '').replace(/<[^>]+>/g, ' ').slice(0, 2000)
          }
        }

        const content = [
          subject ? `Asunto: ${subject}` : '',
          from    ? `De: ${from}` : '',
          body    ? `Cuerpo:\n${body}` : '',
        ].filter(Boolean).join('\n\n')

        if (!content.trim()) continue

        const aiRes = await anthropic.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system,
          messages:   [{ role: 'user', content }],
        })

        const raw_ai = aiRes.content[0]?.type === 'text' ? aiRes.content[0].text.trim() : ''
        let extracted: Record<string, unknown> | null = null
        try {
          const match = raw_ai.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0]) as Record<string, unknown>
            if (!parsed.skip) extracted = parsed
          }
        } catch { /* skip */ }

        await admin.from('transaction_inbox').insert({
          user_id:     user.id,
          email_id:    msgId,
          email_date:  emailDate,
          raw_subject: subject.slice(0, 500),
          raw_snippet: body.slice(0, 500),
          extracted:   extracted as never,
          status:      'pending',
        })
        inserted++
      } catch (err) {
        console.error('Error processing Yahoo message:', err)
      }
    }

    await client.logout()
  } catch (err) {
    console.error('Yahoo IMAP error:', err)
    return Response.json({ error: 'Error conectando a Yahoo Mail — verificá los permisos de la app' }, { status: 502 })
  }

  return Response.json({ found, inserted })
}
