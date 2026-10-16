-- Issue #1617: let admins add skills and synonyms to improve search matching.

CREATE TABLE IF NOT EXISTS "AdminSkill" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSkill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminSkill_skillId_key" ON "AdminSkill"("skillId");
CREATE INDEX IF NOT EXISTS "AdminSkill_skillId_idx" ON "AdminSkill"("skillId");
CREATE INDEX IF NOT EXISTS "AdminSkill_category_idx" ON "AdminSkill"("category");

CREATE TABLE IF NOT EXISTS "SkillSynonym" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "adminSkillId" TEXT,
    "synonym" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillSynonym_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SkillSynonym_skillId_synonym_key" ON "SkillSynonym"("skillId", "synonym");
CREATE INDEX IF NOT EXISTS "SkillSynonym_skillId_idx" ON "SkillSynonym"("skillId");

DO $$ BEGIN
  ALTER TABLE "AdminSkill" ADD CONSTRAINT "AdminSkill_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SkillSynonym" ADD CONSTRAINT "SkillSynonym_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SkillSynonym" ADD CONSTRAINT "SkillSynonym_adminSkillId_fkey"
    FOREIGN KEY ("adminSkillId") REFERENCES "AdminSkill"("skillId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
