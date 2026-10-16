import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDigestForUser, queueDigestEmails } from '../digest-service';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    notificationPreference: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    inAppNotification: { findMany: vi.fn() },
    emailDeliveryLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

import { prisma } from '@/lib/prisma';

const USER = {
  id: 'user-1',
  email: 'user1@example.com',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('buildDigestForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when digestFrequency is NONE', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(USER as any);
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      userId: 'user-1',
      digestFrequency: 'NONE',
      lastDigestSentAt: null,
    } as any);

    const digest = await buildDigestForUser('user-1');
    expect(digest).toBeNull();
    expect(prisma.inAppNotification.findMany).not.toHaveBeenCalled();
  });

  it('returns null when there are no unread notifications', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(USER as any);
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      userId: 'user-1',
      digestFrequency: 'DAILY',
      lastDigestSentAt: null,
    } as any);
    vi.mocked(prisma.inAppNotification.findMany).mockResolvedValue([]);

    const digest = await buildDigestForUser('user-1');
    expect(digest).toBeNull();
  });

  it('includes only unread notifications since the last digest', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(USER as any);
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      userId: 'user-1',
      digestFrequency: 'DAILY',
      lastDigestSentAt: new Date('2026-10-14T00:00:00Z'),
    } as any);
    vi.mocked(prisma.inAppNotification.findMany).mockResolvedValue([
      {
        id: 'n1',
        title: 'New application',
        body: 'Someone applied',
        createdAt: new Date('2026-10-15T00:00:00Z'),
      },
    ] as any);

    const digest = await buildDigestForUser('user-1');
    expect(digest).not.toBeNull();
    expect(digest?.notifications).toHaveLength(1);
    expect(digest?.toEmail).toBe('user1@example.com');

    // The `read: false` filter and the since-cursor are both load-bearing
    // for the "unread only" acceptance criterion — assert the query
    // actually scopes on them rather than just trusting the mock's return.
    expect(prisma.inAppNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          read: false,
          createdAt: { gt: new Date('2026-10-14T00:00:00Z') },
        }),
      }),
    );
  });
});

describe('queueDigestEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues an EmailDeliveryLog row and advances lastDigestSentAt for users with unread notifications', async () => {
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { userId: 'user-1' },
    ] as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(USER as any);
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      userId: 'user-1',
      digestFrequency: 'DAILY',
      lastDigestSentAt: null,
    } as any);
    vi.mocked(prisma.inAppNotification.findMany).mockResolvedValue([
      { id: 'n1', title: 'T', body: 'B', createdAt: new Date('2026-10-15T00:00:00Z') },
    ] as any);

    const result = await queueDigestEmails('DAILY');

    expect(result).toEqual({ queued: 1, skipped: 0 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('skips users with nothing unread without queuing anything', async () => {
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { userId: 'user-1' },
    ] as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(USER as any);
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      userId: 'user-1',
      digestFrequency: 'DAILY',
      lastDigestSentAt: null,
    } as any);
    vi.mocked(prisma.inAppNotification.findMany).mockResolvedValue([]);

    const result = await queueDigestEmails('DAILY');

    expect(result).toEqual({ queued: 0, skipped: 1 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
