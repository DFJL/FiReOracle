-- Add missing income categories derived from the full Google Sheets catalog (I-1 through I-65).
-- All new categories are inserted idempotently (ON CONFLICT DO NOTHING).

-- ── Under INCOME (non-passive) ─────────────────────────────────────────────────

INSERT INTO transaction_categories
  (code, name, parent_code, category_type, group_gasto, is_passive_income, is_settlement, sort_order)
VALUES
  -- I-8, I-10, I-11, I-12, I-15, I-16: FCL, viáticos, clases, excedentes laborales
  ('WORK_OTHER',        'Otros ingresos laborales',  'INCOME', 'income', 'na', FALSE, FALSE, 19),
  -- I-7, I-13, I-14, I-18: depósitos misc, no identificados
  ('MISC_INCOME',       'Ingreso misceláneo',        'INCOME', 'income', 'na', FALSE, FALSE, 21),
  -- I-22: Reembolso Seguro / otros reembolsos
  ('REIMBURSEMENT',     'Reembolso',                 'INCOME', 'income', 'na', FALSE, FALSE, 22),
  -- I-19, I-65: Venta de bienes muebles / inmuebles
  ('ASSET_SALE',        'Venta de activos',          'INCOME', 'income', 'na', FALSE, FALSE, 23),
  -- I-36: Liquidación Laboral (severance)
  ('LABOR_SETTLEMENT',  'Liquidación laboral',       'INCOME', 'income', 'na', FALSE, FALSE, 24),
  -- I-9: Préstamo recibido (not income per se, but recorded as ingreso)
  ('LOAN_RECEIVED',     'Préstamo recibido',         'INCOME', 'income', 'na', FALSE, FALSE, 25)
ON CONFLICT (code) DO NOTHING;

-- ── Under PASSIVE_INCOME (passive=true) ────────────────────────────────────────

INSERT INTO transaction_categories
  (code, name, parent_code, category_type, group_gasto, is_passive_income, is_settlement, sort_order)
VALUES
  -- I-29, I-31, I-63: Intereses CDP, Scotiabank, ahorros en general
  ('SAVINGS_INTEREST',        'Intereses de ahorros',          'PASSIVE_INCOME', 'income', 'na', TRUE, FALSE, 30),
  -- I-30: Excedentes de cooperativa / ahorros
  ('SAVINGS_EXCEDENTES',      'Excedentes de ahorros',         'PASSIVE_INCOME', 'income', 'na', TRUE, FALSE, 31),
  -- I-50, I-55, I-56, I-59, I-61: Farming, Anchor, Nodos, Hodl crypto
  ('INVESTMENT_RETURN_CRYPTO','Rendimientos Farming / Crypto',  'PASSIVE_INCOME', 'income', 'na', TRUE, FALSE, 32),
  -- I-54: Minería Ethereum / tarjetas gráficas
  ('INVESTMENT_RETURN_MINING','Minería Crypto',                 'PASSIVE_INCOME', 'income', 'na', TRUE, FALSE, 33),
  -- I-33, I-40, I-47, I-58, I-60: cash-out of accumulated returns (not capital withdrawal)
  ('INVESTMENT_RETURN_LIQUID','Liquidación de Rendimientos',    'PASSIVE_INCOME', 'income', 'na', TRUE, FALSE, 35),
  -- I-62: unrealized appreciation (crypto / fund value increases)
  ('APPRECIATION',            'Aumento de valor / plusvalía',   'PASSIVE_INCOME', 'income', 'na', TRUE, FALSE, 36)
ON CONFLICT (code) DO NOTHING;
