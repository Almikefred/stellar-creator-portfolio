/**
 * Admin Skill Synonyms API — /api/admin/skills/[skillId]/synonyms (issue #1617)
 *
 * GET  → synonyms for this skill (built-in or admin-added).
 * POST → add a synonym; used in search matching (app/api/skills/route.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma';
import { addSynonym, listSynonyms } from '@/lib/skills-taxonomy-admin';
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
  synonym: z.string().min(1).max(50),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ skillId: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { skillId } = await params;
  const synonyms = await listSynonyms(skillId);
  return NextResponse.json({ synonyms });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ skillId: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { skillId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let synonym;
  try {
    synonym = await addSynonym({ skillId, synonym: parsed.data.synonym, createdById: auth.adminId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add synonym';
    const notFound = message.startsWith('Unknown skill');
    return NextResponse.json({ error: message }, { status: notFound ? 404 : 409 });
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.adminId,
      resource: 'skill_synonym',
      action: 'create',
      resourceId: synonym.id,
      status: 'SUCCESS',
      payload: { skillId, synonym: parsed.data.synonym },
      requestPath: req.nextUrl.pathname,
      httpMethod: 'POST',
    },
  });

  return NextResponse.json(synonym, { status: 201 });
}
