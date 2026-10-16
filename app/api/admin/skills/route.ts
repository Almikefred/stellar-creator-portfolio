/**
 * Admin Skills API — /api/admin/skills (issue #1617)
 *
 * GET  → admin-added skills (built-ins aren't listed here — they live in
 *        lib/skills-taxonomy.ts and aren't editable at runtime)
 * POST → add a brand-new skill to the taxonomy
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma';
import {
  createAdminSkill,
  isValidSkillCategory,
  isValidSkillId,
  listAdminSkills,
} from '@/lib/skills-taxonomy-admin';
import { z } from 'zod';

async function requireAdmin(
  req: NextRequest,
): Promise<{ error: NextResponse; adminId?: undefined } | { error?: undefined; adminId: string }> {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const adminId = (session?.user as { id?: string })?.id;
  if (!session || role !== 'ADMIN' || !adminId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { adminId };
}

const createSchema = z.object({
  skillId: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  category: z.string(),
  aliases: z.array(z.string().min(1).max(50)).max(20).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const skills = await listAdminSkills();
  return NextResponse.json({ skills, total: skills.length });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { skillId, name, category, aliases } = parsed.data;

  if (!isValidSkillId(skillId)) {
    return NextResponse.json(
      { error: 'skillId must be lowercase, alphanumeric words separated by single hyphens (e.g. "zig", "move-lang")' },
      { status: 400 },
    );
  }
  if (!isValidSkillCategory(category)) {
    return NextResponse.json({ error: `category must be one of the known SkillCategory values` }, { status: 400 });
  }

  let skill;
  try {
    skill = await createAdminSkill({ skillId, name, category, aliases, createdById: auth.adminId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create skill';
    // Unique constraint (skillId already taken by another admin skill) vs.
    // "already in the built-in taxonomy" (thrown by createAdminSkill) both
    // read as a 409 — either way, the caller asked to create something
    // that already exists.
    return NextResponse.json({ error: message }, { status: 409 });
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.adminId,
      resource: 'skill_taxonomy',
      action: 'create',
      resourceId: skill.id,
      status: 'SUCCESS',
      payload: { skillId, name, category, aliases: aliases ?? [] },
      requestPath: req.nextUrl.pathname,
      httpMethod: 'POST',
    },
  });

  return NextResponse.json(skill, { status: 201 });
}
