# #1559: Add DataLoader usage to GraphQL resolvers to avoid N+1 queries

## Context

### Current state

[`server/graphql/resolvers.ts`](../../server/graphql/resolvers.ts) contains all Query and Mutation resolvers. Every resolver calls Prisma directly; none of them use DataLoader. The critical N+1 paths are:

| Resolver | N+1 risk | Current behaviour |
| --- | --- | --- |
| `Query.bounties` | Each bounty includes its `creator` via a Prisma nested `select` | Prisma batches this in a single JOIN, so no N+1 here — but the creator object is fetched inline, meaning a future field resolver for `Creator` type would issue per-row queries. |
| `Query.creators` | Returns a list of creator profiles with no sub-fields | No N+1 today, but a `reviews` or `reputation` field resolver would trigger one. |
| `Query.creator` (single) | No N+1 — single lookup. | — |
| `Query.analytics` | Calls `prisma.review.findMany({ select: { rating: true } })` with no `where` clause — fetches **all** reviews in the database to compute `averageRating`. | Not an N+1, but a full-table scan. |

The most immediate N+1 risk is if a `Creator.reviews` field resolver is added without DataLoader: a `creators` query returning 50 results would issue 51 SQL queries (1 for the list + 1 per creator for their reviews).

### Existing DataLoader infrastructure

[`lib/dataloader.ts`](../../lib/dataloader.ts) ships a hand-rolled `DataLoader<K, V>` class with per-request in-memory cache, configurable batch window (`batchScheduleMs`), and `load` / `loadMany` methods. Two factory functions already exist:

- `createCreatorReviewsLoader()` — batches via `POST /api/creators/reviews/batch`
- `createCreatorReputationLoader()` — batches via `POST /api/creators/reputation/batch`

**Problem:** both loaders use `fetch()` to call REST endpoints instead of calling Prisma directly. This means each batch is an extra HTTP round-trip inside the server, and the batch endpoints (`/api/creators/reviews/batch`, `/api/creators/reputation/batch`) may not exist. For server-side GraphQL resolvers the loaders should call Prisma directly.

[`server/graphql/context.ts`](../../server/graphql/context.ts) (`GraphQLContext`) does **not** attach any DataLoader instances; resolvers cannot currently use them even if they wanted to.

## Why it matters

A `creators` query requesting 50 results with a `reviews` sub-field will issue 51+ SQL queries today — one for the list and one per creator. This is the most common GraphQL performance problem and makes the endpoint unusable under even moderate load.

## Proposed implementation

### 1. Add Prisma-backed loaders to `lib/dataloader.ts`

Replace the HTTP `fetch` approach with direct Prisma calls. Add (or replace) factory functions:

```ts
import { prisma } from '@/lib/prisma';
import { DataLoader } from './dataloader';

/** Batches review lookups by creatorId using a single Prisma query. */
export function createReviewsByCreatorLoader() {
  return new DataLoader(async (creatorIds: string[]) => {
    const rows = await prisma.review.findMany({
      where: { creatorId: { in: creatorIds }, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
    // Group by creatorId and return in key order
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = map.get(row.creatorId) ?? [];
      list.push(row);
      map.set(row.creatorId, list);
    }
    return creatorIds.map((id) => map.get(id) ?? []);
  });
}

/** Batches bounty lookups by creatorId. */
export function createBountiesByCreatorLoader() {
  return new DataLoader(async (creatorIds: string[]) => {
    const rows = await prisma.bounty.findMany({
      where: { creatorId: { in: creatorIds } },
      orderBy: { createdAt: 'desc' },
    });
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = map.get(row.creatorId) ?? [];
      list.push(row);
      map.set(row.creatorId, list);
    }
    return creatorIds.map((id) => map.get(id) ?? []);
  });
}
```

> **Note:** DataLoader instances must be created **per request** — sharing a loader across requests leaks data between users. The loaders go on the GraphQL context, not in a module-level variable.

### 2. Attach loaders to `GraphQLContext`

Update [`server/graphql/context.ts`](../../server/graphql/context.ts):

```ts
import { createReviewsByCreatorLoader, createBountiesByCreatorLoader } from '@/lib/dataloader';

export interface GraphQLContext {
  req: NextRequest;
  userId?: string;
  apiKeyId?: string;
  isAuthenticated: boolean;
  rateLimit?: RateLimitResult;
  loaders: {
    reviewsByCreator: ReturnType<typeof createReviewsByCreatorLoader>;
    bountiesByCreator: ReturnType<typeof createBountiesByCreatorLoader>;
  };
}

export async function createGraphQLContext(req: NextRequest): Promise<GraphQLContext> {
  // ... existing auth + rate-limit logic unchanged ...
  return {
    // ... existing fields ...
    loaders: {
      reviewsByCreator: createReviewsByCreatorLoader(),
      bountiesByCreator: createBountiesByCreatorLoader(),
    },
  };
}
```

### 3. Use loaders in resolvers

Add type-level field resolvers for `Creator` so that sub-field queries are batched:

```ts
// In server/graphql/resolvers.ts
Creator: {
  async reviews(parent: { id: string }, _args: unknown, ctx: GraphQLContext) {
    return ctx.loaders.reviewsByCreator.load(parent.id);
  },
  async bounties(parent: { id: string }, _args: unknown, ctx: GraphQLContext) {
    return ctx.loaders.bountiesByCreator.load(parent.id);
  },
},
```

The existing `Query.bounties` and `Query.creators` resolvers stay unchanged — Prisma batches their nested selects in a single JOIN already. The loaders activate only when a client requests sub-fields through a `Creator` field resolver.

### 4. Fix the `analytics` full-table scan

`Query.analytics` fetches all reviews to compute average rating:

```ts
// Before
const reviews = await prisma.review.findMany({ select: { rating: true } });
const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

// After — single aggregate query, no data transfer
const agg = await prisma.review.aggregate({ _avg: { rating: true } });
const averageRating = agg._avg.rating ?? 0;
```

### 5. Measure before and after

Before merging, capture query counts using Prisma's `$on('query')` event and include the numbers in the PR description. Target: a `creators` query for 50 results with `reviews` sub-field should issue **≤ 2 SQL queries** (1 for the creator list, 1 batched review lookup) instead of 51+.

## Files changed

| File | Change |
| --- | --- |
| [`lib/dataloader.ts`](../../lib/dataloader.ts) | Add Prisma-backed `createReviewsByCreatorLoader` and `createBountiesByCreatorLoader`; deprecate or remove HTTP-fetch loaders |
| [`server/graphql/context.ts`](../../server/graphql/context.ts) | Add `loaders` field to `GraphQLContext` and `createGraphQLContext` |
| [`server/graphql/resolvers.ts`](../../server/graphql/resolvers.ts) | Add `Creator` field resolvers using `ctx.loaders`; fix `analytics` aggregate |

## Acceptance criteria

- [ ] A `creators` query requesting reviews issues a bounded number of SQL queries (≤ 2 for any list size)
- [ ] DataLoader instances are created per request, not at module level
- [ ] `Query.analytics` uses `prisma.review.aggregate` instead of `findMany`
- [ ] PR description includes before/after query counts
- [ ] CI is green (lint, type-check, tests)
- [ ] No new TODOs without a linked issue
