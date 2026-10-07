// Shared helpers — no 'use server' / 'use client', safe for both sides

export type AccountRegistryEntry = { id: string; name: string; account_type: string; custodio: string | null; last4: string | null }
export type MatchedAccountRef = { id: string; name: string; account_type: string; custodio: string | null }

/**
 * Cross-references the AI-extracted account_ref/counterparty_ref (raw last-4
 * digits read off the email) against the user's registered accounts —
 * deterministic, so it overrides the wording-based is_credit_card guess
 * instead of just supplementing it. When BOTH refs match a DIFFERENT known
 * account, it's very likely money moving between the user's own accounts,
 * not real income/expense.
 */
export function matchAccountRefs(
  extracted: { account_ref?: string | null; counterparty_ref?: string | null },
  accounts: AccountRegistryEntry[],
): {
  matched_account: MatchedAccountRef | null
  matched_counterparty: MatchedAccountRef | null
  is_internal_transfer: boolean
} {
  const byLast4 = (ref: string | null | undefined): MatchedAccountRef | null => {
    if (!ref) return null
    const digits = ref.replace(/\D/g, '').slice(-4)
    if (digits.length !== 4) return null
    const found = accounts.find(a => a.last4 === digits)
    return found ? { id: found.id, name: found.name, account_type: found.account_type, custodio: found.custodio } : null
  }

  const matched_account = byLast4(extracted.account_ref)
  const matched_counterparty = byLast4(extracted.counterparty_ref)
  const is_internal_transfer = !!matched_account && !!matched_counterparty && matched_account.id !== matched_counterparty.id

  return { matched_account, matched_counterparty, is_internal_transfer }
}

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
