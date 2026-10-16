import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';

const VALID_PLATFORMS = new Set(['ios', 'android', 'web']);

/**
 * POST /api/push/register
 *
 * Registers (or refreshes) a mobile Expo push token for the signed-in user,
 * so server-side push (server/services/notifications/push-service.ts) has
 * somewhere to look tokens up from. Called after sign-in and again whenever
 * the token changes (Expo rotates it on reinstall, restore, etc.) — see
 * mobile/src/services/PushNotificationService.ts.
 *
 * Upserts on (userId, token): re-registering the same token for the same
 * user is a no-op other than bumping `lastUsedAt`, so retries and repeated
 * app-foreground calls are safe.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const platform = typeof body?.platform === 'string' ? body.platform.trim().toLowerCase() : '';

  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 422 });
  }
  if (!VALID_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { error: `platform must be one of: ${Array.from(VALID_PLATFORMS).join(', ')}` },
      { status: 422 },
    );
  }

  const saved = await prisma.pushDeviceToken.upsert({
    where: { userId_token: { userId: session.user.id, token } },
    create: { userId: session.user.id, token, platform },
    update: { platform, lastUsedAt: new Date() },
    select: { id: true, platform: true, lastUsedAt: true },
  });

  return NextResponse.json({ success: true, ...saved });
}

/**
 * DELETE /api/push/register
 *
 * Unregisters a push token, e.g. on sign-out, so a stale token doesn't
 * keep receiving pushes for a user who is no longer signed in on that
 * device.
 */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 422 });
  }

  await prisma.pushDeviceToken.deleteMany({
    where: { userId: session.user.id, token },
  });

  return NextResponse.json({ success: true });
}

export const runtime = 'nodejs';
