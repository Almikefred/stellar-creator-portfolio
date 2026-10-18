/**
 * DB-backed layer on top of the static `SKILLS_TAXONOMY` (issue #1617).
 *
 * `lib/skills-taxonomy.ts`'s `searchSkills`/`resolveSkillId`/`getSkillById`
 * stay synchronous and untouched — the skill combobox UI
 * (`components/ui/skill-combobox.tsx`) calls them directly and doesn't need
 * synonym support to keep working. This module adds the admin-managed,
 * database-backed pieces on top: brand-new skills and extra search
 * synonyms, used by `app/api/skills/route.ts` (search) and
 * `app/api/admin/skills/**` (CRUD).
 */
import { prisma } from '@/lib/prisma';
import {
  SKILLS_TAXONOMY,
  getSkillById,
  type SkillCategory,
  type SkillNode,
} from '@/lib/skills-taxonomy';

export const SKILL_CATEGORIES: SkillCategory[] = [
  'Languages',
  'Frameworks',
  'Design',
  'Disciplines',
  'Tools',
  'Blockchain',
];

const SKILL_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSkillId(value: string): boolean {
  return SKILL_ID_PATTERN.test(value);
}

export function isValidSkillCategory(value: string): value is SkillCategory {
  return (SKILL_CATEGORIES as string[]).includes(value);
}

/** All admin-added skills, each shaped like a built-in `SkillNode`. */
export async function listAdminSkills(): Promise<SkillNode[]> {
  const rows = await prisma.adminSkill.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map((row) => ({
    id: row.skillId,
    name: row.name,
    aliases: row.aliases,
    category: row.category as SkillCategory,
  }));
}

/**
 * Resolves `skillId` against the built-in taxonomy first, then
 * admin-added skills. Used to validate a synonym's target before writing
 * it, and to resolve a matched synonym back to a full `SkillNode`.
 */
export async function resolveAnySkill(skillId: string): Promise<SkillNode | null> {
  const builtin = getSkillById(skillId);
  if (builtin) return builtin;

  const admin = await prisma.adminSkill.findUnique({ where: { skillId } });
  if (!admin) return null;

  return {
    id: admin.skillId,
    name: admin.name,
    aliases: admin.aliases,
    category: admin.category as SkillCategory,
  };
}

export async function createAdminSkill(input: {
  skillId: string;
  name: string;
  category: SkillCategory;
  aliases?: string[];
  createdById?: string | null;
}) {
  if (getSkillById(input.skillId)) {
    throw new Error(`"${input.skillId}" already exists in the built-in taxonomy`);
  }

  return prisma.adminSkill.create({
    data: {
      skillId: input.skillId,
      name: input.name,
      category: input.category,
      aliases: input.aliases ?? [],
      createdById: input.createdById ?? null,
    },
  });
}

export async function deleteAdminSkill(skillId: string) {
  // Synonyms with adminSkillId set cascade-delete via the FK; nothing else
  // to clean up here.
  return prisma.adminSkill.delete({ where: { skillId } });
}

export async function listSynonyms(skillId?: string) {
  return prisma.skillSynonym.findMany({
    where: skillId ? { skillId } : undefined,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Adds a synonym for `skillId`, which may be a built-in taxonomy id or an
 * admin-added skill's id — throws if it's neither (#1617: synonyms must
 * attach to a real skill, not create one implicitly).
 */
export async function addSynonym(input: {
  skillId: string;
  synonym: string;
  createdById?: string | null;
}) {
  const target = await resolveAnySkill(input.skillId);
  if (!target) {
    throw new Error(`Unknown skill "${input.skillId}" — add it first via POST /api/admin/skills`);
  }

  const isAdminSkill = !getSkillById(input.skillId);

  return prisma.skillSynonym.create({
    data: {
      skillId: input.skillId,
      adminSkillId: isAdminSkill ? input.skillId : null,
      synonym: input.synonym,
      createdById: input.createdById ?? null,
    },
  });
}

export async function deleteSynonym(id: string) {
  return prisma.skillSynonym.delete({ where: { id } });
}

/**
 * Search including admin-added skills and synonyms — what
 * `app/api/skills/route.ts` calls. Combines three signals:
 *  1. The static `searchSkills` behaviour (name/alias substring match)
 *     over built-ins + admin-added skills.
 *  2. Synonym substring matches, resolved back to their target skill.
 * Deduplicates by skill id, built-in/admin name matches ranked first.
 */
export async function searchSkillsWithSynonyms(query: string, limit = 8): Promise<SkillNode[]> {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const adminSkills = await listAdminSkills();
  const allSkills = [...SKILLS_TAXONOMY, ...adminSkills];

  const nameMatches: SkillNode[] = [];
  const aliasMatches: SkillNode[] = [];
  for (const skill of allSkills) {
    if (skill.name.toLowerCase().includes(q)) {
      nameMatches.push(skill);
    } else if (skill.aliases.some((a) => a.toLowerCase().includes(q))) {
      aliasMatches.push(skill);
    }
  }

  const matchedSoFar = new Set([...nameMatches, ...aliasMatches].map((s) => s.id));

  const synonymRows = await prisma.skillSynonym.findMany({
    where: { synonym: { contains: q, mode: 'insensitive' } },
  });

  const synonymMatches: SkillNode[] = [];
  for (const row of synonymRows) {
    if (matchedSoFar.has(row.skillId)) continue;
    const resolved = allSkills.find((s) => s.id === row.skillId) ?? (await resolveAnySkill(row.skillId));
    if (resolved && !matchedSoFar.has(resolved.id)) {
      synonymMatches.push(resolved);
      matchedSoFar.add(resolved.id);
    }
  }

  return [...nameMatches, ...aliasMatches, ...synonymMatches].slice(0, limit);
}
