-- Creator availability flag + rate card (issue #1609).
-- All nullable / defaulted so existing rows need no backfill.

ALTER TABLE "CreatorProfile"
  ADD COLUMN IF NOT EXISTS "acceptingWork" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "hourlyRate" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "projectRateMin" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "projectRateMax" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "CreatorProfile_acceptingWork_idx" ON "CreatorProfile"("acceptingWork");
