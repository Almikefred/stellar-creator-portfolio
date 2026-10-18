/**
 * Signed, category-scoped unsubscribe tokens (Issue #1616).
 *
 * Threat this closes: the previous scheme (`User.emailUnsubscribeToken`,
 * see app/api/email/unsubscribe/route.ts's git history) looked a raw,
 * DB-stored token up directly, with no signature. Anyone who guessed or
 * enumerated another user's token — the column is a plain unique string
 * with no documented generation path, so nothing established it was
 * unguessable — could unsubscribe them from every notification category
 * at once, with no way to undo that from the token alone. There is also no
 * expiry: a token leaked once (server log, email client preview, a shared
 * inbox) is valid forever.
 *
 * This replaces it with an HMAC-SHA256-signed token over
 * `(userId, category, exp)`:
 *   - Forged/guessed tokens are rejected: an attacker without
 *     `EMAIL_UNSUBSCRIBE_SECRET` cannot produce a signature that verifies,
 *     so they cannot target an arbitrary userId.
 *   - Scoped to one category (or "all"), so a leaked link only ever
 *     unsubscribes what it was issued for.
 *   - Expires (default 90 days, see EXPIRY_SECONDS below).
 *
 * Deny-by-default: any decode/parse/signature/expiry failure returns
 * `null` from `verifyUnsubscribeToken` — callers never partially trust a
 * malformed token.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export type UnsubscribeCategory = 'bountyAlerts' | 'applicationUpdates' | 'messages' | 'marketing' | 'all';

const CATEGORIES: readonly UnsubscribeCategory[] = [
  'bountyAlerts',
  'applicationUpdates',
  'messages',
  'marketing',
  'all',
];

export interface UnsubscribeTokenPayload {
  userId: string;
  category: UnsubscribeCategory;
  /** Unix seconds expiry. */
  exp: number;
}

const EXPIRY_SECONDS = 90 * 24 * 60 * 60; // 90 days

function secret(): string {
  const s = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!s) {
    // Fail loudly rather than silently signing with an empty/undefined
    // secret, which would make every token forgeable.
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET is not configured');
  }
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/**
 * Issues a signed unsubscribe link token for `userId`/`category`, valid
 * for `EXPIRY_SECONDS` (default 90 days) from now.
 */
export function signUnsubscribeToken(userId: string, category: UnsubscribeCategory): string {
  const exp = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;
  const payload = `${userId}:${category}:${exp}`;
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = sign(payload);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a token's signature and expiry, returning the decoded payload
 * on success or `null` for anything invalid: malformed token, bad
 * signature, unknown category, or expired `exp`.
 */
export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  let expectedSignature: string;
  try {
    expectedSignature = sign(payload);
  } catch {
    return null;
  }

  const given = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  const fields = payload.split(':');
  if (fields.length !== 3) return null;
  const [userId, category, expStr] = fields;

  if (!userId) return null;
  if (!CATEGORIES.includes(category as UnsubscribeCategory)) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  return { userId, category: category as UnsubscribeCategory, exp };
}
