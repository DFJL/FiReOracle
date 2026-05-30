-- transactions: user_id nullable (sync runs as service role with no user context)
-- date + amount nullable (some sheet rows are informational, e.g. corte rows without amounts)
ALTER TABLE transactions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE transactions ALTER COLUMN date DROP NOT NULL;
ALTER TABLE transactions ALTER COLUMN amount DROP NOT NULL;

-- Other tables written by the sync service
ALTER TABLE network_entries ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE investment_snapshots ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE account_balance_snapshots ALTER COLUMN user_id DROP NOT NULL;
