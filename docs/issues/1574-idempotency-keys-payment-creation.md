# #1574: Idempotency keys for payment creation

## Context
`POST /api/payments` already requires an `Idempotency-Key` header
([app/api/payments/route.ts:38-49](../../app/api/payments/route.ts#L38-L49)). Responses are
cached for 24 h by [lib/payments/idempotency.ts](../../lib/payments/idempotency.ts), in Redis
with an in-process `Map` as fallback. The route then works like this:

1. `getCachedResponse(key)`; if a hit, return it.
2. Otherwise run the handler (for `bounty_escrow`: `createEscrow` + `stripe.paymentIntents.create`).
3. `cacheResponse(key, 200, body)`.

That covers a retry that arrives *after* the first request finished. It does not cover
the cases this issue is about.

| Gap | Where | Effect |
| --- | --- | --- |
| No in-flight claim | the `get` → work → `set` sequence in the route | Two requests that arrive together (a double-click) both miss the cache. Each creates an escrow and a PaymentIntent, so the user is charged twice. |
| Key is not scoped to a user | `idempotency:payments:${key}` ([idempotency.ts:19](../../lib/payments/idempotency.ts#L19)) | User B who sends user A's key gets A's cached body back, **including A's `clientSecret`**. |
| No request fingerprint | the cache stores only `{status, body}` | Reusing a key with a different body (another bounty or amount) silently returns the old response. |
| Stripe call has no idempotency key | [route.ts:88](../../app/api/payments/route.ts#L88) | A crash between the Stripe call and `cacheResponse` leaves a PaymentIntent that a retry will duplicate. |
| tRPC `escrow.create` | [server/api/router.ts:283-304](../../server/api/router.ts#L283-L304) | Currently a stub that returns a mock. It has no key and no side effects yet. |

### Threat
- **Attacker:** another authenticated user who learns or guesses a key. Keys are often
  short or predictable in clients.
- **What they can do today:** read the victim's cached payment response, which includes
  the PaymentIntent `clientSecret`.
- **Non-malicious failure:** double-clicks and retries on mobile networks create duplicate
  escrows and PaymentIntents.

## Why it matters
Retries on flaky networks are normal. Without a claim that two requests cannot both win,
the existing cache narrows the duplicate window but does not close it. Without per-user
scoping, the cache also leaks data between users.

## Suggested approach
Keep `lib/payments/idempotency.ts` as the single module, and replace `get`/`cache` with one
wrapper so the route stays thin:

```ts
withIdempotency({ userId, key, requestHash }, () => handler()): Promise<{ status, body, replayed }>
```

1. **Validate the header** at the boundary: 1–255 printable ASCII characters. Anything
   else gets `400 { error: 'Invalid Idempotency-Key header' }`.
2. **Scope keys per user:** `idempotency:payments:${userId}:${key}`.
3. **Fingerprint the request:** `requestHash` = SHA-256 of `POST /api/payments` + the
   canonical JSON of the *Zod-parsed* body. This means validating the body before the
   lookup, so validation moves above the cache check.
4. **Claim atomically:** `SET key {state:'in_progress', requestHash} NX EX 86400`. Add a
   `redisSetNx` helper next to `redisSet` in `lib/storage/redis.ts`.
   - Claim won: run the handler, then overwrite the entry with
     `{state:'completed', requestHash, status, body}`.
   - Claim lost, entry `completed`, same hash: replay the response with the header
     `Idempotent-Replayed: true`.
   - Claim lost, entry `in_progress`: `409 { error: 'A request with this Idempotency-Key is still in progress' }`.
   - Claim lost, different hash: `422 { error: 'Idempotency-Key was reused with a different request' }`.
5. **On failure**, a thrown error or 5xx deletes the entry so the client can retry. A 4xx
   result is cached, because the same input will fail the same way.
6. **Pass the key through to Stripe**:
   `paymentIntents.create(params, { idempotencyKey: \`${userId}:${key}\` })`, and the same
   for `checkout.sessions.create`.
7. **In-memory fallback:** keep it for dev and tests, and make it follow the same states.
   Log a startup warning when `NODE_ENV=production` and `REDIS_URL` is unset, because then
   the guarantee only holds within one process.
8. **tRPC:** when `escrow.create` becomes real, it must call the same service with the same
   key. Accept an `idempotencyKey` field in its input. Until then, nothing to do.

Never log the cached body (it contains `clientSecret`) or the full key. A hash prefix is
fine.

### Migration for existing clients
The header is already required, so no new client work is needed for the happy path. Two
behaviour changes need noting in `docs/PAYMENTS.md`:
- Reusing a key with a different body now returns `422` instead of the old response.
- A concurrent duplicate now returns `409` instead of creating a second payment.

Clients should generate one UUID per checkout attempt and reuse it on retries.

## Test plan
- **Unit (`withIdempotency`, Redis mocked):**
  - The first call runs the handler.
  - A repeat replays the response without running the handler.
  - A different hash gets 422.
  - An in-flight claim gets 409.
  - A thrown error deletes the claim.
  - Expiry lets the key be used again.
- **Regression, duplicate request (fails today):** fire two identical `bounty_escrow`
  POSTs with the same key at the same time → exactly one `paymentIntents.create` call and
  one escrow; both responses carry the same `escrowId`, or the second gets 409.
- **Regression, cross-user (fails today):** user A creates a payment with key `k`; user B
  posts with key `k` → B gets a fresh response or an error, never A's `clientSecret`.
- **Integration:** add the above to
  [app/api/payments/\_\_tests\_\_/route.test.ts](../../app/api/payments/__tests__/route.test.ts),
  and assert that `paymentIntents.create` receives `idempotencyKey`.

## Acceptance criteria
- [ ] A repeat request returns the original response
- [ ] Concurrent duplicates create one PaymentIntent
- [ ] Keys are scoped per user, and key reuse with a different body returns 422
- [ ] Stripe receives an idempotency key
- [ ] `docs/PAYMENTS.md` documents the header, 409/422 and `Idempotent-Replayed`
- [ ] CI is green (lint, type-check, tests)
