import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadServiceAccount, getAccessToken, fetchSheetRange } from './lib/google-sheets.ts'
import { parseStructuredRows } from './parsers/structured.ts'
import {
  detectBudgetTabType,
  parseBudgetLines,
  parseBonusItems,
  parseNetworkEntries,
  parseInvestmentSnapshots,
} from './parsers/budget.ts'

const BATCH_SIZE = parseInt(Deno.env.get('BATCH_SIZE') ?? '500')
const DRY_RUN = Deno.env.get('DRY_RUN') === 'true'

Deno.serve(async (req) => {
  // Allow cron invocations (no body) and manual POST triggers
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Load active sync configs
    const { data: configs, error: cfgErr } = await supabase
      .from('sheets_sync_config')
      .select('*')
      .eq('is_active', true)
      .order('id')

    if (cfgErr) throw cfgErr
    if (!configs?.length) {
      return Response.json({ message: 'No active sync configs', ran: 0 })
    }

    // Get Google access token (shared across all configs in this run)
    const sa = loadServiceAccount()
    const accessToken = await getAccessToken(sa)

    const results = []

    for (const config of configs) {
      const result = await processConfig(config, accessToken, supabase)
      results.push(result)
    }

    return Response.json({ success: true, dry_run: DRY_RUN, results })
  } catch (err) {
    console.error('sheets-sync fatal error:', err)
    return Response.json({ success: false, error: String(err) }, { status: 500 })
  }
})

