# ADR 0002: Escrow state machine is the only writer of escrow status

- Status: Proposed
- Related: #1572 (this ADR), #1575, #1574, #1573

## Context
Escrow status is changed in two code paths that don't share rules:

- `lib/payments/escrow-service.ts` (Stripe escrows, in memory). The `mark*` functions
  overwrite status with no checks, so callers must remember to check first, and the
  Stripe webhook never does.
- `lib/escrow/escrow-transaction-handler.ts` (Prisma `Escrow`). Release and refund check
  for `active`; dispute checks nothing. `Escrow.status` is a free-text `String`.

Whenever a caller forgets a check, money state can move backwards or twice. Examples: a
replayed webhook re-opening a released escrow, or a released escrow being disputed.

## Decision
1. **A single transition table** in `lib/payments/escrow-state-machine.ts` covers both
   paths. Stripe statuses map onto it:

   | From | Allowed to |
   | --- | --- |
   | `pending_funding` | `funded_authorized` (= `active`), `failed`, `refunded` |
   | `funded_authorized` / `active` | `released`, `refunded`, `disputed`, `failed` |
   | `disputed` | `released`, `refunded` (resolution only) |
   | `released` | none (terminal; a later Stripe refund is recorded separately, not as a status rewind) |
   | `refunded`, `failed` | none (terminal) |

2. **All writes go through `assertTransition(from, to)`.** It throws
   `InvalidEscrowTransitionError`. A transition to the current state is a no-op, which
   makes replays safe.
3. **Persisted writes use compare-and-set:**
   `updateMany({ where: { id, status: from, version }, data: { status: to, version: { increment: 1 } } })`.
   If the count is 0, another writer won and we throw.
4. **Database guards:** `Escrow.status` becomes a Prisma enum, and a `BEFORE UPDATE`
   trigger rejects transitions outside the table.
5. **CI guard:** writes to `prisma.escrow.update*`/`upsert` are only allowed inside
   `lib/payments/` and `lib/escrow/`.

## Alternatives considered
- **Per-caller checks (the status quo).** Rejected. The checks have already drifted:
  the webhook and `disputeEscrow` both lack them.
- **A state-machine library (e.g. XState).** Rejected. Six states don't justify a
  dependency, and a lookup table is easier to audit.
- **A DB trigger alone.** Rejected as the primary guard. Errors surface as opaque Prisma
  exceptions and unit tests would need a database. It is kept as a backstop.
- **`SELECT … FOR UPDATE` row locks only.** The Prisma path already uses
  pessimistic locks. Compare-and-set is added because the Stripe path calls an external
  API between the read and the write, and holding a row lock across that call is
  undesirable.

## Consequences
- Invalid transitions return `409` instead of a `400` or a silent success.
- The Stripe in-memory store and the Prisma `Escrow` model still both exist. Merging them
  is out of scope here, but becomes simpler once both share this table.
- Merge order: the table and `mark*` guard first, then the Prisma guard and
  compare-and-set, then the enum migration and trigger, then the CI rule.
