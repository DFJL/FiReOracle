-- RENTAL_EXPENSE was incorrectly set to group_gasto='objetivos_financieros', which routed
-- those transactions to the Ahorros tab instead of Gastos. Correct it to 'personal' so
-- rental property operating costs appear as real cash outflows in the summary.

UPDATE transaction_categories
SET group_gasto = 'personal'
WHERE code = 'RENTAL_EXPENSE';

-- Fix existing transactions that inherited the wrong expense_group from the category.
UPDATE transactions
SET expense_group = 'personal'
WHERE category_code = 'RENTAL_EXPENSE'
  AND expense_group = 'objetivos_financieros';
