-- movement_type nullable: some sheet rows (headers, corte rows) have no movement type
ALTER TABLE transactions ALTER COLUMN movement_type DROP NOT NULL;
