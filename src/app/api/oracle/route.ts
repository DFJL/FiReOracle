import { createClient } from '@/lib/supabase/server'
import { runOracleEngine, type OracleMessage } from '@/lib/oracleEngine'

// The tool-calling loop can take a while (several model round-trips + DB
// queries) — extend past the default 10s to the Hobby-plan ceiling.
export const maxDuration = 60

export async function POST(req: Request) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, context } = await req.json() as {
    messages: OracleMessage[]
    context: string
  }

  if (!messages?.length) return new Response('Bad request', { status: 400 })

  let finalText: string
  try {
    finalText = await runOracleEngine(user.id, messages, context)
  } catch (err) {
    console.error('Oracle engine error:', err)
    return new Response(
      'Tuve un problema respondiendo tu pregunta. Puede ser un error temporal del servicio de IA — probá de nuevo en un rato.',
      { status: 502 },
    )
  }

  // The response was already generated in full (possibly after several tool
  // round-trips) — chunk it back out so the existing client-side incremental
  // renderer keeps working without changes.
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const CHUNK = 48
      for (let i = 0; i < finalText.length; i += CHUNK) {
        controller.enqueue(encoder.encode(finalText.slice(i, i + CHUNK)))
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
