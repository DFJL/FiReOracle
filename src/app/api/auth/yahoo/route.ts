import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function getAppUrl() {
  if (process.env.APP_URL) return process.env.APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  if (!process.env.YAHOO_CLIENT_ID || !process.env.YAHOO_CLIENT_SECRET) {
    return NextResponse.redirect(`${getAppUrl()}/movimientos?yahoo=error&reason=not_configured`)
  }

  const state = crypto.randomUUID()
  const redirectUri = `${getAppUrl()}/api/auth/yahoo/callback`

  const params = new URLSearchParams({
    client_id:     process.env.YAHOO_CLIENT_ID!,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'mail-r openid profile email',
    state,
  })

  const response = NextResponse.redirect(
    `https://api.login.yahoo.com/oauth2/request_auth?${params}`
  )
  response.cookies.set('yahoo_oauth_state', state, {
    httpOnly: true,
    maxAge:   600,
    path:     '/',
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
  })
  return response
}
