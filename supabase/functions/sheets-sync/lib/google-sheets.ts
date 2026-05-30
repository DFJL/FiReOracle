const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

interface ServiceAccount {
  client_email: string
  private_key: string
}

// Creates a signed JWT and exchanges it for a short-lived OAuth2 access token
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify(claim))
  const signingInput = `${header}.${payload}`

  // Import the RSA private key
  const keyData = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')

  const binaryKey = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
  const jwt = `${signingInput}.${signature}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`Failed to get Google access token: ${err}`)
  }

  const { access_token } = await tokenRes.json()
  return access_token
}

export interface SheetValues {
  range: string
  majorDimension: string
  values?: string[][]
}

export async function fetchSheetRange(
  spreadsheetId: string,
  range: string,
  accessToken: string
): Promise<SheetValues> {
  const url = new URL(`${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`)
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE')
  url.searchParams.set('dateTimeRenderOption', 'FORMATTED_STRING')

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 429) throw new Error('RATE_LIMITED')
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Sheets API error ${res.status}: ${err}`)
  }

  return res.json()
}

export function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')

  try {
    // Support both plain JSON and base64-encoded JSON
    const json = raw.startsWith('{') ? raw : atob(raw)
    return JSON.parse(json)
  } catch {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON — must be JSON or base64-encoded JSON')
  }
}

export { getAccessToken }
