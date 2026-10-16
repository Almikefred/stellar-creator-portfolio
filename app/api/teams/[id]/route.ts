import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/teams/[id]
 *
 * Visible to the team's owner and members only — a bounty poster deciding
 * whether to accept a team application sees the split via the
 * application's `team` relation (see app/api/bounties/[id]/apply), not
 * through this route.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const team = await prisma.team.findUnique({
    where: { id },
    include: { members: { include: { user: { select: { id: true, name: true } } } } },
  });

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  const isMember = team.ownerId === session.user.id || team.members.some((m) => m.userId === session.user.id);
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(team);
}
