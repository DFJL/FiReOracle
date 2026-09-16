// Telegram can't render our custom <chart> tags or reliably parse arbitrary
// LLM-generated Markdown (an unmatched * or _ anywhere in the message makes
// Telegram reject the ENTIRE message with "can't parse entities") — so Oracle
// replies sent to Telegram go out as converted plain text, never parse_mode:
// 'Markdown'.

const CHART_RE = /<chart\s+type="(bar|line)"\s+title="([^"]*)">([\s\S]*?)<\/chart>/g

function chartsToPlainText(raw: string): string {
  return raw.replace(CHART_RE, (_match, _type, title, body) => {
    try {
      const data = JSON.parse((body as string).trim()) as { label: string; value: number }[]
      const lines = data.map(d => `• ${d.label}: ${d.value.toLocaleString('es-CR')}`)
      return `📊 ${title}\n${lines.join('\n')}`
    } catch {
      return ''
    }
  })
}

export function toTelegramText(raw: string): string {
  let t = chartsToPlainText(raw)
  t = t.replace(/^#{1,6}\s*/gm, '')  // strip markdown headers
  t = t.replace(/\*\*/g, '')        // drop bold markers — plain text, no parse_mode
  return t.trim()
}

// Telegram caps a single message at 4096 chars — split on the nearest
// preceding newline so we don't cut a line in half.
export function chunkForTelegram(text: string, maxLen = 3900): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n', maxLen)
    if (splitAt < maxLen * 0.5) splitAt = maxLen
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}
