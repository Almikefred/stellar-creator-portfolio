# #1556: Unify rate limiting across tRPC, GraphQL and REST

## Context

Four separate rate-limiter implementations exist today:

| File | Algorithm | Storage | Scope |
| --- | --- | --- | --- |
| [`server/api/rate-limit.ts`](../../server/api/rate-limit.ts) | Token-bucket with per-identifier tiers | In-memory `Map<string, Bucket>` | tRPC (every procedure via `rateLimit()` middleware) and GraphQL context |
| [`server/graphql/rate-limit.ts`](../../server/graphql/rate-limit.ts) | Thin wrapper — re-reads `ctx.rateLimit` set by `createGraphQLContext` | — | GraphQL resolvers (throws `RateLimitError` carrying `retryAfter`) |
| [`server/graphql/context.ts`](../../server/graphql/context.ts) | Delegates to `server/api/rate-limit.ts` | In-memory | GraphQL context factory |
| [`lib/rate-limit.ts`](../../lib/rate-limit.ts) | Counter-per-hour | In-memory `Map<string, RateLimitEntry>` | Export endpoints only (max 3 exports/hour per admin) |

There is also a reference to a `backend/limit` module in the issue; the Rust backend in `backend/` has its own limiting outside of the Node/Next.js process.

Key observations:
- The tRPC and GraphQL paths both ultimately call `server/api/rate-limit.ts`, so they share one in-memory bucket store — but on serverless the process can restart at any time, resetting all counters silently.
- `lib/rate-limit.ts` is a completely separate in-memory store with different semantics (fixed-window count, not token-bucket) and is only used for export endpoints.
- Neither store survives a cold start or a second container replica; two instances of the app will enforce limits independently, so the effective limit doubles (or more) under autoscaling.
- No `RateLimit-*` response headers are returned to callers in any path, making it impossible for clients to implement polite backoff.

## Why it matters

The threat: an attacker targeting the weakest layer can avoid the "authenticated" token-bucket entirely by going through the export REST endpoint (which uses a different, weaker in-memory counter) or by spreading requests across multiple cold starts / replicas. With no shared backing store, limits are not enforced globally.

## Proposed implementation

### 1. One shared limiter in `lib/rate-limit.ts`

Replace both in-memory stores with a single Redis-backed limiter. Recommended options:

- **`@upstash/ratelimit`** — works out-of-the-box with the existing Upstash/Redis setup; sliding-window or token-bucket; no extra server to run.
- **`rate-limiter-flexible`** — more flexible (e.g. supports `ioredis`), good if a self-hosted Redis instance is preferred.

Export a single factory function (e.g. `createLimiter(scope, limit, window)`) that returns a callable check. The existing `checkRateLimit` / `rateLimitKey` / `RateLimitExceededError` API surface in `server/api/rate-limit.ts` stays stable; only the backing store changes.

### 2. Shared config per route group

Define limits in one place, for example `lib/rate-limit-config.ts`:

```ts
export const RATE_LIMITS = {
  // anonymous callers
  anonymousPerMinute: 30,
  // authenticated users / API keys
  authenticatedPerMinute: 300,
  // sensitive mutation routes
  mutations: { windowMs: 60_000, max: 60 },
  // export endpoints (current: 3/hour per admin)
  exports: { windowMs: 3_600_000, max: 3 },
  // ZK proof endpoint
  zkVerify: { windowMs: 60_000, max: 10 },
} as const;
```

The existing per-procedure `rateLimit({ windowMs, max })` call in `server/api/router.ts` reads from this config.

### 3. Consume from all three layers

| Layer | Entry point | Change |
| --- | --- | --- |
| tRPC | `server/api/router.ts` — `rateLimit()` middleware on each procedure | Replace in-memory `checkRate` with Redis-backed call |
| GraphQL | `server/graphql/context.ts` — `createGraphQLContext` | Same; `server/graphql/rate-limit.ts` wrapper stays unchanged |
| REST | `lib/rate-limit.ts` — `checkRateLimit` used in export handlers | Replace in-memory counter with Redis-backed call using the same shared config |

### 4. Return `RateLimit-*` headers everywhere

Follow the [IETF RateLimit header fields draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) — return `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` (or `Retry-After` on 429) in all three API layers.

## API contract change

No change for successful requests. Callers that were previously exploiting different limits across layers may receive `429` responses they did not see before. REST export callers already expect a `429`-style refusal via `checkRateLimit` returning `false`; tRPC callers already receive `TOO_MANY_REQUESTS`; GraphQL callers already receive `RateLimitError`.

The new headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) are additive and safe for existing clients to ignore.

## Migration path

1. Add `@upstash/ratelimit` (or `rate-limiter-flexible` + `ioredis`) and set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in `.env` / Helm secrets.
2. Update `server/api/rate-limit.ts` — keep the same exported API, swap the bucket store.
3. Update `lib/rate-limit.ts` — consolidate the export limiter into the shared config.
4. Update `server/graphql/context.ts` to call the new shared limiter (no changes to `server/graphql/rate-limit.ts`).
5. Add `RateLimit-*` headers in the tRPC error handler, the GraphQL route handler, and the export REST routes.
6. Add the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` variables to `.env.example`, `helm/` values, and CI secrets.

## Required env variables

```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## Acceptance criteria

- [ ] All three API layers (tRPC, GraphQL, REST) use the same Redis-backed limiter
- [ ] Limits survive process restarts and work correctly with multiple replicas
- [ ] `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers are returned on all responses
- [ ] `lib/rate-limit.ts` and `server/api/rate-limit.ts` no longer keep in-memory bucket stores
- [ ] CI is green (lint, type-check, tests)
- [ ] No new TODOs without a linked issue
