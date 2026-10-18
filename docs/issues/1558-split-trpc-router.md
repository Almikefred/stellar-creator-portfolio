# #1558: Split `server/api/router.ts` into feature routers

Related issue: [Pick one API style: tRPC, GraphQL or REST #1549](https://github.com/yosemite01/stellar-creator-portfolio/issues/1549)

## Context

[`server/api/router.ts`](../../server/api/router.ts) is a single file containing every tRPC procedure in the application — currently six top-level sub-routers all composed inline:

| Sub-router | Procedures | Notes |
| --- | --- | --- |
| `bounties` | `list`, `myBounties`, `get`, `create` | Public list/get; protected create; all use `rateLimit()` middleware |
| `creators` | `featured`, `list`, `get` | Public; `get` fetches projects and reviews inline via `Promise.all` |
| `escrow` | `create`, `release` | Protected; currently returns mock data |
| `projects` | `create`, `list` | Protected create with rich-text sanitization; public list |
| `analytics` | `dashboard` | Protected; multiple Prisma aggregations + raw SQL |
| `identity` | `verifyZk` | Public; ZK proof verification + JWT issuance |

Everything — input schemas, Prisma queries, business logic, audit logging, domain event emission — lives in the same file. Shared helpers (`creatorCardSelect`, `toCreator` from `creator-mapper.ts`, `rateLimit`, `router`, `protectedProcedure`, `publicProcedure` from `trpc.ts`) are already extracted, so the split is purely organisational.

## Why it matters

A 571-line file with six unrelated feature areas makes code review harder: a PR touching only bounty procedures shows a diff against the same file that owns ZK identity logic. Splitting into one file per feature area makes ownership explicit, diffs focused, and individual routers independently testable.

There is **no behaviour change** — procedure names and types stay identical, so no client code changes.

## Proposed implementation

### Target directory structure

```
server/api/
  routers/
    bounties.ts      # bounties sub-router
    creators.ts      # creators sub-router
    escrow.ts        # escrow sub-router
    projects.ts      # projects sub-router
    analytics.ts     # analytics sub-router
    identity.ts      # identity sub-router
  creator-mapper.ts  # unchanged
  jwt-secret.ts      # unchanged
  listeners.ts       # unchanged
  middleware.ts      # unchanged
  rate-limit.ts      # unchanged
  router.ts          # now just composes the six sub-routers
  trpc.ts            # unchanged
```

### `server/api/router.ts` after the split

```ts
import { router } from './trpc';
import { bountiesRouter } from './routers/bounties';
import { creatorsRouter } from './routers/creators';
import { escrowRouter }   from './routers/escrow';
import { projectsRouter } from './routers/projects';
import { analyticsRouter } from './routers/analytics';
import { identityRouter } from './routers/identity';

export const appRouter = router({
  bounties:  bountiesRouter,
  creators:  creatorsRouter,
  escrow:    escrowRouter,
  projects:  projectsRouter,
  analytics: analyticsRouter,
  identity:  identityRouter,
});

export type AppRouter = typeof appRouter;
```

Each feature file exports its sub-router under a stable name (e.g. `export const bountiesRouter = router({ ... })`), moves the relevant procedures verbatim, and imports only what it needs from `../trpc`, `../creator-mapper`, etc.

### Shared middleware

The `rateLimit()` helper imported from `./trpc` is already reusable. No new shared middleware is needed. Any future cross-cutting middleware (e.g. per-feature audit logging) can be added to `server/api/middleware.ts` and imported by individual routers.

### Step order

To keep individual PRs reviewable and bisectable:

1. **Move first, change nothing.** Copy each procedure group into its own file and compose in `router.ts`. The diff is pure movement — no logic changes. CI must stay green.
2. **Tidy up per feature** in follow-on PRs (e.g. replace the mock escrow stubs, add missing tests for `identity.verifyZk`).

## Files to create

| New file | Content moved from `router.ts` |
| --- | --- |
| `server/api/routers/bounties.ts` | `bounties` router block (lines ~15–115) |
| `server/api/routers/creators.ts` | `creators` router block (lines ~118–240) |
| `server/api/routers/escrow.ts` | `escrow` router block (lines ~243–285) |
| `server/api/routers/projects.ts` | `projects` router block (lines ~288–400) |
| `server/api/routers/analytics.ts` | `analytics` router block (lines ~403–510) |
| `server/api/routers/identity.ts` | `identity` router block (lines ~513–571) |

Line numbers are approximate against commit `e731e2f`; use the procedure names as the stable reference.

## Acceptance criteria

- [ ] Each feature area lives in its own file under `server/api/routers/`
- [ ] `server/api/router.ts` only imports and composes the six sub-routers
- [ ] All procedure names are unchanged — no client code requires modification
- [ ] Shared middleware and helpers remain in their current files
- [ ] CI is green (lint, type-check, tests)
- [ ] No new TODOs without a linked issue
