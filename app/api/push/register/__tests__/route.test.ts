import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, DELETE } from '../route';

vi.mock('@/lib/auth/auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pushDeviceToken: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';

const mockSession = {
  user: { id: 'user-123', email: 'test@test.com', name: 'Test User' },
};

function jsonRequest(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/push/register', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as any;
}

describe('POST /api/push/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as any);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as any);
    const response = await POST(jsonRequest({ token: 'ExponentPushToken[abc]', platform: 'ios' }));
    expect(response.status).toBe(401);
  });

  it('returns 422 when token is missing', async () => {
    const response = await POST(jsonRequest({ platform: 'ios' }));
    expect(response.status).toBe(422);
  });

  it('returns 422 when platform is invalid', async () => {
    const response = await POST(jsonRequest({ token: 'ExponentPushToken[abc]', platform: 'desktop' }));
    expect(response.status).toBe(422);
  });

  it('upserts the token for the signed-in user', async () => {
    vi.mocked(prisma.pushDeviceToken.upsert).mockResolvedValue({
      id: 'token-1',
      platform: 'ios',
      lastUsedAt: new Date('2026-10-16T00:00:00Z'),
    } as any);

    const response = await POST(jsonRequest({ token: 'ExponentPushToken[abc]', platform: 'ios' }));
    expect(response.status).toBe(200);

    expect(prisma.pushDeviceToken.upsert).toHaveBeenCalledWith({
      where: { userId_token: { userId: 'user-123', token: 'ExponentPushToken[abc]' } },
      create: { userId: 'user-123', token: 'ExponentPushToken[abc]', platform: 'ios' },
      update: { platform: 'ios', lastUsedAt: expect.any(Date) },
      select: { id: true, platform: true, lastUsedAt: true },
    });

    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

describe('DELETE /api/push/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as any);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as any);
    const response = await DELETE(jsonRequest({ token: 'ExponentPushToken[abc]' }, 'DELETE'));
    expect(response.status).toBe(401);
  });

  it('removes the token for the signed-in user', async () => {
    vi.mocked(prisma.pushDeviceToken.deleteMany).mockResolvedValue({ count: 1 } as any);
    const response = await DELETE(jsonRequest({ token: 'ExponentPushToken[abc]' }, 'DELETE'));
    expect(response.status).toBe(200);
    expect(prisma.pushDeviceToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-123', token: 'ExponentPushToken[abc]' },
    });
  });
});
