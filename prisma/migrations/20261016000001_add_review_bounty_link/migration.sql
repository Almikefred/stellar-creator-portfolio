-- Ties a Review to the completed bounty it's about (issue #1608).
-- Nullable so existing rows (which predate this column) are left alone;
-- new reviews are required to set it at the application level.

ALTER TABLE "Review"
  ADD COLUMN IF NOT EXISTS "bountyId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Review"
    ADD CONSTRAINT "Review_bountyId_fkey"
    FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Postgres treats each NULL as distinct, so pre-existing rows with no
-- bountyId never collide with each other here; this only blocks a second
-- review by the same reviewer for the same bounty going forward.
DO $$ BEGIN
  ALTER TABLE "Review"
    ADD CONSTRAINT "Review_reviewerId_bountyId_key" UNIQUE ("reviewerId", "bountyId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
