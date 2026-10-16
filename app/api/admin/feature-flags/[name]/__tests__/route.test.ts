import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from '../route';

// Mocked the same way app/api/notifications/__tests__/route.test.ts mocks
// its auth/prisma dependencies, but this route imports `getServerSession`
// from `next-auth` directly rather than via `@/lib/auth/auth`.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth/config', () => ({
  authOptions: {},
}));

vi.mock('@/lib/feature-flags/service', () => ({
  getFlagWithAnalytics: vi.fn(),
  upsertFlag: vi.fn(),
  invalidateFlagCache: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    featureFlag: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { upsertFlag } from '@/lib/feature-flags/service';

const adminSession = {
  user: { id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' },
};

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/admin/feature-flags/new-search', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new NextRequest('http://localhost/api/admin/feature-flags/new-search', {
    method: 'DELETE',
  });
}

const params = Promise.resolve({ name: 'new-search' });

describe('PATCH /api/admin/feature-flags/[name] — audit trail (#1614)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(adminSession as any);
  });

  it('returns 403 and writes no audit entry for a non-admin', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', role: 'CREATOR' } } as any);

    const response = await PATCH(patchRequest({ enabled: true }), { params });

    expect(response.status).toBe(403);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('writes an audit entry recording who changed the flag and the before/after state', async () => {
    vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue({
      id: 'flag-1',
      name: 'new-search',
      enabled: false,
      rolloutPercent: 0,
      userSegment: null,
      description: null,
    } as any);
    vi.mocked(upsertFlag).mockResolvedValue({
      id: 'flag-1',
      name: 'new-search',
      enabled: true,
      rolloutPercent: 0,
      userSegment: null,
      description: null,
    } as any);

    const response = await PATCH(patchRequest({ enabled: true }), { params });
    expect(response.status).toBe(200);

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.auditLog.create).mock.calls[0][0] as any;
    expect(call.data.userId).toBe('admin-1');
    expect(call.data.resource).toBe('feature_flag');
    expect(call.data.action).toBe('update');
    expect(call.data.resourceId).toBe('flag-1');
    expect(call.data.payload.before.enabled).toBe(false);
    expect(call.data.payload.after.enabled).toBe(true);
  });

  it('records action "create" when the flag did not exist before', async () => {
    vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue(null);
    vi.mocked(upsertFlag).mockResolvedValue({
      id: 'flag-2',
      name: 'new-search',
      enabled: true,
      rolloutPercent: 10,
      userSegment: null,
      description: null,
    } as any);

    await PATCH(patchRequest({ enabled: true, rolloutPercent: 10 }), { params });

    const call = vi.mocked(prisma.auditLog.create).mock.calls[0][0] as any;
    expect(call.data.action).toBe('create');
    expect(call.data.payload.before).toBeNull();
  });
});

describe('DELETE /api/admin/feature-flags/[name] — audit trail (#1614)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(adminSession as any);
  });

  it('writes an audit entry with the deleted flag state', async () => {
    vi.mocked(prisma.featureFlag.delete).mockResolvedValue({
      id: 'flag-1',
      name: 'new-search',
      enabled: true,
      rolloutPercent: 50,
      userSegment: { role: 'CREATOR' },
      description: 'test flag',
    } as any);

    const response = await DELETE(deleteRequest(), { params });
    expect(response.status).toBe(200);

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.auditLog.create).mock.calls[0][0] as any;
    expect(call.data.action).toBe('delete');
    expect(call.data.resourceId).toBe('flag-1');
    expect(call.data.payload.deleted.rolloutPercent).toBe(50);
  });

  it('returns 404 and writes no audit entry when the flag does not exist', async () => {
    vi.mocked(prisma.featureFlag.delete).mockRejectedValue(new Error('Record not found'));

    const response = await DELETE(deleteRequest(), { params });

    expect(response.status).toBe(404);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
