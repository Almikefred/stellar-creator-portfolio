-- Notifications: digest emails (daily/weekly).
--
-- Adds the per-user frequency preference and a cursor (lastDigestSentAt)
-- so the digest job knows which unread notifications have already been
-- included in a previous digest.

DO $$ BEGIN
  CREATE TYPE "DigestFrequency" AS ENUM ('NONE', 'DAILY', 'WEEKLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "NotificationPreference"
  ADD COLUMN IF NOT EXISTS "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'DAILY',
  ADD COLUMN IF NOT EXISTS "lastDigestSentAt" TIMESTAMP(3);
