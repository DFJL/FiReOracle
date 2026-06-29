// Shared helpers — no 'use server' / 'use client', safe for both sides

export function isCreditCardEmail(subject: string | null, snippet: string | null): boolean {
  const text = `${subject ?? ''} ${snippet ?? ''}`.toLowerCase()
  // Explicit debit / non-credit signals → not a TC
  if (/tarjeta\s+de\s+d[eé]bito|\btd\b|d[eé]bito\s+en\s+cuenta|sinpe|retiro\s+atm|cuenta\s+corriente|cuenta\s+de\s+ahorro/.test(text)) return false
  // Credit card signals (TC, Visa Crédito, Mastercard, BAC/Davivienda card patterns)
  return (
    /tarjeta\s+de\s+cr[eé]dito|\btc\b|cargo\s+a\s+tc|compra\s+tc/.test(text) ||
    /cr[eé]dito.*visa|visa.*cr[eé]dito|visa.*cr[eé]d/.test(text) ||
    /mastercard.*cr[eé]dito|cr[eé]dito.*mastercard|\bmastercard\b/.test(text) ||
    /\bvisa\b.*\b(gold|platinum|signature|infinite|classic|black)\b/.test(text) ||
    /aviso\s+de\s+compra|compra\s+con\s+tarjeta|cargo\s+a\s+su\s+tarjeta/.test(text) ||
    /notificaci[oó]n.*cr[eé]dito|cr[eé]dito.*notificaci[oó]n/.test(text)
  )
}
