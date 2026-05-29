# sheets-sync

Supabase Edge Function that polls two Google Sheets spreadsheets every hour and
upserts new rows into the `transactions` (and related) tables.

---

## Spreadsheets being watched

| Alias | Description | Format type |
|---|---|---|
| `INCOME_EXPENSE_SHEET` | "Control de Ingresos y Egresos" — main transaction register dating from Feb 2018 | `structured` |
| `BUDGET_SHEET` | Budget / Aguinaldo / Bono / liquidacionSindy / inquilinos tracking workbook | `budget` |

Both spreadsheet IDs are stored as environment variables (see [Environment variables](#environment-variables)).
The tab-level config lives in the `sheets_sync_config` table so new tabs can be
added without code changes.

---

## Architecture

```
Supabase Cron (every hour)
        │
        ▼
  Edge Function: sheets-sync
        │
        ├─ Read sheets_sync_config WHERE is_active = true
        │
        ├─ For each config row:
        │      ├─ Call Google Sheets API  (batchGet from last_row_synced+1)
        │      ├─ Parse rows by format_type
        │      ├─ Upsert into target table (transactions / budget_lines / …)
        │      ├─ Update last_row_synced + last_synced_at in config
        │      └─ Insert a row into sheets_sync_log
        │
        └─ Done
```

The function is deployed via `supabase functions deploy sheets-sync` and
triggered by a pg_cron job:

```sql
SELECT cron.schedule(
  'sheets-sync-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
      url    := current_setting('app.edge_function_url') || '/sheets-sync',
      headers := '{"Authorization":"Bearer " || current_setting("app.service_role_key")}'::jsonb
  )$$
);
```

---

## Deduplication strategy

Every imported row gets an `external_id` composed of three parts joined by `::`:

```
{spreadsheet_id}::{sheet_name}::{row_number}
```

Example: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms::movimientos::347`

The `transactions.external_id` column has a `UNIQUE` constraint.  The upsert
statement uses `ON CONFLICT (external_id) DO NOTHING`, so re-processing the
same row is a no-op.  `rows_skipped` in `sheets_sync_log` counts these.

Row numbers are 1-based and correspond to the physical row in the sheet
(including the header row), matching what the Sheets API returns in
`ValueRange.range`.

---

## Sheet format types

### `structured` — main "TABLA DE REGISTRO DE INGRESOS Y EGRESOS" sheet

The canonical table that has been maintained since February 2018.
Column mapping (0-indexed from column A):

| Column index | Sheet header | DB field |
|---|---|---|
| 0 | Consecutivo | *(row sequence — not stored, row_number used instead)* |
| 1 | Fecha | `transactions.date` |
| 2 | Año | *(derived from date)* |
| 3 | Código mes | *(derived from date)* |
| 4 | Mes | *(derived from date)* |
| 5 | Día | *(derived from date)* |
| 6 | Día semana | *(derived from date)* |
| 7 | Empresa | `transactions.vendor` |
| 8 | Concepto | `transactions.concept` |
| 9 | Grupo | `transactions.category_code` *(via category lookup)* |
| 10 | Tipo Mov. Cód | `transactions.movement_type` (1→income, 2→expense, 3→cash_withdrawal) |
| 11 | Tipo de movimiento | *(human label — redundant with col 10)* |
| 12 | Monto | `transactions.amount` |
| 13 | Fuente del movimiento | `transactions.source_code` (T-1..T-8) |
| 14 | Detalle | `transactions.detail` |
| 15 | Saldo débito | `transactions.balance_after_debit` |
| 16 | Saldo efectivo | `transactions.balance_after_cash` |
| 17 | Saldo Débito+efectivo | `transactions.balance_total` |
| 18 | Corte | `transactions.period_cut` |
| 19 | Grupo Gasto | `transactions.expense_group` (personal/necesario/objetivos_financieros/na) |
| 20 | Es liquidación | `transactions.is_settlement` |
| 21 | PassiveIncome | `transactions.is_passive_income` |
| 22 | Survival Expense | `transactions.is_survival_expense` |

Currency is always `CRC` for this sheet.  Amount is stored as-is in colones.

**Category code resolution**: the raw `Grupo` string (e.g. `"Comida fuera"`) is
mapped to a `transaction_categories.code` (e.g. `FOOD_OUT`) via a lookup table
built from the seed data.  Unknown values are stored in `transactions.notes`
with a `CATEGORY_UNMAPPED:` prefix and the row is still inserted.

### `hoja1` — newer lightweight format ("Hoja 1" section)

A simpler, less-structured section added more recently.  No running balances,
no category codes.

| Column index | Sheet header | DB field |
|---|---|---|
| 0 | label | `transactions.raw_label` |
| 1 | vendor | `transactions.vendor` |
| 2 | amount_colones | `transactions.amount` (currency_code = CRC) |
| 3 | amount_usd | `transactions.amount_usd` |
| 4 | notes | `transactions.notes` |

`movement_type` defaults to `expense` unless `raw_label` contains the word
`ingreso` (case-insensitive).  `date` is inferred from the row's surrounding
context header or left null and backfilled manually.

### `budget` — budget workbook tabs

Budget tabs (quincenal, aguinaldo, bono) are mapped to `budget_periods` +
`budget_lines`.  The sync function detects the tab name pattern:

| Tab name pattern | Target tables |
|---|---|
| `Q[12] * 20\d\d` or `[Ee]nero…[Dd]iciembre` | `budget_periods` (period_type=quincenal) + `budget_lines` |
| `[Aa]guinaldo 20\d\d` | `bonus_plans` (bonus_type=aguinaldo) + `bonus_plan_items` |
| `[Bb]ono 20\d\d` | `bonus_plans` (bonus_type=bono) + `bonus_plan_items` |
| `liquidacionSindy` | `network_entries` + `network_payments` |
| `Hoja1` (budget workbook) | `investment_snapshots` (Mariam fund) |

---

## Sync flow detail

```
1. SELECT * FROM sheets_sync_config WHERE is_active = true ORDER BY id
2. For each config:
   a. Call Sheets API: spreadsheets.values.get(
        spreadsheetId = config.spreadsheet_id,
        range         = config.sheet_name + '!A' + (config.last_row_synced + 1) + ':Z',
        valueRenderOption = 'UNFORMATTED_VALUE',
        dateTimeRenderOption = 'FORMATTED_STRING'
      )
   b. If HTTP 429 → back off 60 s, retry once, then log partial and move on.
   c. Parse rows (skip blank rows, skip header if first_row = header_row).
   d. For each non-blank row:
      - Build external_id
      - Map columns to DB fields
      - INSERT … ON CONFLICT (external_id) DO NOTHING
      - Track inserted / skipped counts
   e. UPDATE sheets_sync_config SET
        last_row_synced = highest_row_processed,
        last_synced_at  = NOW()
      WHERE id = config.id
   f. INSERT INTO sheets_sync_log (…)
```

---

## Rate limiting

The Google Sheets API enforces:

- **100 requests per 100 seconds per user** (read quota)
- **500 requests per 100 seconds per project**

With two spreadsheets and ~10 active tabs total, a single hourly run generates
at most ~10 API calls — well within quota.

If quota is hit (HTTP 429), the function:

1. Waits 60 seconds and retries once.
2. If still failing, marks that config row as `status=partial` in
   `sheets_sync_log` and continues with remaining configs.
3. The next scheduled run will resume from `last_row_synced`.

To avoid hammering the API during backfill of historical data (2018 → present),
a `BATCH_SIZE` env var (default 500 rows per run per config) limits how many
rows are fetched per invocation.

---

## Environment variables

Set these in the Supabase project dashboard under
**Project Settings → Edge Functions → Environment Variables**, or in
`.env.local` for local development.

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yes | Full JSON of the Google service account key (base64-encoded recommended). The service account must be granted **Viewer** access to both spreadsheets. |
| `INCOME_EXPENSE_SPREADSHEET_ID` | Yes | Google Sheets file ID for "Control de Ingresos y Egresos". Extract from the share URL: `https://docs.google.com/spreadsheets/d/{ID}/edit`. |
| `BUDGET_SPREADSHEET_ID` | Yes | Google Sheets file ID for the budget workbook. |
| `SUPABASE_URL` | Yes | Injected automatically by Supabase runtime. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Injected automatically; used for RLS-bypass upserts. |
| `BATCH_SIZE` | No | Max rows fetched per config per run (default: `500`). Lower during initial backfill to avoid timeouts. |
| `DRY_RUN` | No | Set to `true` to parse and log without writing to DB (useful for debugging column mapping). |

**Never use an API key** (`GOOGLE_SHEETS_API_KEY`) for this integration — API
keys cannot be restricted to a specific service account and the spreadsheets
should remain private.  Use a service account with OAuth 2.0 JWT instead.

---

## Local development

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Start local stack
supabase start

# 3. Apply migration
supabase db reset   # runs all migrations/

# 4. Seed a sync config row
psql $(supabase db url) -c "
  INSERT INTO sheets_sync_config
    (user_id, spreadsheet_id, sheet_name, sync_type, format_type, header_row, data_start_row)
  VALUES
    ('<your-user-uuid>', '<INCOME_EXPENSE_SPREADSHEET_ID>', 'movimientos', 'transactions', 'structured', 6, 7);
"

# 5. Run the function locally
supabase functions serve sheets-sync --env-file .env.local

# 6. Trigger manually
curl -i http://localhost:54321/functions/v1/sheets-sync \
  -H "Authorization: Bearer $(supabase status | grep 'anon key' | awk '{print $3}')"
```

---

## Files (to be created)

```
src/modules/sheets-sync/
├── README.md                  ← this file
├── index.ts                   ← Edge Function entry point (Deno)
├── parsers/
│   ├── structured.ts          ← column mapper for the main TABLA format
│   ├── hoja1.ts               ← column mapper for the Hoja 1 format
│   └── budget.ts              ← mapper for budget / aguinaldo / bono tabs
├── lib/
│   ├── google-sheets.ts       ← authenticated Google Sheets API client
│   ├── category-lookup.ts     ← maps Spanish "Grupo" strings → category codes
│   └── upsert.ts              ← Supabase upsert helpers with conflict handling
└── tests/
    ├── structured.test.ts
    ├── hoja1.test.ts
    └── budget.test.ts
```
