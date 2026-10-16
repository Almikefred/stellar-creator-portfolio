import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyUnsubscribeToken, type UnsubscribeCategory } from '@/lib/email/unsubscribe-token';

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
  marketing: 'Product news and marketing emails',
};

const ALL_CATEGORY_KEYS = Object.keys(CATEGORY_FIELDS) as CategoryKey[];

function isCategoryKey(value: string | null): value is CategoryKey {
  return !!value && value in CATEGORY_FIELDS;
}

/**
 * Maps a signed token's `UnsubscribeCategory` (issue #1616's camelCase
 * naming, matching the `NotificationPreference` field names) onto this
 * route's snake_case `CategoryKey` naming (issue #1615's query/form
 * values). `'all'` expands to every key — anything else is the single
 * category the token was scoped to.
 *
 * This is the enforcement boundary between the two features: whatever
 * this returns is the *only* thing a request bearing this token is
 * allowed to change, regardless of what the request body asks for. A
 * token scoped to one category must not be able to unsubscribe another
 * just because a POST body says so — that would defeat #1616's reason for
 * scoping tokens to a category in the first place.
 */
function allowedKeysForToken(category: UnsubscribeCategory): CategoryKey[] {
  if (category === 'all') return ALL_CATEGORY_KEYS;
  const map: Record<Exclude<UnsubscribeCategory, 'all'>, CategoryKey> = {
    bountyAlerts: 'bounty_alerts',
    applicationUpdates: 'application_updates',
    messages: 'messages',
    marketing: 'marketing',
  };
  return [map[category]];
}

function unsubscribeUpdateFor(categories: CategoryKey[]) {
  const update: Record<string, boolean> = {};
  for (const key of categories) {
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

    if (!token) {
      return NextResponse.json({ error: 'Missing unsubscribe token' }, { status: 400 });
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

    // Only categories the signed token is scoped to are ever offered — see
    // `allowedKeysForToken`'s doc comment. All of them start pre-checked,
    // matching the previous "unsubscribe from everything" link behavior
    // for a token scoped to 'all'.
    const allowed = allowedKeysForToken(payload.category);

    const checkboxes = allowed
      .map(
        (key) => `
            <label>
              <input type="checkbox" name="categories" value="${key}" checked />
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
    // email POST straight to that email's `List-Unsubscribe` URL — the
    // token travels in the URL's query string, and the body is just the
    // literal `List-Unsubscribe=One-Click` with no human in the loop, so
    // this must act without ever rendering a page. Detected by the token
    // living in the query string: the GET-rendered form above posts to a
    // bare `/api/email/unsubscribe` (no query string at all) and sends the
    // token only as a form field, so a query-string token only ever
    // happens on the machine path.
    const queryToken = searchParams.get('token');
    const isOneClick = !!queryToken;

    let token: string | null;
    let requestedCategories: CategoryKey[];

    if (isOneClick) {
      token = queryToken;
      requestedCategories = [];
    } else {
      const body = contentType.includes('application/json')
        ? await request.json().catch(() => ({}))
        : await request.formData();
      const formToken = body instanceof FormData ? body.get('token') : body.token;
      token = typeof formToken === 'string' ? formToken : null;

      const rawCategories =
        body instanceof FormData ? body.getAll('categories') : body.categories ?? [];
      requestedCategories = (Array.isArray(rawCategories) ? rawCategories : [rawCategories])
        .map((value) => (typeof value === 'string' ? value : null))
        .filter(isCategoryKey);
    }

    if (!token) {
      return NextResponse.json({ error: 'Missing unsubscribe token' }, { status: 400 });
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

    // Enforce the token's scope server-side: a request can never affect a
    // category outside what this specific signed token was issued for,
    // regardless of what the form/body asked for (see
    // `allowedKeysForToken`). No categories requested (one-click, or a
    // generic link with every box left checked) means every allowed
    // category, same as the previous "unsubscribe from everything" link.
    const allowed = allowedKeysForToken(payload.category);
    const inScope = requestedCategories.filter((key) => allowed.includes(key));
    const categories = inScope.length > 0 ? inScope : allowed;

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
      return NextResponse.json({ success: true, unsubscribed: categories });
    }

    const unsubscribedLabel = categories.map((key) => CATEGORY_LABELS[key]).join(', ');

    return renderPage(`
            <h1>✓ Preferences updated</h1>
            <p>You will no longer receive: ${unsubscribedLabel}.</p>
            <p>You can re-enable notifications anytime from your notification preferences.</p>`);
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
