import Anthropic, { toFile } from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import type { ImageBlockParam, DocumentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages'
import { lookupConcept } from '@/lib/concept-catalog'

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
- Preferí siempre la categoría más ESPECÍFICA disponible sobre una genérica tipo "Ingreso Pasivo" u "Otros ingresos" — ej: un rendimiento de un fondo de inversión o protocolo crypto conocido va en su categoría de rendimientos específica, no en la genérica, aunque ambas parezcan aplicar
- Hacé máximo UNA pregunta si algo crítico es ambiguo; nunca hagas múltiples preguntas

RECIBOS/FACTURAS CON VARIOS ÍTEMS: cuando la imagen/PDF es un recibo o
factura con una lista de productos/servicios claramente distintos y con
precio propio cada uno (ej: recibo de supermercado, farmacia, ferretería,
factura de compra con desglose) — NO lo conviertas en un solo gasto
genérico como "Supermercado". Extraé CADA ítem por separado con su propia
category_code (ej: leche/queso → FOOD_SUPER, shampoo/jabón → PERSONAL_CARE,
medicamento → HEALTH_MEDS), agrupando ítems idénticos o de la misma
categoría si son muchas líneas repetidas. NO uses este modo para un gasto
de un solo concepto (restaurante con un total, gasolina, una suscripción,
una factura de servicios) aunque tenga impuestos o cargos desglosados —
esos siguen siendo "complete" normal.

FORMATO — respondé SOLO con JSON sin texto adicional:

Cuando tenés datos suficientes para UN solo gasto/ingreso:
{"status":"complete","fields":{"type":"gasto","date":"${today}","amount":15000,"currency":"CRC","vendor":"Spoon","concept":"Almuerzo","category_code":"FOOD_OUT","is_passive_income":false,"is_settlement":false,"is_survival_expense":false}}

Cuando es un recibo/factura con varios ítems distintos:
{"status":"multi","vendor":"AutoMercado","date":"${today}","total":45230,"currency":"CRC","items":[{"concept":"Leche + lácteos","amount":8500,"category_code":"FOOD_SUPER"},{"concept":"Shampoo","amount":4200,"category_code":"PERSONAL_CARE"}]}

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
    max_tokens: 2048,
    system: systemPrompt,
    messages: anthropicMessages,
  })

  const rawText = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

  try {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])

      // The model picks category_code by reasoning over category names/flags
      // alone, with no concept↔category ground truth — it can (and did, per
      // a recent data audit) default to a generic catch-all like "Ingreso
      // Pasivo" for a concept that has an exact, more specific match in the
      // catalog the manual entry form already uses (e.g. "Rendimientos Fondo
      // Inversión TRANSCOMER" → INVESTMENT_RETURN). When the catalog has an
      // exact/fuzzy match for this concept, it wins over the model's guess —
      // same source of truth, so AI entry and manual entry never disagree.
      if (parsed?.status === 'complete' && parsed.fields && typeof parsed.fields.concept === 'string') {
        const txType = parsed.fields.type === 'ingreso' ? 'income' : 'expense'
        const hit = lookupConcept(parsed.fields.concept)
        if (hit && hit.type === txType) {
          parsed.fields.category_code = hit.categoryCode
          const cat = (body.categories ?? []).find(c => c.code === hit.categoryCode)
          if (cat) parsed.fields.is_passive_income = cat.is_passive_income
        }
      }

      // Same catalog override, applied per line item for a multi-item receipt.
      if (parsed?.status === 'multi' && Array.isArray(parsed.items)) {
        for (const item of parsed.items) {
          if (typeof item?.concept !== 'string') continue
          const hit = lookupConcept(item.concept)
          if (hit && hit.type === 'expense') item.category_code = hit.categoryCode
        }
      }

      return Response.json(parsed)
    }
  } catch {
    // fall through to error
  }

  return Response.json({ status: 'error', message: 'No se pudo interpretar la respuesta' }, { status: 422 })
}
