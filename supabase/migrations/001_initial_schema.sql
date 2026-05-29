-- =============================================================================
-- FiReOracle — Initial Schema Migration
-- Covers: transactions, budgets, savings, bonuses, loans, sheets sync
-- All user-owned tables have RLS enabled.
-- Reference tables (currencies, categories, payment_sources) are public-read.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SECTION 1: REFERENCE TABLES
-- No RLS — authenticated users can read; only service role can write.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- currencies
-- ---------------------------------------------------------------------------
CREATE TABLE currencies (
    code         CHAR(3)      PRIMARY KEY,               -- ISO-4217: CRC, USD, EUR
    name         TEXT         NOT NULL,
    symbol       TEXT         NOT NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  currencies        IS 'ISO currency codes supported by the app.';
COMMENT ON COLUMN currencies.code   IS 'ISO-4217 three-letter code, e.g. CRC, USD.';
COMMENT ON COLUMN currencies.symbol IS 'Display symbol: ₡, $, €.';

-- ---------------------------------------------------------------------------
-- transaction_categories
-- ---------------------------------------------------------------------------
CREATE TABLE transaction_categories (
    code                TEXT        PRIMARY KEY,          -- e.g. FOOD_OUT, SALARY
    name                TEXT        NOT NULL,
    parent_code         TEXT        REFERENCES transaction_categories(code),
    category_type       TEXT        NOT NULL
                            CHECK (category_type IN ('income','expense','transfer')),
    group_gasto         TEXT
                            CHECK (group_gasto IN ('personal','necesario','objetivos_financieros','na')),
    is_survival_expense BOOLEAN     NOT NULL DEFAULT FALSE,
    is_passive_income   BOOLEAN     NOT NULL DEFAULT FALSE,
    sort_order          INTEGER,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  transaction_categories                    IS 'Canonical income/expense/transfer categories derived from spreadsheet "Grupo" and "Concepto" columns.';
COMMENT ON COLUMN transaction_categories.code               IS 'Short uppercase code used as FK throughout the schema.';
COMMENT ON COLUMN transaction_categories.parent_code        IS 'Optional parent for hierarchical grouping (e.g. FOOD is parent of FOOD_OUT).';
COMMENT ON COLUMN transaction_categories.group_gasto        IS 'Maps to "Grupo Gasto" column: personal, necesario, objetivos_financieros, na.';
COMMENT ON COLUMN transaction_categories.is_survival_expense IS 'TRUE when mapped from "Survival Expense = 1" in the sheet.';
COMMENT ON COLUMN transaction_categories.is_passive_income   IS 'TRUE when mapped from "PassiveIncome = 1" in the sheet.';

-- ---------------------------------------------------------------------------
-- payment_sources  (T-1 through T-8 from the spreadsheet)
-- ---------------------------------------------------------------------------
CREATE TABLE payment_sources (
    code        TEXT        PRIMARY KEY,                  -- T-1, T-2, … T-8
    name        TEXT        NOT NULL,
    source_type TEXT        NOT NULL
                    CHECK (source_type IN ('debit','credit','cash','deposit','other')),
    bank_name   TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  payment_sources             IS 'Payment instruments: debit cards, credit cards, cash, etc. Matches "Fuente del movimiento" column.';
COMMENT ON COLUMN payment_sources.code        IS 'Short code matching sheet value: T-1 .. T-8.';
COMMENT ON COLUMN payment_sources.source_type IS 'Broad classification of the instrument.';

-- ---------------------------------------------------------------------------
-- exchange_rates  (historical ₡/USD rates — "TC" column in budget sheets)
-- ---------------------------------------------------------------------------
CREATE TABLE exchange_rates (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    rate_date     DATE        NOT NULL,
    from_currency CHAR(3)     NOT NULL REFERENCES currencies(code),
    to_currency   CHAR(3)     NOT NULL REFERENCES currencies(code),
    rate          NUMERIC(15,6) NOT NULL,
    source        TEXT,                                   -- 'manual', 'bcr', 'sheet_import'
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rate_date, from_currency, to_currency)
);

COMMENT ON TABLE  exchange_rates           IS 'Historical exchange rates. Primarily USD→CRC (TC) scraped from budget sheets (~500–530 ₡/USD).';
COMMENT ON COLUMN exchange_rates.rate_date IS 'Date for which this rate is valid.';
COMMENT ON COLUMN exchange_rates.rate      IS 'Units of to_currency per 1 unit of from_currency.';

CREATE INDEX idx_exchange_rates_date ON exchange_rates (rate_date);


-- =============================================================================
-- SECTION 2: USER-SCOPED ACCOUNTS
-- =============================================================================

CREATE TABLE accounts (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    source_code   TEXT        REFERENCES payment_sources(code),
    currency_code CHAR(3)     NOT NULL REFERENCES currencies(code),
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  accounts             IS 'User-owned financial accounts (bank accounts, credit cards, cash wallets).';
COMMENT ON COLUMN accounts.source_code IS 'Links to the payment_sources code that this account represents.';

CREATE INDEX idx_accounts_user_id ON accounts (user_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_user_only ON accounts
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- =============================================================================
-- SECTION 3: CORE TRANSACTIONS
-- =============================================================================

CREATE TABLE transactions (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Deduplication key for Google Sheets import
    external_id           TEXT        UNIQUE,             -- '{spreadsheet_id}::{sheet_name}::{row_number}'

    -- Date decomposition (mirrors sheet columns Fecha, Año, Código mes, Día, Día semana)
    date                  DATE        NOT NULL,
    year                  SMALLINT    GENERATED ALWAYS AS (EXTRACT(YEAR  FROM date)::SMALLINT) STORED,
    month                 SMALLINT    GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)::SMALLINT) STORED,
    day                   SMALLINT    GENERATED ALWAYS AS (EXTRACT(DAY   FROM date)::SMALLINT) STORED,
    weekday               SMALLINT    GENERATED ALWAYS AS (EXTRACT(DOW   FROM date)::SMALLINT) STORED,
                                                          -- 0=Sunday … 6=Saturday

    -- Parties & description
    vendor                TEXT,                           -- Empresa column
    concept               TEXT,                           -- Concepto column
    detail                TEXT,                           -- Detalle column

    -- Classification
    category_code         TEXT        REFERENCES transaction_categories(code),
    movement_type         TEXT        NOT NULL
                              CHECK (movement_type IN ('income','expense','cash_withdrawal')),
                                                          -- Tipo Mov. Cód: 1=income, 2=expense, 3=cash_withdrawal
    expense_group         TEXT
                              CHECK (expense_group IN ('personal','necesario','objetivos_financieros','na')),
                                                          -- Grupo Gasto column
    is_settlement         BOOLEAN     NOT NULL DEFAULT FALSE, -- Es liquidación
    is_passive_income     BOOLEAN     NOT NULL DEFAULT FALSE, -- PassiveIncome column
    is_survival_expense   BOOLEAN     NOT NULL DEFAULT FALSE, -- Survival Expense column

    -- Amounts & currency
    amount                NUMERIC(15,2) NOT NULL,
    currency_code         CHAR(3)     NOT NULL REFERENCES currencies(code),
    exchange_rate_used    NUMERIC(15,6),                  -- TC rate at time of transaction
    amount_usd            NUMERIC(15,2),                  -- Computed or imported USD equivalent

    -- Account / payment source
    account_id            UUID        REFERENCES accounts(id),
    source_code           TEXT        REFERENCES payment_sources(code),
                                                          -- Fuente del movimiento (T-1 .. T-8)

    -- Running balances (from sheet: Saldo débito, Saldo efectivo, Saldo Débito+efectivo)
    balance_after_debit   NUMERIC(15,2),
    balance_after_cash    NUMERIC(15,2),
    balance_total         NUMERIC(15,2),

    -- Period marker from sheet "Corte" column
    period_cut            TEXT,

    -- Raw / Hoja 1 format fields (for simpler newer entries)
    raw_label             TEXT,                           -- "label" column in Hoja 1
    notes                 TEXT,                           -- free-text notes / Hoja 1 "notes"

    -- Provenance
    source                TEXT        NOT NULL DEFAULT 'sheets'
                              CHECK (source IN ('sheets','manual','import')),

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  transactions                  IS 'Master ledger of all income and expense transactions, imported from Google Sheets or entered manually.';
COMMENT ON COLUMN transactions.external_id      IS 'Globally unique key for Google Sheets deduplication: {spreadsheet_id}::{sheet_name}::{row_number}.';
COMMENT ON COLUMN transactions.movement_type    IS 'Mirrors "Tipo Mov. Cód": 1→income, 2→expense, 3→cash_withdrawal.';
COMMENT ON COLUMN transactions.source_code      IS 'Payment instrument (T-1..T-8) from "Fuente del movimiento" column.';
COMMENT ON COLUMN transactions.raw_label        IS 'Used for Hoja 1 (newer, less structured format) "label" field.';
COMMENT ON COLUMN transactions.exchange_rate_used IS 'CRC per 1 USD rate active on the transaction date.';

CREATE INDEX idx_transactions_user_id      ON transactions (user_id);
CREATE INDEX idx_transactions_date         ON transactions (date);
CREATE INDEX idx_transactions_category     ON transactions (category_code);
CREATE INDEX idx_transactions_movement     ON transactions (movement_type);
CREATE INDEX idx_transactions_user_date    ON transactions (user_id, date DESC);
CREATE INDEX idx_transactions_external_id  ON transactions (external_id) WHERE external_id IS NOT NULL;

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_user_only ON transactions
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- =============================================================================
-- SECTION 4: BUDGET TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- budget_periods  (quincenal / mensual / anual)
-- ---------------------------------------------------------------------------
CREATE TABLE budget_periods (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,               -- e.g. "Quincena 1 Enero 2024"
    period_type      TEXT        NOT NULL
                         CHECK (period_type IN ('quincenal','mensual','anual')),
    start_date       DATE        NOT NULL,
    end_date         DATE        NOT NULL,
    exchange_rate_tc NUMERIC(15,6),                      -- TC rate used for this budget period
    status           TEXT        NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','active','closed')),
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  budget_periods                  IS 'Budget planning periods. Supports quincenal (bi-weekly) budgets as used in the spreadsheet.';
COMMENT ON COLUMN budget_periods.exchange_rate_tc IS 'USD→CRC exchange rate (TC) locked for this budget period.';

CREATE INDEX idx_budget_periods_user_id ON budget_periods (user_id);
CREATE INDEX idx_budget_periods_dates   ON budget_periods (start_date, end_date);

ALTER TABLE budget_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY budget_periods_user_only ON budget_periods
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- budget_lines  (one row per category per period)
-- ---------------------------------------------------------------------------
CREATE TABLE budget_lines (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    budget_period_id  UUID        NOT NULL REFERENCES budget_periods(id) ON DELETE CASCADE,
    category_code     TEXT        REFERENCES transaction_categories(code),
    item_name         TEXT,                              -- free-text for uncategorised lines
    planned_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
    planned_currency  CHAR(3)     NOT NULL REFERENCES currencies(code),
    actual_amount     NUMERIC(15,2)          DEFAULT 0,
    actual_currency   CHAR(3)     REFERENCES currencies(code),
    q1_amount         NUMERIC(15,2),                    -- first quincena allocation
    q2_amount         NUMERIC(15,2),                    -- second quincena allocation
    is_completed      BOOLEAN     NOT NULL DEFAULT FALSE,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  budget_lines          IS 'Individual line items within a budget period, one per category or ad-hoc item.';
COMMENT ON COLUMN budget_lines.q1_amount IS 'Amount allocated to the first quincena (Q1) of the month.';
COMMENT ON COLUMN budget_lines.q2_amount IS 'Amount allocated to the second quincena (Q2) of the month.';

CREATE INDEX idx_budget_lines_period   ON budget_lines (budget_period_id);
CREATE INDEX idx_budget_lines_category ON budget_lines (category_code);

ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY budget_lines_user_only ON budget_lines
    USING (
        auth.uid() = (
            SELECT user_id FROM budget_periods bp WHERE bp.id = budget_period_id
        )
    )
    WITH CHECK (
        auth.uid() = (
            SELECT user_id FROM budget_periods bp WHERE bp.id = budget_period_id
        )
    );


-- =============================================================================
-- SECTION 5: SAVINGS & INVESTMENTS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- savings_buckets
-- ---------------------------------------------------------------------------
CREATE TABLE savings_buckets (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,               -- e.g. "FU Money", "Ahorro viaje", "Pensión voluntaria"
    bucket_type     TEXT        NOT NULL
                        CHECK (bucket_type IN ('fu_money','travel','daughters','pension','investment','other')),
    target_amount   NUMERIC(15,2),
    target_currency CHAR(3)     REFERENCES currencies(code),
    current_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency_code   CHAR(3)     NOT NULL REFERENCES currencies(code),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE savings_buckets IS 'Named savings goals: FU Money, travel fund, daughters fund (Ahorro hijas), voluntary pension, Dominion investment, Transcomer, etc.';

CREATE INDEX idx_savings_buckets_user_id ON savings_buckets (user_id);

ALTER TABLE savings_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY savings_buckets_user_only ON savings_buckets
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- savings_contributions
-- ---------------------------------------------------------------------------
CREATE TABLE savings_contributions (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    bucket_id      UUID        NOT NULL REFERENCES savings_buckets(id) ON DELETE CASCADE,
    transaction_id UUID        REFERENCES transactions(id),  -- nullable: links back to ledger
    date           DATE        NOT NULL,
    amount         NUMERIC(15,2) NOT NULL,
    currency_code  CHAR(3)     NOT NULL REFERENCES currencies(code),
    notes          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  savings_contributions.transaction_id IS 'Optional FK to transactions; allows correlating a contribution with its source transaction.';
-- (column comment syntax workaround — actual comment below)
COMMENT ON TABLE  savings_contributions IS 'Individual deposits or withdrawals into/from a savings bucket.';

CREATE INDEX idx_savings_contributions_bucket ON savings_contributions (bucket_id);
CREATE INDEX idx_savings_contributions_date   ON savings_contributions (date);

ALTER TABLE savings_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY savings_contributions_user_only ON savings_contributions
    USING (
        auth.uid() = (
            SELECT user_id FROM savings_buckets sb WHERE sb.id = bucket_id
        )
    )
    WITH CHECK (
        auth.uid() = (
            SELECT user_id FROM savings_buckets sb WHERE sb.id = bucket_id
        )
    );

-- ---------------------------------------------------------------------------
-- investment_snapshots  (point-in-time NAV/balance, e.g. Mariam mutual fund)
-- ---------------------------------------------------------------------------
CREATE TABLE investment_snapshots (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    bucket_id     UUID        REFERENCES savings_buckets(id),
    snapshot_date DATE        NOT NULL,
    amount        NUMERIC(15,2) NOT NULL,
    currency_code CHAR(3)     NOT NULL REFERENCES currencies(code),
    gains         NUMERIC(15,2),                        -- period gain/loss vs previous snapshot
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE investment_snapshots IS 'Periodic NAV snapshots for investment funds (e.g. Mariam fund contributions + returns 2018-2019, Dominion $250/mo USD).';

CREATE INDEX idx_investment_snapshots_user_id ON investment_snapshots (user_id);
CREATE INDEX idx_investment_snapshots_date    ON investment_snapshots (snapshot_date);

ALTER TABLE investment_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY investment_snapshots_user_only ON investment_snapshots
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- =============================================================================
-- SECTION 6: BONUS TRACKING (Aguinaldo + Bono)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- bonus_plans  (annual aguinaldo 2020-2025, bono 2025/2026)
-- ---------------------------------------------------------------------------
CREATE TABLE bonus_plans (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    year             SMALLINT    NOT NULL,
    bonus_type       TEXT        NOT NULL
                         CHECK (bonus_type IN ('aguinaldo','bono')),
    planned_total    NUMERIC(15,2) NOT NULL DEFAULT 0,
    actual_total     NUMERIC(15,2),
    currency_code    CHAR(3)     NOT NULL REFERENCES currencies(code),
    exchange_rate_tc NUMERIC(15,6),                     -- TC used for USD conversion in this plan
    status           TEXT        NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','active','settled')),
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, year, bonus_type)
);

COMMENT ON TABLE bonus_plans IS 'Year-end bonus (aguinaldo) and mid-year bonus (bono) planning sheets. Covers aguinaldo 2020-2025 and bono 2025/2026.';

CREATE INDEX idx_bonus_plans_user_id ON bonus_plans (user_id);

ALTER TABLE bonus_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY bonus_plans_user_only ON bonus_plans
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- bonus_plan_items  (line items within each bonus plan)
-- ---------------------------------------------------------------------------
CREATE TABLE bonus_plan_items (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    bonus_plan_id  UUID        NOT NULL REFERENCES bonus_plans(id) ON DELETE CASCADE,
    category       TEXT        NOT NULL,                -- deudas, regalos, personal, ahorros, viaje, otros
    item_name      TEXT        NOT NULL,
    planned_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    actual_amount  NUMERIC(15,2),
    currency_code  CHAR(3)     NOT NULL REFERENCES currencies(code),
    is_completed   BOOLEAN     NOT NULL DEFAULT FALSE,
    notes          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE bonus_plan_items IS 'Individual line items in a bonus plan: debts, gifts, personal expenses, savings targets, travel, etc.';

CREATE INDEX idx_bonus_plan_items_plan ON bonus_plan_items (bonus_plan_id);

ALTER TABLE bonus_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY bonus_plan_items_user_only ON bonus_plan_items
    USING (
        auth.uid() = (
            SELECT user_id FROM bonus_plans bp WHERE bp.id = bonus_plan_id
        )
    )
    WITH CHECK (
        auth.uid() = (
            SELECT user_id FROM bonus_plans bp WHERE bp.id = bonus_plan_id
        )
    );


-- =============================================================================
-- SECTION 7: NETWORK / LOANS & DEBTS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- network_entries  (amounts owed by or to the user)
-- ---------------------------------------------------------------------------
CREATE TABLE network_entries (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    counterpart_name    TEXT        NOT NULL,            -- name of person / entity
    counterpart_id_number TEXT,                          -- national ID / cédula if known
    direction           TEXT        NOT NULL
                            CHECK (direction IN ('owed_by_me','owed_to_me')),
    original_amount     NUMERIC(15,2) NOT NULL,
    currency_code       CHAR(3)     NOT NULL REFERENCES currencies(code),
    start_date          DATE        NOT NULL,
    due_date            DATE,
    status              TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','settled','written_off')),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  network_entries           IS 'Loan and debt ledger — amounts the user owes or is owed. Covers SINPE payment tracking (liquidacionSindy), tenant deposits, etc.';
COMMENT ON COLUMN network_entries.direction IS 'owed_by_me = user is the debtor; owed_to_me = user is the creditor.';

CREATE INDEX idx_network_entries_user_id ON network_entries (user_id);

ALTER TABLE network_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY network_entries_user_only ON network_entries
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- network_payments  (individual repayment events)
-- ---------------------------------------------------------------------------
CREATE TABLE network_payments (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    network_entry_id UUID        NOT NULL REFERENCES network_entries(id) ON DELETE CASCADE,
    date             DATE        NOT NULL,
    amount           NUMERIC(15,2) NOT NULL,
    currency_code    CHAR(3)     NOT NULL REFERENCES currencies(code),
    payment_method   TEXT,                              -- SINPE, cash, bank transfer, etc.
    transaction_id   UUID        REFERENCES transactions(id), -- optional link to ledger
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE network_payments IS 'Individual payment events against a network_entry (e.g. ₡10,000 SINPE payment to Sindy).';

CREATE INDEX idx_network_payments_entry ON network_payments (network_entry_id);
CREATE INDEX idx_network_payments_date  ON network_payments (date);

ALTER TABLE network_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY network_payments_user_only ON network_payments
    USING (
        auth.uid() = (
            SELECT user_id FROM network_entries ne WHERE ne.id = network_entry_id
        )
    )
    WITH CHECK (
        auth.uid() = (
            SELECT user_id FROM network_entries ne WHERE ne.id = network_entry_id
        )
    );


-- =============================================================================
-- SECTION 8: GOOGLE SHEETS SYNC METADATA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- sheets_sync_config  (one row per sheet tab being watched)
-- ---------------------------------------------------------------------------
CREATE TABLE sheets_sync_config (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    spreadsheet_id   TEXT        NOT NULL,              -- Google Sheets file ID
    sheet_name       TEXT        NOT NULL,              -- Tab/sheet name within the file
    display_name     TEXT,                              -- Human label: "Movimientos", "Budget Q1 2024"
    sync_type        TEXT        NOT NULL
                         CHECK (sync_type IN ('transactions','budget','bonus','investment','other')),
    format_type      TEXT        NOT NULL DEFAULT 'structured'
                         CHECK (format_type IN ('structured','hoja1')),
                                                        -- structured = 2018+ main table; hoja1 = newer raw format
    header_row       INTEGER     NOT NULL DEFAULT 1,    -- 1-based row index of column headers
    data_start_row   INTEGER     NOT NULL DEFAULT 2,    -- 1-based row index where data begins
    last_synced_at   TIMESTAMPTZ,
    last_row_synced  INTEGER,                           -- last successfully imported row number
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, spreadsheet_id, sheet_name)
);

COMMENT ON TABLE  sheets_sync_config                IS 'Configuration record for each Google Sheets tab being polled by the sync Edge Function.';
COMMENT ON COLUMN sheets_sync_config.spreadsheet_id IS 'Google Sheets file ID extracted from the share URL.';
COMMENT ON COLUMN sheets_sync_config.format_type    IS 'structured = main TABLA DE REGISTRO table (2018+); hoja1 = newer lightweight format with label/vendor/amount columns.';
COMMENT ON COLUMN sheets_sync_config.last_row_synced IS 'The highest 1-based row number successfully processed. Used as resume cursor on next poll.';

CREATE INDEX idx_sheets_sync_config_user_id ON sheets_sync_config (user_id);

ALTER TABLE sheets_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY sheets_sync_config_user_only ON sheets_sync_config
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- sheets_sync_log  (one row per sync run per config)
-- ---------------------------------------------------------------------------
CREATE TABLE sheets_sync_log (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id       UUID        NOT NULL REFERENCES sheets_sync_config(id) ON DELETE CASCADE,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rows_processed  INTEGER     NOT NULL DEFAULT 0,
    rows_inserted   INTEGER     NOT NULL DEFAULT 0,
    rows_updated    INTEGER     NOT NULL DEFAULT 0,
    rows_skipped    INTEGER     NOT NULL DEFAULT 0,     -- already-imported duplicates
    error_message   TEXT,
    status          TEXT        NOT NULL DEFAULT 'success'
                        CHECK (status IN ('success','partial','error'))
);

COMMENT ON TABLE  sheets_sync_log              IS 'Audit log of every sync run. Used for debugging and rate-limit monitoring.';
COMMENT ON COLUMN sheets_sync_log.rows_skipped IS 'Rows already present (matched by external_id) — not re-inserted.';

CREATE INDEX idx_sheets_sync_log_config    ON sheets_sync_log (config_id);
CREATE INDEX idx_sheets_sync_log_synced_at ON sheets_sync_log (synced_at DESC);

ALTER TABLE sheets_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY sheets_sync_log_user_only ON sheets_sync_log
    USING (
        auth.uid() = (
            SELECT user_id FROM sheets_sync_config sc WHERE sc.id = config_id
        )
    )
    WITH CHECK (
        auth.uid() = (
            SELECT user_id FROM sheets_sync_config sc WHERE sc.id = config_id
        )
    );


-- =============================================================================
-- SECTION 9: SEED DATA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- currencies
-- ---------------------------------------------------------------------------
INSERT INTO currencies (code, name, symbol) VALUES
    ('CRC', 'Costa Rican Colón',  '₡'),
    ('USD', 'United States Dollar','$'),
    ('EUR', 'Euro',               '€')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- payment_sources  (T-1 through T-8 from spreadsheet "Fuente del movimiento")
-- ---------------------------------------------------------------------------
INSERT INTO payment_sources (code, name, source_type, bank_name) VALUES
    ('T-1', 'Tarjeta Débito BAC',      'debit',   'BAC Credomatic'),
    ('T-2', 'Tarjeta de Crédito HSBC', 'credit',  'HSBC'),
    ('T-3', 'Tarjeta de Crédito Citibank', 'credit', 'Citibank'),
    ('T-4', 'Tarjeta de Crédito Promérica', 'credit', 'Promérica'),
    ('T-5', 'Efectivo',                'cash',    NULL),
    ('T-6', 'Tarjeta de Crédito Fácil','credit',  'Fácil'),
    ('T-7', 'Depósito Cuenta Débito',  'deposit', NULL),
    ('T-8', 'Otro',                    'other',   NULL)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- transaction_categories
-- Income types (from "Tabla conceptos ingresos")
-- ---------------------------------------------------------------------------
INSERT INTO transaction_categories
    (code, name, parent_code, category_type, group_gasto, is_passive_income, sort_order)
VALUES
    -- Income
    ('INCOME',              'Ingresos',                  NULL,     'income',   'na',                   FALSE, 10),
    ('SALARY',              'Salario',                   'INCOME', 'income',   'na',                   FALSE, 11),
    ('SALARY_ESCOLAR',      'Salario Escolar',           'INCOME', 'income',   'na',                   FALSE, 12),
    ('AGUINALDO',           'Aguinaldo',                 'INCOME', 'income',   'na',                   FALSE, 13),
    ('INTEREST',            'Intereses',                 'INCOME', 'income',   'na',                   TRUE,  14),
    ('GIFT_INCOME',         'Regalo (ingreso)',          'INCOME', 'income',   'na',                   FALSE, 15),
    ('DEPOSIT_DEBIT',       'Depósito Cuenta Débito',    'INCOME', 'income',   'na',                   FALSE, 16),
    ('BONO',                'Bono',                      'INCOME', 'income',   'na',                   FALSE, 17),
    ('RENTAL_INCOME',       'Ingreso por alquiler',      'INCOME', 'income',   'na',                   TRUE,  18),

    -- Expense — Food
    ('FOOD',                'Alimentación',              NULL,     'expense',  'necesario',            TRUE,  100),
    ('FOOD_OUT',            'Comida fuera',              'FOOD',   'expense',  'personal',             FALSE, 101),
    ('FOOD_SUPER',          'Supermercado',              'FOOD',   'expense',  'necesario',            TRUE,  102),

    -- Expense — Transport
    ('TRANSPORT',           'Transporte',                NULL,     'expense',  'necesario',            TRUE,  200),
    ('TRANSPORT_FUEL',      'Combustible',               'TRANSPORT','expense','necesario',            TRUE,  201),
    ('TRANSPORT_MAINT',     'Mantenimiento de carro',    'TRANSPORT','expense','necesario',            FALSE, 202),
    ('TRANSPORT_TOLLS',     'Peajes',                    'TRANSPORT','expense','necesario',            TRUE,  203),
    ('TRANSPORT_PARKING',   'Parqueo',                   'TRANSPORT','expense','personal',             FALSE, 204),
    ('CAR_EXPENSES',        'Gastos de Carro',           'TRANSPORT','expense','necesario',            FALSE, 205),

    -- Expense — Services / Utilities
    ('SERVICES',            'Servicios',                 NULL,     'expense',  'necesario',            TRUE,  300),
    ('SERVICES_ELECTRIC',   'Electricidad',              'SERVICES','expense', 'necesario',            TRUE,  301),
    ('SERVICES_WATER',      'Agua',                      'SERVICES','expense', 'necesario',            TRUE,  302),
    ('SERVICES_INTERNET',   'Internet',                  'SERVICES','expense', 'necesario',            TRUE,  303),
    ('SERVICES_PHONE',      'Teléfono / Celular',        'SERVICES','expense', 'necesario',            TRUE,  304),
    ('SERVICES_STREAMING',  'Streaming',                 'SERVICES','expense', 'personal',             FALSE, 305),
    ('RENT_SERVICE',        'Alquiler servicio',         'SERVICES','expense', 'necesario',            TRUE,  306),

    -- Expense — Health
    ('HEALTH',              'Salud',                     NULL,     'expense',  'necesario',            TRUE,  400),
    ('HEALTH_MEDS',         'Medicamentos',              'HEALTH', 'expense',  'necesario',            TRUE,  401),
    ('HEALTH_CONSULT',      'Consultas médicas',         'HEALTH', 'expense',  'necesario',            TRUE,  402),
    ('HEALTH_DENTAL',       'Dental',                    'HEALTH', 'expense',  'necesario',            FALSE, 403),
    ('HEALTH_GYM',          'Gimnasio',                  'HEALTH', 'expense',  'personal',             FALSE, 404),

    -- Expense — Entertainment
    ('ENTERTAINMENT',       'Entretenimiento',           NULL,     'expense',  'personal',             FALSE, 500),
    ('ENTERTAINMENT_DINING','Restaurantes',              'ENTERTAINMENT','expense','personal',         FALSE, 501),
    ('ENTERTAINMENT_EVENTS','Eventos / Salidas',         'ENTERTAINMENT','expense','personal',         FALSE, 502),
    ('ENTERTAINMENT_SUBS',  'Suscripciones',             'ENTERTAINMENT','expense','personal',         FALSE, 503),

    -- Expense — Clothing
    ('CLOTHING',            'Vestimenta',                NULL,     'expense',  'personal',             FALSE, 600),

    -- Expense — Home
    ('HOME',                'Artículos de casa',         NULL,     'expense',  'necesario',            FALSE, 700),
    ('HOME_RENO',           'Remodelación / mejoras',    'HOME',   'expense',  'necesario',            FALSE, 701),

    -- Expense — Personal care (Mariam / Sita / Emma)
    ('PERSONAL_MARIAM',     'Mariam',                    NULL,     'expense',  'personal',             FALSE, 800),
    ('PERSONAL_SITA',       'Sita',                      NULL,     'expense',  'personal',             FALSE, 801),
    ('PERSONAL_EMMA',       'Emma',                      NULL,     'expense',  'personal',             FALSE, 802),

    -- Expense — Insurance
    ('INSURANCE',           'Seguros',                   NULL,     'expense',  'necesario',            FALSE, 900),
    ('INSURANCE_CAR',       'Seguro de carro',           'INSURANCE','expense','necesario',            FALSE, 901),
    ('INSURANCE_LIFE',      'Seguro de vida',            'INSURANCE','expense','necesario',            FALSE, 902),
    ('INSURANCE_HEALTH',    'Seguro médico',             'INSURANCE','expense','necesario',            FALSE, 903),

    -- Expense — Work payments
    ('WORK_PAYMENTS',       'Pagos del trabajo',         NULL,     'expense',  'na',                   FALSE, 1000),

    -- Expense — Affiliations / subscriptions
    ('AFFILIATIONS',        'Pago de afiliaciones',      NULL,     'expense',  'personal',             FALSE, 1100),

    -- Expense — Savings / Financial objectives
    ('SAVINGS',             'Ahorro',                    NULL,     'expense',  'objetivos_financieros',FALSE, 1200),
    ('SAVINGS_TRAVEL',      'Ahorro viaje',              'SAVINGS','expense',  'objetivos_financieros',FALSE, 1201),
    ('SAVINGS_DAUGHTERS',   'Ahorro hijas',              'SAVINGS','expense',  'objetivos_financieros',FALSE, 1202),
    ('SAVINGS_PENSION',     'Pensión voluntaria',        'SAVINGS','expense',  'objetivos_financieros',FALSE, 1203),
    ('SAVINGS_INVESTMENT',  'Inversión',                 'SAVINGS','expense',  'objetivos_financieros',FALSE, 1204),
    ('SAVINGS_FU',          'FU Money',                  'SAVINGS','expense',  'objetivos_financieros',FALSE, 1205),

    -- Expense — Loans
    ('LOANS',               'Préstamos',                 NULL,     'expense',  'necesario',            FALSE, 1300),
    ('LOAN_PAYMENT',        'Pago de Préstamos',         'LOANS',  'expense',  'necesario',            FALSE, 1301),

    -- Transfer
    ('TRANSFER',            'Transferencia',             NULL,     'transfer', 'na',                   FALSE, 2000),
    ('CASH_WITHDRAWAL',     'Retiro de efectivo',        'TRANSFER','transfer','na',                   FALSE, 2001)

ON CONFLICT (code) DO NOTHING;
