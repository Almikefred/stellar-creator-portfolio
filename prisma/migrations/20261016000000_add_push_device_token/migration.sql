-- Mobile: send push token to the backend.
--
-- There was no table to register an Expo push token against at all, so
-- mobile had nothing to call after sign-in / on token refresh. This adds
-- the minimal table the new /api/push/register route writes to.

CREATE TABLE IF NOT EXISTS "PushDeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushDeviceToken_userId_token_key" ON "PushDeviceToken"("userId", "token");
CREATE INDEX IF NOT EXISTS "PushDeviceToken_userId_idx" ON "PushDeviceToken"("userId");

DO $$ BEGIN
  ALTER TABLE "PushDeviceToken" ADD CONSTRAINT "PushDeviceToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
