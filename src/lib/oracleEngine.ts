import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { ORACLE_TOOLS, executeOracleTool } from '@/lib/oracleTools'

const anthropic = new Anthropic()

// Caps the tool-call back-and-forth per user message. Each round is one
// non-streamed model call plus (fast) DB queries — this bounds worst-case
// latency/cost while still allowing the model to chain a couple of lookups
// (e.g. list categories, then drill into one). Lowered from 5: most real
// questions resolve in 1-2 tool calls, and every extra round re-sends the
// growing conversation on top of the (cached, but not free) system prompt.
const MAX_TOOL_ROUNDS = 3

export type OracleMessage = { role: 'user' | 'assistant'; content: string }

function buildSystemPrompt(context: string): string {
  return `Eres FiReOracle, un asistente financiero personal especializado en la metodología FIRE (Financial Independence, Retire Early). Analizas las finanzas reales del usuario, que vive en Costa Rica y trabaja con colones costarricenses (CRC).

Eres directo, preciso y accionable. Usas números reales para respaldar tus observaciones. No das consejos genéricos — siempre te basas en los datos específicos del usuario.

CONTEXTO FINANCIERO ACTUAL DEL USUARIO:
${context}

HERRAMIENTAS (tools):
Tenés acceso a query_transactions y get_monthly_category_totals para consultar la base de datos real en vivo — el contexto de arriba es un resumen agregado de los últimos 12-24 meses, no contiene el detalle transacción por transacción.
- Si el usuario pregunta POR QUÉ una categoría subió, bajó, o tuvo un mes raro, NO respondas con una hipótesis genérica ni inventes qué transacción lo causó. Llamá get_monthly_category_totals con el category_code exacto (está en el catálogo del contexto) y citá la transacción real (fecha, monto, concepto) que aparece en "outliers" o en los totales mensuales.
- Si necesitás verificar un monto puntual, buscar una compra específica, o el usuario pide "el detalle de X", usá query_transactions.
- Si un total del contexto no cuadra con lo que el usuario dice recordar, preferí verificar con una tool antes de asumir que el usuario está equivocado.
- No llames a las tools para preguntas que el contexto ya responde directamente (KPIs, totales de 12m, FIRE number, etc.) —úsalas solo cuando necesites detalle que el contexto no tiene.

INSTRUCCIONES GENERALES:
- Responde en español (Costa Rica)
- Usa ₡ para colones y $ para dólares
- Cuando hagas cálculos, muéstralos brevemente
- Sé conciso pero completo
- Si algo parece una oportunidad o riesgo, señálalo claramente
- No inventes datos — solo usa los que están en el contexto o los que trajiste con una tool
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
- El gráfico se inserta en el flujo del texto donde lo coloques
- Si el gráfico se basa en datos que trajiste con una tool, usá EXACTAMENTE esos valores — no los redondees ni completes puntos que no verificaste`
}

// Single source of truth for the Oracle tool-calling loop — used by both the
// web chat (/api/oracle/route.ts, which streams the result back in chunks)
// and the Telegram webhook (which sends it as one or more plain messages).
// Keeping this in one place means a channel can't quietly get a weaker or
// stale version of the engine.
export async function runOracleEngine(
  userId: string,
  messages: OracleMessage[],
  context: string,
): Promise<string> {
  const admin = createAdminClient()
  const systemPrompt = buildSystemPrompt(context)

  // Prompt caching: the financial context is the single biggest cost driver
  // (several KB re-sent on every tool-calling round, and on every message in
  // a conversation, at full price). Marking it as an ephemeral 1h cache
  // breakpoint means only the FIRST call within that hour pays full price —
  // every round after that (and every follow-up message within the hour, on
  // Telegram or the web) reads it back at ~10% of the normal input cost.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral', ttl: '1h' } },
  ]

  const convo: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }))
  let finalText = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const forceFinal = round === MAX_TOOL_ROUNDS - 1
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemBlocks,
      messages: convo,
      ...(forceFinal ? {} : { tools: ORACLE_TOOLS }),
    })

    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    )
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    )

    if (forceFinal || response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
      finalText = textBlocks.map(b => b.text).join('\n')
      break
    }

    convo.push({ role: 'assistant', content: response.content })

    const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
      const result = await executeOracleTool(admin, userId, block.name, block.input as Record<string, unknown>)
      return {
        type: 'tool_result' as const,
        tool_use_id: block.id,
        content: JSON.stringify(result),
      }
    }))
    convo.push({ role: 'user', content: toolResults })
  }

  return finalText
}
