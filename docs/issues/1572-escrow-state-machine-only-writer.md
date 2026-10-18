# #1572: Make the escrow state machine the only way to change payment status

Design decision: [ADR 0002](../adr/0002-escrow-state-machine.md).

## Context
Escrow status is currently written by three separate code paths, each with its own
model and its own (or no) guards:

| Path | Storage | Status values | Guard |
| --- | --- | --- | --- |
| [lib/payments/escrow-service.ts](../../lib/payments/escrow-service.ts), the Stripe escrows used by `/api/payments` and the Stripe webhook | in-memory `Map` | `pending_funding \| funded_authorized \| released \| refunded \| failed` | **None.** `mark*` overwrites status unconditionally ([L107-140](../../lib/payments/escrow-service.ts#L107-L140)). Callers check state in some places and not others. |
| [lib/escrow/escrow-transaction-handler.ts](../../lib/escrow/escrow-transaction-handler.ts) | Prisma `Escrow` ([schema.prisma:579](../../prisma/schema.prisma#L579)) | free-text `String`: `active`, `released`, `refunded`, `disputed` | Release and refund check `status === 'active'` under SERIALIZABLE isolation. **`disputeEscrow` has no check** ([L222-258](../../lib/escrow/escrow-transaction-handler.ts#L222-L258)): it can dispute a released or refunded escrow. Nothing in `app/`, `lib/` or `server/` currently calls these functions. |
| tRPC `escrow.create` / `escrow.release` ([server/api/router.ts:283](../../server/api/router.ts#L283)) | none | none | These are mocks that return fake tx hashes. |

The issue's "direct `prisma.payment.update({ status })`" concern applies to the three
`prisma.escrow.update` calls in `escrow-transaction-handler.ts`. No `Payment` model exists.

## Why it matters
Money state must only move through validated transitions. Today a late Stripe webhook can
move a released escrow back to releasable (see #1575), a released escrow can be disputed,
and `Escrow.status` accepts any string.

## Suggested approach
See ADR 0002 for the full reasoning and alternatives. In small, independently mergeable
steps:

1. **One transition table** in `lib/payments/escrow-state-machine.ts`, exporting
   `assertTransition(from, to)` and `InvalidEscrowTransitionError`. Make
   `escrow-service.ts` `mark*` call it. Same-state calls are no-ops, so webhook replays
   are harmless. This step alone closes the webhook regression.
2. **Guard the Prisma path:** route the three `prisma.escrow.update` calls through the
   same table, and add the missing guard to `disputeEscrow`. Use a compare-and-set write
   (`updateMany({ where: { id, status: from } })`, where a count of 0 means another
   writer won) and the existing `version` column.
3. **Type the column:** migrate `Escrow.status String` to a Prisma `enum EscrowStatus`.
   Add a hand-written migration with a `BEFORE UPDATE` trigger that rejects illegal
   transitions, as a last line of defence.
4. **Forbid bypasses in CI:** add an ESLint `no-restricted-syntax` rule, or a grep step,
   that fails on `prisma.escrow.update*`/`upsert` outside `lib/payments/` and `lib/escrow/`.

Routes map `InvalidEscrowTransitionError` to
`409 { error: 'Invalid escrow transition', details: { from, to } }`.

### API contract change
Invalid transitions that currently return `400 'Escrow is not in a releasable state'`, or
that silently succeed, will return `409`. Clients that only check `res.ok` need no change.

## Test plan
- **Unit:** every `(from, to)` pair. Allowed pairs pass, all others throw, and same-state
  calls are no-ops.
- **Regression:** replaying `amount_capturable_updated` on a released escrow leaves it
  `released`, and `disputeEscrow` on a released escrow throws.
- **Integration:** `escrow_release` twice → the second call gets `409` and Stripe
  `capture` is called once.
- **Concurrency (step 2):** two parallel releases → one succeeds and one gets `409`.

## Acceptance criteria
- [ ] Invalid transitions throw in tests
- [ ] No escrow status write bypasses the state machine (enforced in CI)
- [ ] ADR 0002 merged
- [ ] CI is green (lint, type-check, tests)
