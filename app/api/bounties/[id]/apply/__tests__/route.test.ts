import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

vi.mock('@/lib/auth/auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    bounty: { findUnique: vi.fn() },
    team: { findUnique: vi.fn() },
    bountyApplication: { create: vi.fn() },
  },
}));

import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';

const mockSession = { user: { id: 'applicant-1', name: 'Applicant One' } };

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/bounties/bounty-1/apply', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: 'bounty-1' }) };

const validBody = { proposal: 'I can build this', proposedBudget: 1000, timeline: 14 };

describe('POST /api/bounties/[id]/apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    (prisma.bounty.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'bounty-1',
      status: 'OPEN',
      creatorId: 'client-1',
    });
  });

  it('401s when there is no session', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(postRequest(validBody), ctx);
    expect(res.status).toBe(401);
  });

  it('400s applying to a non-open bounty', async () => {
    (prisma.bounty.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'bounty-1',
      status: 'COMPLETED',
      creatorId: 'client-1',
    });
    const res = await POST(postRequest(validBody), ctx);
    expect(res.status).toBe(400);
  });

  it('creates a solo application when no teamId is given', async () => {
    (prisma.bountyApplication.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'app-1',
      ...validBody,
      applicantId: 'applicant-1',
      teamId: null,
    });

    const res = await POST(postRequest(validBody), ctx);

    expect(res.status).toBe(201);
    expect(prisma.team.findUnique).not.toHaveBeenCalled();
    expect(prisma.bountyApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teamId: null }) }),
    );
  });

  // Issue #1610: applying as a team requires actually being on that team.
  it('403s a team application from someone who is not a member of that team', async () => {
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'team-1',
      ownerId: 'someone-else',
      members: [{ userId: 'someone-else' }],
    });

    const res = await POST(postRequest({ ...validBody, teamId: 'team-1' }), ctx);

    expect(res.status).toBe(403);
    expect(prisma.bountyApplication.create).not.toHaveBeenCalled();
  });

  it('creates a team application for an actual team member', async () => {
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'team-1',
      ownerId: 'someone-else',
      members: [{ userId: 'someone-else' }, { userId: 'applicant-1' }],
    });
    (prisma.bountyApplication.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'app-1',
      ...validBody,
      applicantId: 'applicant-1',
      teamId: 'team-1',
    });

    const res = await POST(postRequest({ ...validBody, teamId: 'team-1' }), ctx);

    expect(res.status).toBe(201);
    expect(prisma.bountyApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teamId: 'team-1' }) }),
    );
  });

  it('409s a duplicate application to the same bounty', async () => {
    (prisma.bountyApplication.create as ReturnType<typeof vi.fn>).mockRejectedValue({ code: 'P2002' });
    const res = await POST(postRequest(validBody), ctx);
    expect(res.status).toBe(409);
  });
});
