import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Per-category email preferences (issue #1615). Keys are the query-string/
 * form values used on unsubscribe links and checkboxes; values are the
 * corresponding `NotificationPreference` columns.
 */
const CATEGORY_FIELDS = {
  bounty_alerts: 'emailBountyAlerts',
  application_updates: 'emailApplicationUpdates',
  messages: 'emailMessages',
  marketing: 'emailMarketing',
} as const;

type CategoryKey = keyof typeof CATEGORY_FIELDS;

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  bounty_alerts: 'New bounty alerts',
  application_updates: 'Application status updates',
  messages: 'New message notifications',
  marketing: 'Product news and marketing',
};

function isCategoryKey(value: string | null): value is CategoryKey {
  return !!value && value in CATEGORY_FIELDS;
}

function unsubscribeUpdateFor(categories: CategoryKey[]) {
  // No categories specified at all (old-style "unsubscribe from everything"
  // links, and the generic RFC 8058 one-click case with no `category`
  // param) means every email category, preserving existing link behavior.
  const keys = categories.length > 0 ? categories : (Object.keys(CATEGORY_FIELDS) as CategoryKey[]);
  const update: Record<string, boolean> = {};
  for (const key of keys) {
    update[CATEGORY_FIELDS[key]] = false;
  }
  return update;
}

function renderPage(body: string) {
  return new NextResponse(
    `<!DOCTYPE html>
      <html>
        <head>
          <title>Email preferences</title>
          <style>
            body { font-family: sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; }
            h1 { color: #333; }
            p { color: #666; line-height: 1.6; }
            label { display: block; margin: 12px 0; color: #333; }
            button { background: #dc2626; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin-top: 16px; }
            button:hover { background: #991b1b; }
          </style>
        </head>
        <body>
          <div class="container">${body}</div>
        </body>
      </html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const category = searchParams.get('category');

    if (!token) {
      return NextResponse.json({ error: 'Missing unsubscribe token' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { emailUnsubscribeToken: token },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired unsubscribe token' },
        { status: 404 }
      );
    }

    // A link naming a specific category (e.g. from that category's emails)
    // pre-checks only that one box — one click on the email's own
    // unsubscribe link lands here with the relevant box already checked,
    // "Confirm" is the only interaction needed. A generic link (or an old
    // link minted before per-category support existed) pre-checks every
    // category, matching the previous "unsubscribe from everything" page.
    const preselected = isCategoryKey(category) ? [category] : (Object.keys(CATEGORY_FIELDS) as CategoryKey[]);

    const checkboxes = (Object.keys(CATEGORY_FIELDS) as CategoryKey[])
      .map(
        (key) => `
            <label>
              <input type="checkbox" name="categories" value="${key}" ${
          preselected.includes(key) ? 'checked' : ''
        } />
              ${CATEGORY_LABELS[key]}
            </label>`
      )
      .join('');

    return renderPage(`
            <h1>Email preferences</h1>
            <p>Choose which emails to stop receiving. Unchecked categories are unaffected.</p>
            <form method="POST" action="/api/email/unsubscribe">
              <input type="hidden" name="token" value="${token}" />
              ${checkboxes}
              <button type="submit">Confirm</button>
            </form>`);
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentType = request.headers.get('content-type') || '';

    // RFC 8058 one-click unsubscribe: mail clients (Gmail, etc.) that see a
    // `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header on an
    // email POST straight to that email's `List-Unsubscribe` URL — token
    // (and category, if the link named one) travel in the URL's query
    // string, and the body is just the literal `List-Unsubscribe=One-Click`
    // with no human in the loop, so this must act without ever rendering
    // a page. Detected by the token living in the query string: the
    // GET-rendered form above posts to a bare `/api/email/unsubscribe`
    // (no query string at all) and sends the token only as a form field,
    // so a query-string token only ever happens on the machine path.
    const queryToken = searchParams.get('token');
    const isOneClick = !!queryToken;

    let token: string | null;
    let categories: CategoryKey[];

    if (isOneClick) {
      token = queryToken;
      const category = searchParams.get('category');
      categories = isCategoryKey(category) ? [category] : [];
    } else {
      const body = contentType.includes('application/json')
        ? await request.json().catch(() => ({}))
        : await request.formData();
      const formToken = body instanceof FormData ? body.get('token') : body.token;
      token = typeof formToken === 'string' ? formToken : null;

      const rawCategories =
        body instanceof FormData ? body.getAll('categories') : body.categories ?? [];
      categories = (Array.isArray(rawCategories) ? rawCategories : [rawCategories])
        .map((value) => (typeof value === 'string' ? value : null))
        .filter(isCategoryKey);
    }

    if (!token) {
      return NextResponse.json({ error: 'Missing unsubscribe token' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { emailUnsubscribeToken: token },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired unsubscribe token' },
        { status: 404 }
      );
    }

    const update = unsubscribeUpdateFor(categories);

    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update,
      create: {
        userId: user.id,
        emailBountyAlerts: true,
        emailApplicationUpdates: true,
        emailMessages: true,
        emailMarketing: true,
        ...update,
      },
    });

    // The one-click path has no human reading the response (RFC 8058 only
    // requires a 2xx), so skip the HTML page.
    if (isOneClick) {
      return NextResponse.json({ success: true, unsubscribed: categories.length > 0 ? categories : 'all' });
    }

    const unsubscribedLabel =
      categories.length > 0
        ? categories.map((key) => CATEGORY_LABELS[key]).join(', ')
        : 'all email notifications';

    return renderPage(`
            <h1>✓ Preferences updated</h1>
            <p>You will no longer receive: ${unsubscribedLabel}.</p>
            <p>You can re-enable notifications anytime from your notification preferences.</p>`);
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
