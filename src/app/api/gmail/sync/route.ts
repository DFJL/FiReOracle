import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const GMAIL_QUERY =
  'newer_than:90d (' +
  'from:baccredomatic.com OR from:bancobcr.com OR from:bncr.fi.cr OR from:banconal.fi.cr OR ' +
  'from:scotiabankcr.com OR from:bcr.fi.cr OR from:popular.fi.cr OR from:bpdc.fi.cr OR ' +
  'from:davivienda.com OR from:promerica.fi.cr OR from:cathay.fi.cr OR ' +
  '"SINPE Móvil" OR "SINPE movil" OR ' +
  'subject:"Aviso de transaccion" OR subject:"Aviso de transacción" OR ' +
  'subject:"Notificacion" OR subject:"Notificación" OR ' +
  'subject:"Comprobante de Transacción" OR subject:"Comprobante de transaccion" OR ' +
  'subject:"Pago de cuota" OR subject:"Débito automático" OR subject:"Debito automatico"' +
  ')'

const EXTRACTION_SYSTEM = `Sos un extractor de datos de correos de notificación bancaria de Costa Rica.
Analizás el asunto y cuerpo del correo y extraés los datos de la transacción.
Bancos soportados: BAC Credomatic, Banco Nacional (BNCR/BN), BCR, Scotiabank, Banco Popular, Davivienda, Promerica, Banco Cathay, SINPE Móvil.
HOY: __TODAY__
REGLAS:
- Montos en CRC salvo que el correo diga explícitamente USD
- Fechas en YYYY-MM-DD; si no hay fecha en el correo, usá la fecha del correo o hoy
- vendor = nombre del comercio, persona o banco
- concept = descripción corta (ej: "Compra supermercado", "SINPE recibido", "Pago de servicios", "Comprobante BNCR")
- movement_type: "expense" para débitos/compras/pagos de préstamo, "income" para créditos/depósitos/SINPE recibido, "cash_withdrawal" para retiros de cajero
- confidence: "high" si tenés todos los datos claramente, "medium" si hay algo inferido, "low" si hay ambigüedad
CASO ESPECIAL — comprobantes con PDF adjunto (BNCR "BN Contacto Digital", etc.):
Si el correo es claramente bancario pero el monto está en un PDF adjunto y no en el cuerpo,
devolvé lo que podés (fecha del asunto, vendor="Banco Nacional", concept="Comprobante transacción") con amount=0 y confidence="low".
NO uses skip:true para comprobantes bancarios aunque falte el monto.
Usá skip:true SOLO para correos claramente no bancarios: marketing, boletines, estados de cuenta sin transacción, cambios de contraseña.
FORMATO — respondé SOLO con JSON:
{"amount":15000,"currency":"CRC","vendor":"Walmart","concept":"Compra supermercado","date":"2026-06-01","movement_type":"expense","category_code":"FOOD_MARKET","confidence":"high"}
Si no es correo bancario: {"skip":true,"reason":"No es notificación de transacción"}`

type GmailPart = {
  mimeType: string
  filename?: string
  body?: { data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

function findPdfPart(part: GmailPart): GmailPart | null {
  const isPdf = part.mimeType === 'application/pdf' ||
    part.filename?.toLowerCase().endsWith('.pdf')
  if (isPdf && part.body?.attachmentId) return part
  if (part.parts) {
    for (const p of part.parts) {
      const found = findPdfPart(p)
      if (found) return found
    }
  }
  return null
}

async function fetchPdfAttachment(msgId: string, attachmentId: string, accessToken: string): Promise<string | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) return null
  const data = await res.json() as { data?: string }
  if (!data.data) return null
  // base64url → standard base64
  return data.data.replace(/-/g, '+').replace(/_/g, '/')
}

function stripHtml(text: string): string {
  return text
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ').trim()
}

function decodeEmailBody(part: GmailPart): string {
  if (part.body?.data) {
    const raw = Buffer.from(part.body.data, 'base64url').toString('utf-8')
    return part.mimeType === 'text/html' ? stripHtml(raw) : raw
  }
  if (part.parts) {
    const textPart = part.parts.find(p => p.mimeType === 'text/plain')
    if (textPart) return decodeEmailBody(textPart)
    const htmlPart = part.parts.find(p => p.mimeType === 'text/html')
    if (htmlPart) return decodeEmailBody(htmlPart)
    for (const p of part.parts) {
      const body = decodeEmailBody(p)
      if (body) return body
    }
  }
  return ''
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { access_token?: string }
  return data.access_token ?? null
}

