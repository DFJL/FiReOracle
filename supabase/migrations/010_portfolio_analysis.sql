-- envelope_type: semantic role of each savings envelope
ALTER TABLE savings_envelopes
  ADD COLUMN IF NOT EXISTS envelope_type TEXT
    CHECK (envelope_type IN ('liquidez', 'emergencia', 'meta_especifica', 'inversion'));

-- portfolio_targets: user-defined allocation targets per investment bucket
CREATE TABLE IF NOT EXISTS portfolio_targets (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_key           TEXT          NOT NULL,   -- bucket id or 'envelope_type:<type>'
  label                TEXT          NOT NULL,
  target_pct_portfolio NUMERIC(5,2),             -- % of total net worth
  target_pct_income    NUMERIC(5,2),             -- % of monthly income to contribute
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, bucket_key)
);

ALTER TABLE portfolio_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY portfolio_targets_user_only ON portfolio_targets
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
