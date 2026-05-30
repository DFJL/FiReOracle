-- user_id nullable for system-level configs
ALTER TABLE sheets_sync_config ALTER COLUMN user_id DROP NOT NULL;

-- Expand format_type: add 'budget'
ALTER TABLE sheets_sync_config DROP CONSTRAINT IF EXISTS sheets_sync_config_format_type_check;
ALTER TABLE sheets_sync_config ADD CONSTRAINT sheets_sync_config_format_type_check
  CHECK (format_type = ANY (ARRAY['structured', 'hoja1', 'budget']));

-- Expand sync_type: add 'network'
ALTER TABLE sheets_sync_config DROP CONSTRAINT IF EXISTS sheets_sync_config_sync_type_check;
ALTER TABLE sheets_sync_config ADD CONSTRAINT sheets_sync_config_sync_type_check
  CHECK (sync_type = ANY (ARRAY['transactions', 'budget', 'bonus', 'investment', 'network', 'other']));

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Seed: Control de Ingresos y Egresos
INSERT INTO sheets_sync_config
  (spreadsheet_id, sheet_name, sync_type, format_type, header_row, data_start_row, is_active, last_row_synced)
VALUES
  ('1Z1qvyLgRyibHrK95VJVD_TZN2XhqZnYS', 'movimientos', 'transactions', 'structured', 6, 7, true, 6)
ON CONFLICT DO NOTHING;

-- Seed: Budget workbook tabs
INSERT INTO sheets_sync_config
  (spreadsheet_id, sheet_name, sync_type, format_type, header_row, data_start_row, is_active, last_row_synced)
VALUES
  ('16nJRVkCQ2grI31TQqdGx12KBe0a1aXW2', 'liquidacionSindy', 'network',    'budget', 1, 2, true, 1),
  ('16nJRVkCQ2grI31TQqdGx12KBe0a1aXW2', 'Hoja1',            'investment', 'budget', 1, 2, true, 1)
ON CONFLICT DO NOTHING;

-- pg_cron: trigger Edge Function every hour
-- app.edge_function_url and app.service_role_key must be set after deploy:
--   ALTER DATABASE postgres SET app.edge_function_url = 'https://<id>.supabase.co/functions/v1';
--   ALTER DATABASE postgres SET app.service_role_key = '<service-role-key>';
SELECT cron.schedule(
  'sheets-sync-hourly',
  '0 * * * *',
  $$
    SELECT pg_net.http_post(
      url     := current_setting('app.edge_function_url', true) || '/sheets-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    );
  $$
);