async function syncAccount(
  accessToken: string,
  userId: string,
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  today: string,
): Promise<{ found: number; inserted: number }> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(GMAIL_QUERY)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!listRes.ok) return { found: 0, inserted: 0 }

  const listData = await listRes.json() as { messages?: { id: string }[] }
  const messageIds = (listData.messages ?? []).map(m => m.id)
  if (messageIds.length === 0) return { found: 0, inserted: 0 }

  const { data: existing } = await admin
    .from('transaction_inbox')
    .select('email_id')
    .eq('user_id', userId)
    .in('email_id', messageIds)

  const existingIds = new Set((existing ?? []).map(r => r.email_id))
  const newIds = messageIds.filter(id => !existingIds.has(id))

  if (newIds.length === 0) return { found: messageIds.length, inserted: 0 }

  const system = EXTRACTION_SYSTEM.replace('__TODAY__', today)
  let inserted = 0

  for (const msgId of newIds) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!msgRes.ok) continue

      const msg = await msgRes.json() as {
        id: string
        internalDate?: string
        payload?: GmailPart & { headers?: { name: string; value: string }[] }
      }

      const headers   = msg.payload?.headers ?? []
      const subject   = headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? ''
      const from      = headers.find(h => h.name.toLowerCase() === 'from')?.value ?? ''
      const body      = msg.payload ? decodeEmailBody(msg.payload) : ''
      const emailDate = msg.internalDate
        ? new Date(parseInt(msg.internalDate)).toISOString()
        : new Date().toISOString()

      // Fetch PDF only if the body has no monetary amount (data is in the attachment)
      const bodyHasAmount = /(₡|\$|colones?|CRC|USD|monto)\s*[\d,.]+/i.test(body)
      let pdfBase64: string | null = null
      if (msg.payload && !bodyHasAmount) {
        const pdfPart = findPdfPart(msg.payload)
        if (pdfPart?.body?.attachmentId) {
          pdfBase64 = await fetchPdfAttachment(msgId, pdfPart.body.attachmentId, accessToken)
        }
      }

      const textContent = [
        subject ? `Asunto: ${subject}` : '',
        from    ? `De: ${from}` : '',
        body    ? `Cuerpo:\n${body.slice(0, 2000)}` : '',
      ].filter(Boolean).join('\n\n')

      if (!textContent.trim() && !pdfBase64) continue

      type ContentBlock =
        | { type: 'text'; text: string }
        | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

      const userContent: string | ContentBlock[] = pdfBase64
        ? [
            { type: 'text', text: textContent || '(ver PDF adjunto)' },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          ]
        : textContent

      const aiRes = await anthropic.messages.create({
        model:      pdfBase64 ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system,
        messages:   [{ role: 'user', content: userContent as never }],
      })

      const raw = aiRes.content[0]?.type === 'text' ? aiRes.content[0].text.trim() : ''
      let extracted: Record<string, unknown> | null = null
      try {
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed = JSON.parse(match[0]) as Record<string, unknown>
          if (parsed.skip) continue  // Not a transaction — don't insert
          extracted = parsed
        }
      } catch { /* skip */ }

      await admin.from('transaction_inbox').insert({
        user_id:     userId,
        email_id:    msgId,
        email_date:  emailDate,
        raw_subject: subject.slice(0, 500),
        raw_snippet: (pdfBase64 && !body.trim() ? '[datos extraídos del PDF adjunto]' : body.slice(0, 500)),
        extracted:   extracted as never,
        status:      'pending',
      })
      inserted++
    } catch (err) {
      console.error(`Error processing Gmail message ${msgId}:`, err)
    }
  }

  return { found: messageIds.length, inserted }
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()

  const { data: accounts } = await admin
    .from('connected_email_accounts')
    .select('id, email, refresh_token')
    .eq('user_id', user.id)

  if (!accounts || accounts.length === 0) {
    return Response.json({ error: 'No hay cuentas conectadas' }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  let totalFound = 0
  let totalInserted = 0
  const results: { email: string; found: number; inserted: number; error?: string }[] = []

  for (const account of accounts) {
    const accessToken = await refreshAccessToken(account.refresh_token)
    if (!accessToken) {
      results.push({ email: account.email, found: 0, inserted: 0, error: 'Token inválido' })
      continue
    }
    const { found, inserted } = await syncAccount(accessToken, user.id, admin, today)
    totalFound    += found
    totalInserted += inserted
    results.push({ email: account.email, found, inserted })
  }

  return Response.json({ found: totalFound, inserted: totalInserted, accounts: results })
}
