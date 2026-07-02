-- Add expense categories referenced in the concept catalog but missing from the schema.
-- All inserts are idempotent (ON CONFLICT DO NOTHING).

INSERT INTO transaction_categories
  (code, name, parent_code, category_type, group_gasto, is_passive_income, is_survival_expense, is_settlement, sort_order)
VALUES
  ('MISC_EXPENSE',  'Gastos varios',         NULL, 'expense', 'personal',  FALSE, FALSE, FALSE, 1400),
  ('PERSONAL_CARE', 'Cuidado personal',       NULL, 'expense', 'personal',  FALSE, FALSE, FALSE, 1500),
  ('EDUCATION',     'Educación',              NULL, 'expense', 'personal',  FALSE, FALSE, FALSE, 1600),
  ('TAXES',         'Impuestos',              NULL, 'expense', 'necesario', FALSE, TRUE,  FALSE, 1700),
  ('GIFTS',         'Regalos y donaciones',   NULL, 'expense', 'personal',  FALSE, FALSE, FALSE, 1800)
ON CONFLICT (code) DO NOTHING;
