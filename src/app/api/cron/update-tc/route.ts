import { refreshExchangeRate } from '@/lib/exchange-rate'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const rate = await refreshExchangeRate()
    return Response.json({ ok: true, rate: rate.sell, source: rate.source, date: rate.date })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
