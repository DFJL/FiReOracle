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
    return NextResponse.redirect(`${base}/movimientos?gmail=error&reason=${encodeURIComponent(error)}`)
  }

  const savedState = req.cookies.get('gmail_oauth_state')?.value
  if (!state || state !== savedState) {
    return NextResponse.redirect(`${base}/movimientos?gmail=error&reason=invalid_state`)
  }
  if (!code) {
    return NextResponse.redirect(`${base}/movimientos?gmail=error&reason=no_code`)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  `${base}/api/auth/gmail/callback`,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    console.error('Gmail token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${base}/movimientos?gmail=error&reason=token_exchange`)
  }

  const tokens = await tokenRes.json() as {
    access_token:   string
    refresh_token?: string
    expires_in:     number
  }

  if (!tokens.refresh_token) {
    return NextResponse.redirect(`${base}/movimientos?gmail=error&reason=no_refresh_token`)
  }

  // Get connected Gmail address
  let gmailEmail = ''
  const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (profileRes.ok) {
    const profile = await profileRes.json() as { emailAddress: string }
    gmailEmail = profile.emailAddress
  }

  // Upsert into connected_email_accounts (supports multiple accounts)
  await createAdminClient()
    .from('connected_email_accounts')
    .upsert(
      {
        user_id:       user.id,
        email:         gmailEmail,
        provider:      'gmail',
        refresh_token: tokens.refresh_token,
        connected_at:  new Date().toISOString(),
      },
      { onConflict: 'user_id,email' }
    )

  const response = NextResponse.redirect(`${base}/movimientos?gmail=connected`)
  response.cookies.delete('gmail_oauth_state')
  return response
}
