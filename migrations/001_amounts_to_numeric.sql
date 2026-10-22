-- For existing installations only. Make and verify a full backup first.
-- New databases now use NUMERIC(14,2) for the amount columns.
-- Review historical precision: this conversion rounds stored REAL values
-- to two decimals. Inspect and reconcile data before a production rollout.
BEGIN;
ALTER TABLE expenses ALTER COLUMN amount TYPE NUMERIC(14,2) USING ROUND(amount::numeric, 2);
ALTER TABLE expense_splits ALTER COLUMN amount TYPE NUMERIC(14,2) USING ROUND(amount::numeric, 2);
ALTER TABLE settlements ALTER COLUMN amount TYPE NUMERIC(14,2) USING ROUND(amount::numeric, 2);
COMMIT;
