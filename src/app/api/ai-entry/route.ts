import Anthropic, { toFile } from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import type { ImageBlockParam, DocumentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages'

const anthropic = new Anthropic()

type Category = {
  code: string
  name: string
  category_type: string
  is_passive_income: boolean
  is_survival_expense: boolean
  is_settlement: boolean
}

type Envelope = {
  id: string
  name: string
  custodio: string
}

type ConvMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json() as {
    messages: ConvMessage[]
    fileData?: string   // base64 of file (no data-URL prefix)
    fileType?: string   // MIME type
    categories: Category[]
    envelopes: Envelope[]
  }

  if (!body.messages?.length) return new Response('Bad request', { status: 400 })

  const today = new Date().toISOString().slice(0, 10)

  const catLines = (body.categories ?? [])
    .map(c => {
      const flags = [
        c.is_passive_income   ? 'ingreso_pasivo' : '',
        c.is_survival_expense ? 'supervivencia'  : '',
        c.is_settlement       ? 'liquidacion'    : '',
      ].filter(Boolean).join(', ')
      return `${c.code} (${c.category_type}): ${c.name}${flags ? ` [${flags}]` : ''}`
    })
    .join('\n')

  const envLines = (body.envelopes ?? [])
    .map(e => `${e.id}: ${e.custodio} › ${e.name}`)
    .join('\n')

  const systemPrompt = `Sos un asistente de entrada de datos financieros para un usuario en Costa Rica (moneda base: CRC ₡). Extraés datos de transacciones desde texto libre, imágenes de recibos o PDFs.

HOY: ${today}

TIPOS DE TRANSACCIÓN:
- gasto: Compra o gasto
- ingreso: Ingreso recibido
- ahorro: Aporte a sobre/inversión específica

CATEGORÍAS DISPONIBLES:
${catLines || '(ninguna cargada)'}

SOBRES DISPONIBLES (solo para tipo ahorro):
${envLines || '(ninguno)'}

REGLAS:
- Montos siempre en CRC salvo que el documento sea claramente en USD
- Fechas en YYYY-MM-DD; si no está en el input, usá ${today}
- El campo "vendor" es el nombre del comercio o pagador
- El campo "concept" es una descripción corta del motivo (ej: "Almuerzo", "Salario")
- Elegí la category_code de la lista; si ninguna aplica, omitilo
- Hacé máximo UNA pregunta si algo crítico es ambiguo; nunca hagas múltiples preguntas

FORMATO — respondé SOLO con JSON sin texto adicional:

Cuando tenés datos suficientes:
{"status":"complete","fields":{"type":"gasto","date":"${today}","amount":15000,"currency":"CRC","vendor":"Spoon","concept":"Almuerzo","category_code":"FOOD_OUT","is_passive_income":false,"is_settlement":false,"is_survival_expense":false}}

Cuando necesitás UNA aclaración:
{"status":"question","question":"¿Ese pago en PriceSmart fue por comestibles o artículos del hogar?","partial":{"amount":26500,"vendor":"PriceSmart","type":"gasto"}}`

  // Build messages array for Anthropic
  const anthropicMessages: Anthropic.MessageParam[] = body.messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  // If file provided, attach it to the FIRST user message for full conversation context
  if (body.fileData && body.fileType) {
    const firstUserIdx = anthropicMessages.findIndex(m => m.role === 'user')
    if (firstUserIdx >= 0) {
      const textContent = typeof anthropicMessages[firstUserIdx].content === 'string'
        ? (anthropicMessages[firstUserIdx].content as string)
        : ''

      if (body.fileType.startsWith('image/')) {
        const imgBlock: ImageBlockParam = {
          type: 'image',
          source: {
            type: 'base64',
            media_type: body.fileType as ImageBlockParam['source'] extends { media_type: infer T } ? T : never,
            data: body.fileData,
          },
        }
        anthropicMessages[firstUserIdx] = {
          role: 'user',
          content: [imgBlock, { type: 'text', text: textContent || 'Analizá esta imagen y extraé los datos de la transacción.' }],
        }
      } else if (body.fileType === 'application/pdf') {
        const docBlock: DocumentBlockParam = {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: body.fileData,
          },
        }
        anthropicMessages[firstUserIdx] = {
          role: 'user',
          content: [docBlock, { type: 'text', text: textContent || 'Analizá este PDF y extraé los datos de la transacción.' }],
        }
      }
    }
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemPrompt,
    messages: anthropicMessages,
  })

  const rawText = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

  try {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return Response.json(parsed)
    }
  } catch {
    // fall through to error
  }

  return Response.json({ status: 'error', message: 'No se pudo interpretar la respuesta' }, { status: 422 })
}
