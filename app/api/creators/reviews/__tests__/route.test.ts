import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

vi.mock('@/lib/auth/auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    creatorProfile: { findUnique: vi.fn() },
    bounty: { findFirst: vi.fn() },
    review: { create: vi.fn() },
  },
}));

import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';

const mockSession = { user: { id: 'client-1', name: 'Client One' } };

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/creators/reviews', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const validBody = {
  creatorId: 'profile-1',
  bountyId: 'bounty-1',
  rating: 5,
  title: 'Great work',
  body: 'Delivered exactly what we needed, on time.',
};

describe('POST /api/creators/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    (prisma.creatorProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'profile-1',
      userId: 'creator-user-1',
      displayName: 'Creator One',
    });
  });

  it('401s when there is no session', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(401);
  });

  // The attack this closes: a reviewer with no actual completed engagement
  // leaving a review (fake reviews). Regression test for issue #1608 —
  // this must reject even though every other field is valid.
  it('rejects a review with no completed, accepted engagement for that bounty', async () => {
    (prisma.bounty.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(403);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('creates a verified review once the engagement check passes', async () => {
    (prisma.bounty.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'bounty-1' });
    (prisma.review.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'review-1',
      ...validBody,
      isVerifiedPurchase: true,
      status: 'PENDING',
    });

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(201);
    expect(prisma.bounty.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'bounty-1',
          creatorId: 'client-1',
          status: 'COMPLETED',
          applications: { some: { applicantId: 'creator-user-1', status: 'ACCEPTED' } },
        }),
      }),
    );
    expect(prisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isVerifiedPurchase: true, bountyId: 'bounty-1' }),
      }),
    );
  });

  it('404s when the creator profile does not exist', async () => {
    (prisma.creatorProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(404);
  });

  it('400s on an out-of-range rating', async () => {
    const res = await POST(postRequest({ ...validBody, rating: 7 }));
    expect(res.status).toBe(400);
  });
});
