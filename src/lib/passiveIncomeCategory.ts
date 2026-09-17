// Shared with progreso/page.tsx (display-time self-heal) and
// app/actions/transactions.ts (write-time prevention) — single source of
// truth for "what counts as a generic catch-all category" and "how do we
// match the same vendor across spelling variants", so both layers agree.

export const GENERIC_PASSIVE_CATEGORIES = new Set(['PASSIVE_INCOME', 'MISC_INCOME'])

export function normalizeVendorKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ')
}
