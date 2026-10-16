# ADR 0001: Offline queue conflict resolution policy

- Status: Accepted
- Related: #1625, #1527 (`/api/sync/push` payload validation)

## Context

`mobile/src/offline/OfflineQueue.ts` persists mutations made while a device
is offline and `mobile/src/offline/NetworkProvider.tsx` replays them against
the API once connectivity returns. Before this change, a replayed `update`
that the server rejected with `409 Conflict` was treated exactly like any
other failure: it went through the same exponential back-off and, after
`MAX_RETRIES`, was moved to the dead-letter queue — silently discarding
whichever side didn't "win" with no policy at all, and no way for some
entities to merge instead of clobbering.

We need an explicit, per-entity answer to: when the local (offline) write
and the server's current state disagree, which fields win?

## Decision

Two strategies, chosen per entity (`offline/ConflictResolution.ts`,
`ENTITY_CONFLICT_POLICY`):

### `last-write-wins` (the default for unlisted entities)

The write with the newer timestamp fully replaces the other. We compare the
queued operation's `localUpdatedAt` (set by the caller when it enqueues the
op; falls back to `payload.updatedAt`) against the server object's
`updatedAt`/`updated_at`. If the server is strictly newer, the local write is
dropped and the server's value is treated as the final state; otherwise the
local payload is sent as-is (it's at least as new, or we can't tell and
default to trusting the client that was actually there when the edit was
made).

Used for: `rating`, `review`, `bounty`, `escrow`, `payment`, and anything not
explicitly listed. These are cases where a partial merge is either
meaningless (a star rating isn't "half" the old value and half the new one)
or unsafe (merging two different edits to an escrow amount or a payment
status is exactly the kind of silent corruption this policy exists to
avoid). When in doubt, a new entity defaults here.

### `merge`

Field-level merge: start from the server's object, then overlay only the
fields the local write actually changed (`QueuedOperation.changedFields`,
recorded by the caller when it enqueues the op; if omitted, every key present
in the local payload is treated as changed). Every field the local write
didn't touch keeps the server's value.

Used for: `profile`, `portfolio`, `portfolio-item`, `settings` — multi-field
resources where two different fields are plausibly edited independently
(e.g. a user updates their bio offline while an admin or another device
updates their avatar). A `last-write-wins` policy here would silently lose
whichever edit happened to replay second even though the two edits don't
actually conflict.

## How it's wired in

`NetworkProvider.replayOperation` now treats a `409` on an `update` as a
third outcome, not just a failure:

1. Parse the server's current representation from the `409` response body.
2. Look up the entity from the op's endpoint
   (`entityFromEndpoint`, e.g. `/api/v1/profile/42` -> `profile`) and its
   strategy (`getConflictStrategy`).
3. Resolve (`resolveConflict`) and retry the request once with the resolved
   payload.
4. If the retry also fails, it's a real failure and falls through to the
   existing back-off / dead-letter path — resolution is attempted once per
   replay, not looped.

Non-`update` operations (`create`, `delete`) are not subject to this: a
`create` conflict is a duplicate-resource problem, not a merge problem, and a
`delete` has nothing to merge.

## Consequences

- Entities not yet in `ENTITY_CONFLICT_POLICY` default to
  `last-write-wins`, the safer of the two — a new entity type never
  silently gets an unintended merge.
- The server's `409` response must include the resource's current state in
  its body for resolution to run; if it doesn't (or the body doesn't parse),
  we fall back to the previous behaviour (treat it as a plain failure).
- `changedFields` and `localUpdatedAt` are optional on `QueuedOperation` so
  existing call sites that don't set them keep working — `merge` degrades to
  "overlay every local field" and `last-write-wins` falls back to the
  payload's own `updatedAt`, if present, otherwise the local write wins
  whenever the server's timestamp can't be determined either.
- This policy governs resolution once a conflict is detected; it does not
  change validation of what the server accepts in the first place — see
  #1527 for payload validation on `/api/sync/push`.

## Alternatives considered

- **Always last-write-wins.** Simpler, but silently loses concurrent edits
  to unrelated fields on multi-field resources like a profile — exactly the
  failure mode users notice and report as "my changes disappeared".
- **Always merge.** Unsafe for entities like `escrow`/`payment` where a
  field-level merge of two writes can produce a state neither side intended
  (e.g. an amount from one write with a status from another).
- **CRDT / version vectors.** Deterministic and conflict-free by
  construction, but a much larger change (every entity needs a vector clock
  or CRDT-compatible shape, and the server needs to speak it) for a mobile
  app whose conflict rate is low enough that per-entity last-write-wins/merge
  is sufficient. Revisit if conflict volume or entity complexity grows
  enough to justify it.
