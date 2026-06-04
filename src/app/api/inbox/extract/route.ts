import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

const SYSTEM = `Sos un extractor de datos de correos de notificación bancaria de Costa Rica.
Analizás el asunto y cuerpo del correo y extraés los datos de la transacción.

Bancos soportados: BAC Costa Rica, Banco Nacional (BNCR), BCR, Scotiabank, SINPE Móvil, y otros bancos costarricenses.

HOY: __TODAY__

REGLAS:
- Montos en CRC salvo que el correo diga explícitamente USD
- Fechas en YYYY-MM-DD; si no hay fecha en el correo, usá la fecha del correo o hoy
- vendor = nombre del comercio, persona o banco
- concept = descripción corta (ej: "Compra supermercado", "SINPE recibido", "Pago de servicios")
- movement_type: "expense" para débitos/compras, "income" para créditos/depósitos/SINPE recibido, "cash_withdrawal" para retiros de cajero
- confidence: "high" si tenés todos los datos claramente, "medium" si hay algo inferido, "low" si hay ambigüedad

FORMATO — respondé SOLO con JSON:
{
  "amount": 15000,
  "currency": "CRC",
  "vendor": "Walmart",
  "concept": "Compra supermercado",
  "date": "2026-06-01",
  "movement_type": "expense",
  "category_code": "FOOD_MARKET",
  "confidence": "high"
}

Si no podés extraer datos de transacción (ej: correo de marketing, OTP, etc.):
{"skip": true, "reason": "No es notificación de transacción"}`

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { subject, snippet, body } = await req.json() as {
    subject?: string
    snippet?: string
    body?: string
  }

  const today = new Date().toISOString().slice(0, 10)
  const system = SYSTEM.replace('__TODAY__', today)

  const content = [
    subject ? `Asunto: ${subject}` : '',
    snippet ? `Extracto: ${snippet}` : '',
    body    ? `Cuerpo:\n${body.slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n\n')

  if (!content.trim()) return Response.json({ skip: true, reason: 'No content' })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system,
    messages: [{ role: 'user', content }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) return Response.json(JSON.parse(match[0]))
  } catch { /* fall through */ }

  return Response.json({ skip: true, reason: 'Parse error' }, { status: 422 })
}
