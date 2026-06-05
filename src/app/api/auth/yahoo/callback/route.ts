import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function getAppUrl() {
  if (process.env.APP_URL) return process.env.APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const base = getAppUrl()
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${base}/movimientos?yahoo=error&reason=${encodeURIComponent(error)}`)
  }

  const savedState = req.cookies.get('yahoo_oauth_state')?.value
  if (!state || state !== savedState) {
    return NextResponse.redirect(`${base}/movimientos?yahoo=error&reason=invalid_state`)
  }
  if (!code) {
    return NextResponse.redirect(`${base}/movimientos?yahoo=error&reason=no_code`)
  }

  // Exchange code for tokens
  // Yahoo requires Basic auth with client_id:client_secret base64-encoded
  const credentials = Buffer.from(
    `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
  ).toString('base64')

  const tokenRes = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      code,
      redirect_uri:  `${base}/api/auth/yahoo/callback`,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    console.error('Yahoo token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${base}/movimientos?yahoo=error&reason=token_exchange`)
  }

  const tokens = await tokenRes.json() as {
    access_token:   string
    refresh_token?: string
    expires_in:     number
    token_type:     string
    xoauth_yahoo_guid?: string
  }

  if (!tokens.refresh_token) {
    return NextResponse.redirect(`${base}/movimientos?yahoo=error&reason=no_refresh_token`)
  }

  // Get Yahoo email address from userinfo
  let yahooEmail = ''
  const userinfoRes = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (userinfoRes.ok) {
    const info = await userinfoRes.json() as { email?: string; name?: string }
    yahooEmail = info.email ?? ''
  }

  if (!yahooEmail) {
    return NextResponse.redirect(`${base}/movimientos?yahoo=error&reason=no_email`)
  }

  // Upsert into connected_email_accounts
  await createAdminClient()
    .from('connected_email_accounts')
    .upsert(
      {
        user_id:       user.id,
        email:         yahooEmail,
        provider:      'yahoo',
        refresh_token: tokens.refresh_token,
        connected_at:  new Date().toISOString(),
      },
      { onConflict: 'user_id,email' }
    )

  const response = NextResponse.redirect(`${base}/movimientos?yahoo=connected`)
  response.cookies.delete('yahoo_oauth_state')
  return response
}