async function processConfig(
  config: Record<string, unknown>,
  accessToken: string,
  supabase: ReturnType<typeof createClient>
) {
  const {
    id,
    spreadsheet_id,
    sheet_name,
    format_type,
    last_row_synced,
    data_start_row,
    user_id,
  } = config as {
    id: number
    spreadsheet_id: string
    sheet_name: string
    format_type: string
    last_row_synced: number
    data_start_row: number
    user_id: string | null
  }

  const startRow = Math.max((last_row_synced ?? 0) + 1, data_start_row ?? 1)
  const endRow = startRow + BATCH_SIZE - 1
  const range = `${sheet_name}!A${startRow}:Z${endRow}`

  console.log(`[${sheet_name}] fetching rows ${startRow}–${endRow}`)

  let sheetData
  try {
    sheetData = await fetchSheetRange(String(spreadsheet_id), range, accessToken)
  } catch (err) {
    if (String(err).includes('RATE_LIMITED')) {
      console.warn(`[${sheet_name}] rate limited, waiting 60s…`)
      await new Promise((r) => setTimeout(r, 60_000))
      try {
        sheetData = await fetchSheetRange(String(spreadsheet_id), range, accessToken)
      } catch {
        await logSync(supabase, id, startRow - 1, 0, 0, 'partial', 'Rate limited after retry')
        return { config_id: id, sheet: sheet_name, status: 'partial', reason: 'rate_limited' }
      }
    } else {
      await logSync(supabase, id, startRow - 1, 0, 0, 'error', String(err))
      return { config_id: id, sheet: sheet_name, status: 'error', reason: String(err) }
    }
  }

  const rows = sheetData.values ?? []
  if (!rows.length) {
    await logSync(supabase, id, startRow - 1, 0, 0, 'success', 'No new rows')
    return { config_id: id, sheet: sheet_name, status: 'success', rows_inserted: 0, rows_skipped: 0 }
  }

  let rows_inserted = 0
  let rows_skipped = 0
  let highestRow = startRow - 1
  const sampleErrors: string[] = []

  if (format_type === 'structured') {
    const { transactions, balanceSnapshots, selfLoanHints } = parseStructuredRows(
      rows,
      String(spreadsheet_id),
      String(sheet_name),
      startRow
    )

    if (!DRY_RUN) {
      // Upsert transactions
      for (const tx of transactions) {
        const { error } = await supabase.from('transactions').upsert(
          {
            external_id: tx.external_id,
            source: 'sheets',
            user_id,
            date: tx.date,
            vendor: tx.vendor,
            concept: tx.concept,
            category_code: tx.category_code,
            movement_type: tx.movement_type,
            amount: tx.amount,
            currency_code: tx.currency_code,
            detail: tx.detail,
            balance_after_debit: tx.balance_after_debit,
            balance_after_cash: tx.balance_after_cash,
            balance_total: tx.balance_total,
            period_cut: tx.period_cut,
            expense_group: tx.expense_group,
            is_settlement: tx.is_settlement,
            is_passive_income: tx.is_passive_income,
            is_survival_expense: tx.is_survival_expense,
            notes: tx.notes,
          },
          { onConflict: 'external_id', ignoreDuplicates: false }
        )
        if (error) {
          console.error(`[${sheet_name}] upsert error row ${tx.row_number}:`, error.message)
          if (sampleErrors.length < 3) sampleErrors.push(`row ${tx.row_number}: ${error.message}`)
          rows_skipped++
        } else {
          rows_inserted++
        }
        highestRow = Math.max(highestRow, tx.row_number)
      }

      // Upsert balance snapshots (control multimoney)
      for (const snap of balanceSnapshots) {
        await supabase.from('account_balance_snapshots').upsert(
          {
            account_name: snap.account_name,
            snapshot_date: snap.snapshot_date,
            real_balance: snap.real_balance,
            source: 'sheets_sync',
          },
          { onConflict: 'account_name,snapshot_date', ignoreDuplicates: false }
        )
      }

      // Log self-loan hints for manual review (no auto-create to avoid false positives)
      if (selfLoanHints.length) {
        console.log(`[${sheet_name}] ${selfLoanHints.length} possible autopréstamos found:`, selfLoanHints)
      }
    } else {
      rows_inserted = transactions.length
      highestRow = startRow + rows.length - 1
      console.log(`[DRY_RUN][${sheet_name}] would insert ${transactions.length} transactions, ${balanceSnapshots.length} snapshots`)
    }
  } else if (format_type === 'budget') {
    const tabType = detectBudgetTabType(String(sheet_name))
    console.log(`[${sheet_name}] budget tab type: ${tabType}`)

    if (!DRY_RUN) {
      switch (tabType) {
        case 'quincenal': {
          const lines = parseBudgetLines(rows, String(spreadsheet_id), String(sheet_name), startRow)
          for (const line of lines) {
            const { error } = await supabase.from('budget_lines').upsert(
              { external_id: line.external_id, category: line.category, planned_amount: line.planned_amount, actual_amount: line.actual_amount, notes: line.notes },
              { onConflict: 'external_id', ignoreDuplicates: false }
            )
            if (error) rows_skipped++; else rows_inserted++
            highestRow = Math.max(highestRow, line.row_number)
          }
          break
        }
        case 'aguinaldo':
        case 'bono': {
          const items = parseBonusItems(rows, String(spreadsheet_id), String(sheet_name), startRow)
          for (const item of items) {
            const { error } = await supabase.from('bonus_plan_items').upsert(
              { external_id: item.external_id, description: item.description, amount: item.amount, is_allocated: item.is_allocated },
              { onConflict: 'external_id', ignoreDuplicates: false }
            )
            if (error) rows_skipped++; else rows_inserted++
            highestRow = Math.max(highestRow, item.row_number)
          }
          break
        }
        case 'liquidacion_sindy': {
          const entries = parseNetworkEntries(rows, String(spreadsheet_id), String(sheet_name), startRow)
          for (const entry of entries) {
            const { error } = await supabase.from('network_entries').upsert(
              { external_id: entry.external_id, name: entry.name, amount_owed: entry.amount_owed, currency_code: entry.currency_code, notes: entry.notes },
              { onConflict: 'external_id', ignoreDuplicates: false }
            )
            if (error) rows_skipped++; else rows_inserted++
            highestRow = Math.max(highestRow, entry.row_number)
          }
          break
        }
        case 'investment_snapshot': {
          const snaps = parseInvestmentSnapshots(rows, String(spreadsheet_id), String(sheet_name), startRow)
          for (const snap of snaps) {
            const { error } = await supabase.from('investment_snapshots').upsert(
              { external_id: snap.external_id, snapshot_date: snap.snapshot_date, fund_name: snap.fund_name, amount: snap.amount, currency_code: snap.currency_code },
              { onConflict: 'external_id', ignoreDuplicates: false }
            )
            if (error) rows_skipped++; else rows_inserted++
            highestRow = Math.max(highestRow, snap.row_number)
          }
          break
        }
        default:
          console.warn(`[${sheet_name}] unknown budget tab type, skipping`)
      }
    } else {
      rows_inserted = rows.length
      highestRow = startRow + rows.length - 1
      console.log(`[DRY_RUN][${sheet_name}] would process ${rows.length} rows as ${tabType}`)
    }
  } else {
    // hoja1 / bitácora — intentionally skipped
    console.log(`[${sheet_name}] format_type="${format_type}" — skipped`)
    return { config_id: id, sheet: sheet_name, status: 'skipped' }
  }

  if (!DRY_RUN && highestRow > (last_row_synced ?? 0)) {
    await supabase
      .from('sheets_sync_config')
      .update({ last_row_synced: highestRow, last_synced_at: new Date().toISOString() })
      .eq('id', id)
  }

  await logSync(supabase, id, highestRow, rows_inserted, rows_skipped, 'success', null)

  return { config_id: id, sheet: sheet_name, status: 'success', rows_inserted, rows_skipped, sample_errors: sampleErrors.length ? sampleErrors : undefined }
}

async function logSync(
  supabase: ReturnType<typeof createClient>,
  configId: number,
  lastRow: number,
  inserted: number,
  skipped: number,
  status: string,
  errorMessage: string | null
) {
  if (DRY_RUN) return
  await supabase.from('sheets_sync_log').insert({
    config_id: configId,
    rows_inserted: inserted,
    rows_skipped: skipped,
    status,
    error_message: errorMessage,
    synced_at: new Date().toISOString(),
  })
}
