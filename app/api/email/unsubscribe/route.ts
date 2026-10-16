import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyUnsubscribeToken, type UnsubscribeCategory } from '@/lib/email/unsubscribe-token';

const CATEGORY_LABELS: Record<UnsubscribeCategory, string> = {
  bountyAlerts: 'new bounty alerts',
  applicationUpdates: 'application updates',
  messages: 'message notifications',
  marketing: 'marketing emails',
  all: 'all email notifications',
};

/** Builds the NotificationPreference `update`/`create` patch for one category. */
function preferencePatch(category: UnsubscribeCategory): Record<string, boolean> {
  if (category === 'all') {
    return {
      emailBountyAlerts: false,
      emailApplicationUpdates: false,
      emailMessages: false,
      emailMarketing: false,
    };
  }
  const field = `email${category[0].toUpperCase()}${category.slice(1)}`;
  return { [field]: false };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Missing unsubscribe token' },
        { status: 400 }
      );
    }

    const payload = verifyUnsubscribeToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired unsubscribe token' },
        { status: 404 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired unsubscribe token' },
        { status: 404 }
      );
    }

    const label = CATEGORY_LABELS[payload.category];
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribe</title>
          <style>
            body { font-family: sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; }
            h1 { color: #333; }
            p { color: #666; line-height: 1.6; }
            button { background: #dc2626; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
            button:hover { background: #991b1b; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Unsubscribe from Email Notifications</h1>
            <p>Click the button below to confirm you want to unsubscribe from ${label}.</p>
            <form method="POST" action="/api/email/unsubscribe">
              <input type="hidden" name="token" value="${token}" />
              <button type="submit">Confirm Unsubscribe</button>
            </form>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const token = body.get('token');

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Missing unsubscribe token' },
        { status: 400 }
      );
    }

    const payload = verifyUnsubscribeToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired unsubscribe token' },
        { status: 404 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired unsubscribe token' },
        { status: 404 }
      );
    }

    const patch = preferencePatch(payload.category);
    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: patch,
      create: {
        userId: user.id,
        emailBountyAlerts: true,
        emailApplicationUpdates: true,
        emailMessages: true,
        emailMarketing: false,
        ...patch,
      },
    });

    const label = CATEGORY_LABELS[payload.category];
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribed</title>
          <style>
            body { font-family: sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; }
            h1 { color: #333; }
            p { color: #666; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✓ Successfully Unsubscribed</h1>
            <p>You have been unsubscribed from ${label}.</p>
            <p>You can re-enable notifications anytime from your notification preferences.</p>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
