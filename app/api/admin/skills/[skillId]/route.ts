/**
 * Admin Skill Detail API — /api/admin/skills/[skillId] (issue #1617)
 *
 * DELETE → remove an admin-added skill (cascades its synonyms).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma';
import { deleteAdminSkill } from '@/lib/skills-taxonomy-admin';

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ skillId: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { skillId } = await params;

  const deleted = await deleteAdminSkill(skillId).catch(() => null);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.adminId,
      resource: 'skill_taxonomy',
      action: 'delete',
      resourceId: deleted.id,
      status: 'SUCCESS',
      payload: { skillId, name: deleted.name, category: deleted.category },
      requestPath: req.nextUrl.pathname,
      httpMethod: 'DELETE',
    },
  });

  return NextResponse.json({ deleted: true });
}
