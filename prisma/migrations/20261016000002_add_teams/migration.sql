-- Teams / agencies that can apply to bounties together (issue #1610).

CREATE TABLE IF NOT EXISTS "Team" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "ownerId"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "Team"
    ADD CONSTRAINT "Team_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Team_ownerId_idx" ON "Team"("ownerId");

CREATE TABLE IF NOT EXISTS "TeamMember" (
  "id"                 TEXT PRIMARY KEY,
  "teamId"             TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "payoutSplitPercent" INTEGER NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  ALTER TABLE "TeamMember"
    ADD CONSTRAINT "TeamMember_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamMember"
    ADD CONSTRAINT "TeamMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamMember"
    ADD CONSTRAINT "TeamMember_teamId_userId_key" UNIQUE ("teamId", "userId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "TeamMember_teamId_idx" ON "TeamMember"("teamId");
CREATE INDEX IF NOT EXISTS "TeamMember_userId_idx" ON "TeamMember"("userId");

ALTER TABLE "BountyApplication"
  ADD COLUMN IF NOT EXISTS "teamId" TEXT;

DO $$ BEGIN
  ALTER TABLE "BountyApplication"
    ADD CONSTRAINT "BountyApplication_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BountyApplication_teamId_idx" ON "BountyApplication"("teamId");
