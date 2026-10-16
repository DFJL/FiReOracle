import { syncCryptoFundedInvestments } from '@/app/actions/cryptoSync'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await syncCryptoFundedInvestments()
  if (result.error) console.error('[sync-crypto-investments] Error:', result.error)

  return Response.json(result)
}
