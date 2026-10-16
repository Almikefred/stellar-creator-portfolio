import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/db';

/**
 * POST /api/teams
 * GET  /api/teams
 *
 * Team/agency accounts (issue #1610): a team is a named group of creators
 * with an agreed payout split, used to apply to bounties together via
 * POST /api/bounties/[id]/apply. The caller becomes the team's owner and
 * must include themselves among the members; splits must sum to exactly
 * 100.
 */

const memberSchema = z.object({
  userId: z.string().min(1),
  payoutSplitPercent: z.number().int().min(1).max(100),
});

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  members: z.array(memberSchema).min(1).max(20),
});

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const teams = await prisma.team.findMany({
    where: { OR: [{ ownerId: session.user.id }, { members: { some: { userId: session.user.id } } }] },
    include: { members: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ teams });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createTeamSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { name, members } = parsed.data;

  const userIds = members.map((m) => m.userId);
  if (new Set(userIds).size !== userIds.length) {
    return NextResponse.json({ error: 'Duplicate member in team' }, { status: 400 });
  }
  if (!userIds.includes(session.user.id)) {
    return NextResponse.json(
      { error: 'The team owner must be included as a member' },
      { status: 400 },
    );
  }
  const totalSplit = members.reduce((sum, m) => sum + m.payoutSplitPercent, 0);
  if (totalSplit !== 100) {
    return NextResponse.json(
      { error: `Member payout splits must sum to exactly 100 (got ${totalSplit})` },
      { status: 400 },
    );
  }

  const existingUsers = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });
  if (existingUsers.length !== userIds.length) {
    return NextResponse.json({ error: 'One or more members do not exist' }, { status: 400 });
  }

  const team = await prisma.team.create({
    data: {
      name,
      ownerId: session.user.id,
      members: {
        create: members.map((m) => ({ userId: m.userId, payoutSplitPercent: m.payoutSplitPercent })),
      },
    },
    include: { members: true },
  });

  return NextResponse.json(team, { status: 201 });
}
