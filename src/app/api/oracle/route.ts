import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

export async function POST(req: Request) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, context } = await req.json() as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    context: string
  }

  if (!messages?.length) return new Response('Bad request', { status: 400 })

  const systemPrompt = `Eres FiReOracle, un asistente financiero personal especializado en la metodología FIRE (Financial Independence, Retire Early). Analizas las finanzas reales del usuario, que vive en Costa Rica y trabaja con colones costarricenses (CRC).

Eres directo, preciso y accionable. Usas números reales para respaldar tus observaciones. No das consejos genéricos — siempre te basas en los datos específicos del usuario.

CONTEXTO FINANCIERO ACTUAL DEL USUARIO:
${context}

INSTRUCCIONES GENERALES:
- Responde en español (Costa Rica)
- Usa ₡ para colones y $ para dólares
- Cuando hagas cálculos, muéstralos brevemente
- Sé conciso pero completo
- Si algo parece una oportunidad o riesgo, señálalo claramente
- No inventes datos — solo usa los que están en el contexto
- Podés usar markdown: **negrita**, tablas, listas, encabezados ##

GRÁFICOS (solo cuando el usuario los pide explícitamente o cuando una visualización aportaría mucho valor):
Para insertar un gráfico de barras usa exactamente este formato:
<chart type="bar" title="Título aquí">
[{"label":"Etiqueta 1","value":123456},{"label":"Etiqueta 2","value":78900}]
</chart>

Para un gráfico de línea (series temporales):
<chart type="line" title="Título aquí">
[{"label":"Ene 24","value":150000},{"label":"Feb 24","value":180000}]
</chart>

Reglas de gráficos:
- Valores siempre como número sin formato (sin ₡, sin comas)
- Máximo 12 puntos por gráfico
- Solo tipos "bar" o "line"
- El gráfico se inserta en el flujo del texto donde lo coloques`

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
