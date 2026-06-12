// Shared helpers — no 'use server' / 'use client', safe for both sides

export function isCreditCardEmail(subject: string | null, snippet: string | null): boolean {
  const text = `${subject ?? ''} ${snippet ?? ''}`.toLowerCase()
  // Explicit debit / non-credit signals → not a TC
  if (/tarjeta\s+de\s+d[eé]bito|\btd\b|d[eé]bito\s+en\s+cuenta|sinpe|retiro\s+atm/.test(text)) return false
  // Credit card signals
  return /tarjeta\s+de\s+cr[eé]dito|\btc\b|cr[eé]dito.*visa|visa.*cr[eé]dito|mastercard.*cr[eé]dito|cr[eé]dito.*mastercard|cargo\s+a\s+tc|compra\s+tc/.test(text)
}
