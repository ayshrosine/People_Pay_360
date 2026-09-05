-- Period-correctness, enforced by the database rather than by application code.
--
-- Two RUNNING contracts for the same employee must never cover overlapping
-- dates, otherwise "which contract applies to this payroll period?" has more
-- than one answer and payroll silently picks one at random.
--
-- Apply once against Neon (psql, or the Neon SQL editor):
--   psql "$DATABASE_URL" -f prisma/sql/001_no_overlapping_running_contracts.sql

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Contract"
  DROP CONSTRAINT IF EXISTS no_overlapping_running_contracts;

ALTER TABLE "Contract"
  ADD CONSTRAINT no_overlapping_running_contracts
  EXCLUDE USING gist (
    "employeeId" WITH =,
    daterange("startDate"::date, COALESCE("endDate"::date, 'infinity'::date), '[]') WITH &&
  )
  WHERE (status = 'RUNNING');
