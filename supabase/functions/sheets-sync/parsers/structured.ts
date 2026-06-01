import { resolveCategory } from '../lib/category-lookup.ts'

export interface ParsedTransaction {
  external_id: string
  date: string | null
  vendor: string | null
  concept: string | null
  category_code: string | null
  movement_type: string | null
  amount: number | null
  currency_code: string
  source_code: string | null
  detail: string | null
  balance_after_debit: number | null
  balance_after_cash: number | null
  balance_total: number | null
  period_cut: string | null
  expense_group: string | null
  is_settlement: boolean
  is_passive_income: boolean
  is_survival_expense: boolean
  notes: string | null
  row_number: number
}

export interface ParsedBalanceSnapshot {
  account_name: string
  snapshot_date: string
  real_balance: number
  row_number: number
}

export interface StructuredParseResult {
  transactions: ParsedTransaction[]
  balanceSnapshots: ParsedBalanceSnapshot[]
  selfLoanHints: Array<{ transactionExternalId: string; detail: string }>
}

const MOVEMENT_TYPE_MAP: Record<string, string> = {
  '1': 'income',
  '2': 'expense',
  '3': 'cash_withdrawal',
}

const EXPENSE_GROUP_MAP: Record<string, string> = {
  'personal': 'personal',
  'necesario': 'necesario',
  'objetivos_financieros': 'objetivos_financieros',
  'objetivos financieros': 'objetivos_financieros',
  'na': 'na',
  'n/a': 'na',
}

const SELF_LOAN_PATTERNS = [
  /debe\s+a\s+/i,
  /debe\s+\w/i,
  /prestamo\s+de\s+/i,
  /tomar\s+de\s+/i,
]

function parseAmount(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function parseBool(val: unknown): boolean {
  if (!val) return false
  const s = String(val).toLowerCase().trim()
  return s === '1' || s === 'true' || s === 'si' || s === 'sí' || s === 'yes' || s === 'x'
}

function parseDate(val: unknown): string | null {
  if (!val) return null
  const s = String(val).trim()
  if (!s) return null

  // MM/DD/YYYY or M/D/YYYY (Google Sheets default en-US format)
  const parts = s.split('/')
  if (parts.length === 3) {
    const [m, d, y] = parts
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  return null
}

export function parseStructuredRows(
  rows: string[][],
  spreadsheetId: string,
  sheetName: string,
  startRowNumber: number
): StructuredParseResult {
  const transactions: ParsedTransaction[] = []
  const balanceSnapshots: ParsedBalanceSnapshot[] = []
  const selfLoanHints: StructuredParseResult['selfLoanHints'] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNumber = startRowNumber + i

    // Skip completely blank rows
    if (!row || row.every((c) => !c && c !== 0)) continue

    const col = (idx: number): unknown => row[idx] ?? ''

    // Skip non-transaction rows (headers, labels, row-number-only rows).
    // A valid transaction must have at least a date or an amount.
    const rawDateEarly = parseDate(col(1))
    const rawAmountEarly = parseAmount(col(12))
    if (rawDateEarly === null && rawAmountEarly === null) continue

    const external_id = `${spreadsheetId}::${sheetName}::${rowNumber}`
    const rawDate = rawDateEarly
    const detail = String(col(14) ?? '').trim() || null
    const concept = String(col(8) ?? '').trim() || null
    const rawGrupo = String(col(9) ?? '').trim()
    const { code: category_code, unmapped } = resolveCategory(rawGrupo)
    const rawMovType = String(col(10) ?? '').trim()
    const movement_type = MOVEMENT_TYPE_MAP[rawMovType] ?? null
    const rawExpGroup = String(col(19) ?? '').toLowerCase().trim()
    const expense_group = EXPENSE_GROUP_MAP[rawExpGroup] ?? null
    const period_cut = String(col(18) ?? '').trim() || null

    let notes: string | null = null
    if (unmapped && rawGrupo) {
      notes = `CATEGORY_UNMAPPED:${rawGrupo}`
    }

    const tx: ParsedTransaction = {
      external_id,
      date: rawDate,
      vendor: String(col(7) ?? '').trim() || null,
      concept,
      category_code,
      movement_type,
      amount: parseAmount(col(12)),
      currency_code: 'CRC',
      source_code: String(col(13) ?? '').trim() || null,
      detail,
      balance_after_debit: parseAmount(col(15)),
      balance_after_cash: parseAmount(col(16)),
      balance_total: parseAmount(col(17)),
      period_cut,
      expense_group,
      is_settlement: parseBool(col(20)),
      is_passive_income: parseBool(col(21)),
      is_survival_expense: parseBool(col(22)),
      notes,
      row_number: rowNumber,
    }

    transactions.push(tx)

    // Check for self-loan patterns in detail or concept
    const searchText = [detail, concept].filter(Boolean).join(' ')
    if (searchText && SELF_LOAN_PATTERNS.some((p) => p.test(searchText))) {
      selfLoanHints.push({ transactionExternalId: external_id, detail: searchText })
    }

    // Control multimoney: lateral balance columns on Corte rows (col 23+)
    if (period_cut?.toLowerCase() === 'corte' && rawDate && row.length > 23) {
      for (let c = 23; c < row.length - 1; c += 2) {
        const accountName = String(row[c] ?? '').trim()
        const rawBalance = parseAmount(row[c + 1])
        if (accountName && rawBalance !== null) {
          balanceSnapshots.push({
            account_name: accountName,
            snapshot_date: rawDate,
            real_balance: rawBalance,
            row_number: rowNumber,
          })
        }
      }
    }
  }

  return { transactions, balanceSnapshots, selfLoanHints }
}
