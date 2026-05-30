export type BudgetTabType =
  | 'quincenal'
  | 'aguinaldo'
  | 'bono'
  | 'liquidacion_sindy'
  | 'investment_snapshot'
  | 'unknown'

export function detectBudgetTabType(tabName: string): BudgetTabType {
  const name = tabName.toLowerCase().trim()

  if (/q[12]\s/.test(name) || /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/.test(name)) {
    return 'quincenal'
  }
  if (/aguinaldo/.test(name)) return 'aguinaldo'
  if (/bono/.test(name)) return 'bono'
  if (/liquidacionsindy|liquidacion\s*sindy/.test(name)) return 'liquidacion_sindy'
  if (/hoja\s*1/.test(name)) return 'investment_snapshot'

  return 'unknown'
}

export interface ParsedBudgetLine {
  external_id: string
  category: string | null
  planned_amount: number | null
  actual_amount: number | null
  notes: string | null
  row_number: number
}

export interface ParsedBonusItem {
  external_id: string
  description: string | null
  amount: number | null
  is_allocated: boolean
  row_number: number
}

export interface ParsedNetworkEntry {
  external_id: string
  name: string | null
  amount_owed: number | null
  currency_code: string
  notes: string | null
  row_number: number
}

export interface ParsedInvestmentSnapshot {
  external_id: string
  snapshot_date: string | null
  fund_name: string | null
  amount: number | null
  currency_code: string
  row_number: number
}

function parseAmount(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

export function parseBudgetLines(
  rows: string[][],
  spreadsheetId: string,
  sheetName: string,
  startRowNumber: number
): ParsedBudgetLine[] {
  return rows
    .map((row, i) => {
      const rowNumber = startRowNumber + i
      if (!row || row.every((c) => !c)) return null

      return {
        external_id: `${spreadsheetId}::${sheetName}::${rowNumber}`,
        category: String(row[0] ?? '').trim() || null,
        planned_amount: parseAmount(row[1]),
        actual_amount: parseAmount(row[2]),
        notes: String(row[3] ?? '').trim() || null,
        row_number: rowNumber,
      }
    })
    .filter((r): r is ParsedBudgetLine => r !== null)
}

export function parseBonusItems(
  rows: string[][],
  spreadsheetId: string,
  sheetName: string,
  startRowNumber: number
): ParsedBonusItem[] {
  return rows
    .map((row, i) => {
      const rowNumber = startRowNumber + i
      if (!row || row.every((c) => !c)) return null

      const description = String(row[0] ?? '').trim()
      if (!description) return null

      return {
        external_id: `${spreadsheetId}::${sheetName}::${rowNumber}`,
        description,
        amount: parseAmount(row[1]),
        is_allocated: Boolean(row[2]),
        row_number: rowNumber,
      }
    })
    .filter((r): r is ParsedBonusItem => r !== null)
}

export function parseNetworkEntries(
  rows: string[][],
  spreadsheetId: string,
  sheetName: string,
  startRowNumber: number
): ParsedNetworkEntry[] {
  return rows
    .map((row, i) => {
      const rowNumber = startRowNumber + i
      if (!row || row.every((c) => !c)) return null

      const name = String(row[0] ?? '').trim()
      if (!name) return null

      return {
        external_id: `${spreadsheetId}::${sheetName}::${rowNumber}`,
        name,
        amount_owed: parseAmount(row[1]),
        currency_code: String(row[2] ?? 'CRC').trim() || 'CRC',
        notes: String(row[3] ?? '').trim() || null,
        row_number: rowNumber,
      }
    })
    .filter((r): r is ParsedNetworkEntry => r !== null)
}

export function parseInvestmentSnapshots(
  rows: string[][],
  spreadsheetId: string,
  sheetName: string,
  startRowNumber: number
): ParsedInvestmentSnapshot[] {
  return rows
    .map((row, i) => {
      const rowNumber = startRowNumber + i
      if (!row || row.every((c) => !c)) return null

      return {
        external_id: `${spreadsheetId}::${sheetName}::${rowNumber}`,
        snapshot_date: String(row[0] ?? '').trim() || null,
        fund_name: String(row[1] ?? '').trim() || null,
        amount: parseAmount(row[2]),
        currency_code: String(row[3] ?? 'CRC').trim() || 'CRC',
        row_number: rowNumber,
      }
    })
    .filter((r): r is ParsedInvestmentSnapshot => r !== null)
}
