import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

vi.mock('@/lib/auth/auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    team: { create: vi.fn() },
  },
}));

import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';

const mockSession = { user: { id: 'owner-1', name: 'Owner One' } };

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/teams', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/teams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'owner-1' },
      { id: 'member-2' },
    ]);
  });

  it('401s when there is no session', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(
      postRequest({ name: 'A', members: [{ userId: 'owner-1', payoutSplitPercent: 100 }] }),
    );
    expect(res.status).toBe(401);
  });

  it('400s when splits do not sum to 100', async () => {
    const res = await POST(
      postRequest({
        name: 'Agency',
        members: [
          { userId: 'owner-1', payoutSplitPercent: 50 },
          { userId: 'member-2', payoutSplitPercent: 40 },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it('400s when the caller is not among the members', async () => {
    const res = await POST(
      postRequest({ name: 'Agency', members: [{ userId: 'member-2', payoutSplitPercent: 100 }] }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a team when splits sum to exactly 100 and the owner is included', async () => {
    (prisma.team.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'team-1',
      name: 'Agency',
      ownerId: 'owner-1',
      members: [],
    });

    const res = await POST(
      postRequest({
        name: 'Agency',
        members: [
          { userId: 'owner-1', payoutSplitPercent: 60 },
          { userId: 'member-2', payoutSplitPercent: 40 },
        ],
      }),
    );

    expect(res.status).toBe(201);
    expect(prisma.team.create).toHaveBeenCalled();
  });
});
