-- Fix category classification flags derived from the transactional catalog (Google Sheets)
-- Columns: PassiveIncome, SurvivalExpense, is_settlement

-- 1. Add is_settlement column for liquidación de inversión entries
ALTER TABLE transaction_categories
  ADD COLUMN IF NOT EXISTS is_settlement BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Fix corrupted is_passive_income: expense categories should never be TRUE
--    (the seed data accidentally set is_passive_income=TRUE for survival expense categories)
UPDATE transaction_categories
SET is_passive_income = FALSE
WHERE category_type = 'expense' AND is_passive_income = TRUE;

-- 3. Set is_survival_expense correctly from catalog (SurvivalExpense=1 rows)
UPDATE transaction_categories
SET is_survival_expense = TRUE
WHERE code IN (
  'FOOD_SUPER',        -- Abarrotes / Supermercado
  'HOME',              -- Artículos de casa / limpieza / jabón
  'SERVICES_ELECTRIC', -- Electricidad
  'SERVICES_WATER',    -- Agua
  'SERVICES_INTERNET', -- Internet
  'SERVICES_PHONE',    -- Teléfono / Celular
  'RENT_SERVICE',      -- Alquiler
  'HEALTH_MEDS',       -- Medicamentos
  'HEALTH',            -- Salud general
  'LOAN_PAYMENT',      -- Préstamos hipotecario / prendario
  'TAXES',             -- Impuestos municipales
  'PERSONAL_EMMA'      -- Manutención Emma
);

-- 4. Ensure correct is_passive_income for key income categories
UPDATE transaction_categories
SET is_passive_income = TRUE
WHERE code IN ('INTEREST', 'RENTAL_INCOME', 'PASSIVE_INCOME');

-- 5. Add investment income categories that map to the spreadsheet catalog
INSERT INTO transaction_categories
  (code, name, parent_code, category_type, group_gasto, is_passive_income, is_settlement, sort_order)
VALUES
  -- Rendimientos activos (I-32, I-37, I-39, I-42, etc.) → passive income, not settlement
  ('INVESTMENT_RETURN',    'Rendimientos de inversión', 'PASSIVE_INCOME', 'income', 'na', TRUE,  FALSE, 20),
  -- Liquidación de capital (I-34, I-38, I-41, I-43, etc.) → settlement, not real income
  ('INVESTMENT_LIQUIDATION','Liquidación de inversión',  'INCOME',         'income', 'na', FALSE, TRUE,  26),
  -- Savings liquidation (I-23, I-24, I-25, etc.)
  ('SAVINGS_LIQUIDATION',  'Liquidación de ahorros',    'INCOME',         'income', 'na', FALSE, FALSE, 27)
ON CONFLICT (code) DO UPDATE
  SET is_passive_income = EXCLUDED.is_passive_income,
      is_settlement      = EXCLUDED.is_settlement,
      is_active          = TRUE;
