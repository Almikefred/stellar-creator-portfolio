/**
 * Validation for incoming deep links (issue #1624).
 *
 * Before this, `parser.ts` trusted every incoming URL unconditionally.
 * Two concrete, exploitable gaps:
 *
 *   1. Host spoofing. The "allowlist" in routes.ts (DEEP_LINK_PREFIXES)
 *      was checked with `url.startsWith(prefix)`. That's also true for
 *      `https://stellar.app.evil.com/...` and
 *      `https://stellar.appzzz.com/...` — anything where the real host
 *      merely *begins with* the allowed string, not just the allowed
 *      host itself. A page under an attacker's control linking to
 *      `https://stellar.app.evil.com/creator/x` would have been accepted
 *      and routed exactly as if it came from the real domain.
 *   2. No parameter validation. `creatorId`, `conversationId`, `roomId`
 *      and `period` were taken straight from the URL into navigation
 *      params with no check on length, character set, or shape — an
 *      attacker fully controls these strings, and they flow on to
 *      screens, logs, and (for creatorId/conversationId) likely API
 *      calls.
 *
 * `resolveAllowedLink` below is the host/scheme check, done with the
 * `URL` constructor (already used elsewhere in this codebase — see
 * src/utils/formValidation.ts's `url` validator and
 * src/utils/stellarAddress.ts) for exact hostname comparison rather than
 * substring matching. `isValidId` / `isValidPeriod` are the per-param
 * schemas parser.ts now runs each route param through. Anything that
 * fails either check becomes `{ screen: 'Unknown', url }` — the parser's
 * existing, already-handled "don't recognise this" case — rather than a
 * route with an attacker-controlled or malformed param.
 *
 * Note: the issue's proposed implementation mentions zod. This repo's
 * `mobile/` package does not depend on zod today (only the root Next.js
 * app does — see the root package.json), and adding a new dependency
 * without being able to run an install to verify it resolves/locks
 * cleanly felt like the wrong tradeoff for what are, in the end, a
 * handful of plain string checks. These hand-rolled validators give the
 * same deny-by-default guarantee (reject unless it matches) without
 * that risk.
 */

// ─── Host / scheme allowlist ──────────────────────────────────────────────────

const ALLOWED_HTTPS_HOSTS = new Set(["stellar.app", "www.stellar.app"]);

export type ResolvedDeepLink = {
  /** Always starts with "/". Combines host + pathname for stellar:// links — see below. */
  path: string;
  /** Query string params, decoded. Works for both stellar:// and https:// links. */
  query: Record<string, string>;
};

/**
 * Validates the URL's scheme and, for https links, its exact hostname
 * (never substring/prefix matching — see module doc above). Returns the
 * path + query to hand to the route switch in parser.ts, or null if the
 * URL is malformed or not from an allowed origin.
 */
export function resolveAllowedLink(rawUrl: string): ResolvedDeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  let path: string;
  if (parsed.protocol === "stellar:") {
    // Non-special scheme: the WHATWG URL parser treats whatever is
    // between "://" and the next "/" as the host, e.g.
    // "stellar://creator/alex-studio" → host "creator", pathname
    // "/alex-studio". Reconstruct the full logical path from both.
    const host = parsed.host.replace(/^\/+|\/+$/g, "");
    const rest = parsed.pathname.replace(/^\/+/, "");
    path = `/${[host, rest].filter(Boolean).join("/")}`;
  } else if (parsed.protocol === "https:" && ALLOWED_HTTPS_HOSTS.has(parsed.hostname)) {
    path = parsed.pathname || "/";
  } else {
    return null;
  }

  const query: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  return { path, query };
}

// ─── Per-param schemas ─────────────────────────────────────────────────────────

// Matches the slug-like IDs this app actually issues (e.g. "alex-studio",
// UUIDs, cuids) — ASCII letters, digits, hyphens and underscores only, a
// sane length bound so an oversized path segment can't reach navigation
// params, screens, logs, or an API call built from it downstream.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

const VALID_PERIODS = new Set(["7d", "30d", "90d", "all"]);

// Looser than ID_PATTERN (allows '.', longer) for opaque values that
// aren't user-facing slugs — email-verification tokens, payment
// provider IDs/statuses. Still bounded and still charset-restricted, so
// an oversized or control-character-laden query param can't reach the
// screen, a log line, or a downstream API call unchecked.
const OPAQUE_PATTERN = /^[A-Za-z0-9_.-]{1,512}$/;

/** Validates `creatorId` / `conversationId` / `roomId` / `bountyId` path segments. */
export function isValidId(value: string | undefined): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** Validates the optional `:period?` segment on the dashboard route. */
export function isValidPeriod(value: string | undefined): boolean {
  return value === undefined || VALID_PERIODS.has(value);
}

/** Validates opaque query params: email-verification `token`, payment `paymentId`/`status`. */
export function isValidOpaqueParam(value: string | undefined): value is string {
  return typeof value === "string" && OPAQUE_PATTERN.test(value);
}
