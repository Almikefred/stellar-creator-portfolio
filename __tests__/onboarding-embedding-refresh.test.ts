import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth/auth', () => ({ getServerSession }));

const { onProfileChanged } = vi.hoisted(() => ({ onProfileChanged: vi.fn() }));
vi.mock('@/server/services/search', () => ({ onProfileChanged }));

const CREATOR_PROFILE_ROW = {
  id: 'cp-1',
  userId: 'user-1',
  displayName: 'Ada Creator',
  bio: 'I build things.',
  avatar: null,
  discipline: 'Development',
  skills: ['react', 'typescript'],
  verified: false,
  rating: 0,
  completedProjects: 0,
  githubUrl: null,
  linkedinUrl: null,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const { creatorProfileUpsert, userUpdate, transaction } = vi.hoisted(() => ({
  creatorProfileUpsert: vi.fn(),
  userUpdate: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: transaction,
  },
}));

import { POST } from '@/app/api/onboarding/route';

function post(body: unknown) {
  return new NextRequest('http://localhost/api/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  onProfileChanged.mockReset();
  creatorProfileUpsert.mockReset().mockResolvedValue(CREATOR_PROFILE_ROW);
  userUpdate.mockReset();
  transaction.mockReset().mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
    const tx = {
      creatorProfile: { upsert: creatorProfileUpsert },
      clientProfile: { upsert: vi.fn() },
      user: { update: userUpdate },
    };
    return callback(tx);
  });
});

describe('POST /api/onboarding — embedding refresh (Issue #1619)', () => {
  it('refreshes the creator search embedding after onboarding completes', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });

    const res = await POST(
      post({
        role: 'CREATOR',
        profile: { displayName: 'Ada Creator', bio: 'I build things.', discipline: 'Development', skills: ['react', 'typescript'] },
      }),
    );

    expect(res.status).toBe(200);
    expect(onProfileChanged).toHaveBeenCalledTimes(1);
    expect(onProfileChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cp-1',
        displayName: 'Ada Creator',
        bio: 'I build things.',
        discipline: 'Development',
        skills: ['react', 'typescript'],
      }),
    );
  });

  it('does not refresh an embedding for a CLIENT onboarding (no creator profile)', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-2' } });

    await POST(
      post({
        role: 'CLIENT',
        profile: { companyName: 'Acme' },
      }),
    );

    expect(onProfileChanged).not.toHaveBeenCalled();
    expect(creatorProfileUpsert).not.toHaveBeenCalled();
  });

  it('only calls onProfileChanged after the transaction has committed, not from inside it', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });

    let calledInsideTransaction = false;
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      const tx = {
        creatorProfile: {
          upsert: async (...args: unknown[]) => {
            const result = await creatorProfileUpsert(...args);
            calledInsideTransaction = onProfileChanged.mock.calls.length > 0;
            return result;
          },
        },
        clientProfile: { upsert: vi.fn() },
        user: { update: userUpdate },
      };
      return callback(tx);
    });

    await POST(
      post({
        role: 'CREATOR',
        profile: { displayName: 'Ada Creator', discipline: 'Development', skills: ['react'] },
      }),
    );

    expect(calledInsideTransaction).toBe(false);
    expect(onProfileChanged).toHaveBeenCalledTimes(1);
  });
});
