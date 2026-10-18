# #1575: Handle Stripe webhook retries idempotently

## Context
`POST /api/webhooks/stripe` ([app/api/webhooks/stripe/route.ts](../../app/api/webhooks/stripe/route.ts))
verifies the signature against the raw body, which covers #1521. It then calls
`processStripeWebhookEvent` ([lib/payments/stripe-webhook.ts](../../lib/payments/stripe-webhook.ts)).
Nothing records which `event.id`s have already been handled.

Each handler calls a `mark*` function that overwrites status with no state check
([escrow-service.ts:107-140](../../lib/payments/escrow-service.ts#L107-L140)):

| Event | Calls | Problem on a duplicate or out-of-order event |
| --- | --- | --- |
| `payment_intent.amount_capturable_updated` | `markFundedAuthorized` | If it arrives after `succeeded`, a **released** escrow moves back to `funded_authorized`, and `escrow_release` becomes callable again. |
| `payment_intent.succeeded` | `markReleased` | Today it only overwrites a timestamp. Any payout or credit added here later would run twice. |
| `payment_intent.canceled` | `markRefunded` | Same pattern. |
| `payment_intent.payment_failed` | `markFailed` | If it arrives late, a funded or released escrow becomes `failed`. |

Stripe delivers **at least once**. It retries on timeouts and on any non-2xx response,
and it does not guarantee ordering. Duplicates are normal traffic, not edge cases.

## Why it matters
Processing the same event twice can double-credit, and an out-of-order replay can move
money state backwards. Both are silent: the webhook returns `200` each time.

## Suggested approach
1. **Record processed event IDs** in Postgres. Add this table:
   ```prisma
   model ProcessedWebhookEvent {
     id          String   @id            // Stripe event.id ("evt_...")
     provider    String   @default("stripe")
     type        String
     processedAt DateTime @default(now())

     @@index([processedAt])
   }
   ```
2. **Insert first and skip on conflict**, in the same transaction as the handler's writes:
   - `INSERT … ON CONFLICT (id) DO NOTHING`. If 0 rows were inserted, it's a duplicate:
     return `200 { received: true, duplicate: true }`.
   - Otherwise run the handler. If it throws, the transaction rolls back, the row
     disappears, the route returns 500, and Stripe retries.

   Escrow records still live in memory (`escrow-service.ts`), so they cannot join the
   transaction yet. Until #1572 moves them to Prisma, insert the row **after** the handler
   succeeds, and rely on guarded transitions (#1572) to make the rare
   crash-between-steps replay harmless.
3. **Keep the route thin.** Add `handleStripeEventOnce(event)` to
   `lib/payments/stripe-webhook.ts`, wrapping `processStripeWebhookEvent`. The route
   keeps only the signature check and the HTTP mapping.
4. **Retention:** Stripe retries for up to 3 days. Delete rows older than 30 days from a
   cron under `app/api/admin/cron/`, using the same `X-Cron-Secret` pattern as
   `dispute-deadlines`.
5. **Logging:** log `event.id` and `event.type` only. Never log the payload or the
   `stripe-signature` header.

Dedupe by ID alone does not fix out-of-order events. The state-machine guards in #1572
handle that, and the two changes should land together or in that order.

### Same pattern elsewhere
- **Rust API**, [backend/services/api/src/webhooks/stripe.rs:166-185](../../backend/services/api/src/webhooks/stripe.rs#L166-L185),
  already dedupes in Redis, but has two flaws:
  1. `EXISTS` followed by `SET` is not atomic, so concurrent deliveries can both pass.
     Use `SET NX`.
  2. It marks the event processed **before** handling it, so a failure after the mark
     loses the event for 24 h. Mark only after success, or delete the mark on failure.

  Its 24 h TTL is also shorter than Stripe's 3-day retry window. These belong in a
  follow-up issue.
- **Indexer:** `chain_escrows` inserts use `ON CONFLICT (chain_id) DO NOTHING`, which is fine.

## Test plan
Write the failing test first.
- **Regression (fails today):** deliver `succeeded`, then a replay of
  `amount_capturable_updated` → status stays `released`.
- **Duplicate event:** the same `event.id` twice → the handler runs once, the second
  call returns `{ duplicate: true }`, and the escrow is unchanged.
- **Failure path:** the handler throws → no `ProcessedWebhookEvent` row is written, and
  redelivery processes the event.
- **Integration (route):** two signed POSTs with the same payload → both return `200`,
  with one state change.

## Acceptance criteria
- [ ] A duplicate event is a no-op in tests
- [ ] A handler failure does not mark the event processed
- [ ] The Rust webhook dedupe issues are noted in the PR (or fixed)
- [ ] `docs/PAYMENTS.md` describes webhook dedupe and retention
- [ ] CI is green (lint, type-check, tests)
