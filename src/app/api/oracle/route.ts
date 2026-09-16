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

  const finalText = await runOracleEngine(user.id, messages, context)

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
