import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique },
    notificationPreference: { upsert },
  },
}));

import { GET, POST } from '@/app/api/email/unsubscribe/route';
import { signUnsubscribeToken } from '@/lib/email/unsubscribe-token';

const ORIGINAL_SECRET = process.env.EMAIL_UNSUBSCRIBE_SECRET;

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-do-not-use-in-prod';
  findUnique.mockReset();
  upsert.mockReset();
});

afterEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = ORIGINAL_SECRET;
});

function get(token: string) {
  return new NextRequest(`http://localhost/api/email/unsubscribe?token=${encodeURIComponent(token)}`);
}

function post(token: string) {
  const body = new URLSearchParams({ token });
  return new NextRequest('http://localhost/api/email/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

describe('GET /api/email/unsubscribe', () => {
  it('requires a token', async () => {
    expect((await GET(get(''))).status).toBe(400);
  });

  it('rejects a forged/invalid token without touching the DB', async () => {
    const res = await GET(get('not-a-valid-token'));
    expect(res.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('shows the confirmation page for a valid token', async () => {
    findUnique.mockResolvedValue({ id: 'user-1' });
    const token = signUnsubscribeToken('user-1', 'marketing');

    const res = await GET(get(token));

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('marketing emails');
  });
});

describe('POST /api/email/unsubscribe', () => {
  it('rejects a forged token without updating preferences', async () => {
    const res = await POST(post('forged.token'));
    expect(res.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("unsubscribes only the token's category, not every category", async () => {
    findUnique.mockResolvedValue({ id: 'user-2' });
    const token = signUnsubscribeToken('user-2', 'bountyAlerts');

    const res = await POST(post(token));

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-2' },
        update: { emailBountyAlerts: false },
      }),
    );
    // Scoped: only the bountyAlerts field is touched, not messages/marketing/etc.
    const call = upsert.mock.calls[0][0];
    expect(Object.keys(call.update)).toEqual(['emailBountyAlerts']);
  });

  it('"all" category still unsubscribes every field, for the legacy use case', async () => {
    findUnique.mockResolvedValue({ id: 'user-3' });
    const token = signUnsubscribeToken('user-3', 'all');

    await POST(post(token));

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          emailBountyAlerts: false,
          emailApplicationUpdates: false,
          emailMessages: false,
          emailMarketing: false,
        },
      }),
    );
  });

  it('a token signed for one user cannot be replayed to affect another', async () => {
    // The token embeds and signs the userId itself, so there is no
    // "target user" parameter an attacker could swap — this test documents
    // that guarantee at the route level (the forgery mechanics are covered
    // in unsubscribe-token.test.ts).
    findUnique.mockResolvedValue({ id: 'victim' });
    const token = signUnsubscribeToken('victim', 'all');

    await POST(post(token));

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'victim' } });
  });
});
