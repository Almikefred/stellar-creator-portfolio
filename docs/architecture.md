# Architecture overview (issue #1629)

This is a map of the whole platform for someone new to the repo: the
Next.js app, its API surfaces (tRPC/GraphQL/REST), the Rust backend
services, the Soroban contracts, the mobile app, and where each piece's
data lives. It intentionally stays one level deep — see
[`README.md#project-structure`](../README.md#project-structure) and
[`backend/README.md`](../backend/README.md#architecture) for the
file-level breakdown of each box below.

## Whole-platform diagram

```mermaid
flowchart TB
    subgraph Clients
        WEB["Next.js app (App Router)<br/>app/ + components/"]
        MOB["Mobile app (Expo / React Native)<br/>mobile/"]
    end

    subgraph "Next.js server-side (server/)"
        TRPC["tRPC router<br/>server/api/"]
        GQL["GraphQL schema + resolvers<br/>server/graphql/"]
        RT["Realtime WebSocket servers<br/>server/realtime/ (collab, signaling)"]
        STELLAR_CLIENT["Stellar RPC client + contract calls<br/>server/stellar/client.ts, contract.ts"]
        INDEXER_TS["Soroban event indexer (TS)<br/>server/stellar/soroban-indexer.ts"]
    end

    subgraph "Rust API (backend/, Actix-web)"
        RUST_API["REST API service<br/>backend/services/api/"]
        RUST_AUTH["Auth service<br/>backend/services/auth/"]
        RUST_INDEXER["Blockchain event indexer<br/>backend/services/indexer/"]
        RUST_DISCOVERY["Service discovery<br/>backend/services/discovery/"]
        RUST_NOTIFY["Notifications (email/push)<br/>backend/services/notifications/"]
    end

    subgraph "Soroban contracts (backend/contracts/, canonical)"
        C_BOUNTY["bounty"]
        C_ESCROW["escrow"]
        C_CORE["core"]
        C_FREELANCER["freelancer"]
        C_GOVERNANCE["governance"]
        C_IDENTITY["identity"]
        C_REFERRAL["referral"]
        C_INSIGHTS["stellar_insights"]
    end

    subgraph "Data stores"
        PG[("PostgreSQL<br/>via Prisma")]
        REDIS[("Redis<br/>lib/storage/")]
        S3[("AWS S3<br/>lib/storage/")]
    end

    SOROBAN_RPC["Soroban RPC / Horizon<br/>(Stellar testnet/mainnet)"]

    WEB --> TRPC
    WEB --> GQL
    WEB --> RT
    MOB --> TRPC
    MOB --> GQL
    MOB --> RT

    TRPC --> PG
    GQL --> PG
    TRPC --> REDIS
    TRPC --> S3
    TRPC --> STELLAR_CLIENT
    GQL --> STELLAR_CLIENT

    STELLAR_CLIENT --> SOROBAN_RPC
    INDEXER_TS --> SOROBAN_RPC
    INDEXER_TS --> PG

    WEB -. "REST (legacy/ops)" .-> RUST_API
    RUST_API --> RUST_AUTH
    RUST_API --> PG
    RUST_INDEXER --> SOROBAN_RPC
    RUST_INDEXER --> PG
    RUST_DISCOVERY --- RUST_API
    RUST_DISCOVERY --- RUST_AUTH
    RUST_DISCOVERY --- RUST_INDEXER
    RUST_NOTIFY --> PG

    SOROBAN_RPC --> C_BOUNTY
    SOROBAN_RPC --> C_ESCROW
    SOROBAN_RPC --> C_CORE
    SOROBAN_RPC --> C_FREELANCER
    SOROBAN_RPC --> C_GOVERNANCE
    SOROBAN_RPC --> C_IDENTITY
    SOROBAN_RPC --> C_REFERRAL
    SOROBAN_RPC --> C_INSIGHTS
```

## What each box is for

- **Next.js app** (`app/`, `components/`) — the web client. Pages and API
  routes only; everything that isn't rendering lives under `server/` or
  `lib/`.
- **Mobile app** (`mobile/`) — Expo/React Native, its own toolchain and
  package.json, talks to the same tRPC/GraphQL/realtime surfaces as the
  web app.
- **tRPC router** (`server/api/`) — the primary typed API surface for the
  Next.js app and mobile.
- **GraphQL** (`server/graphql/`) — a second query surface over mostly the
  same domain data; see its own `resolvers.ts`/`schema.ts` for exactly
  what it covers (follow the [GraphQL security best practices](https://graphql.org/learn/security/)
  linked from issue #1629 if you're extending this surface — this
  codebase has had real query-depth/complexity issues here before).
- **Realtime servers** (`server/realtime/`) — standalone WebSocket
  servers for collaboration (`collab.ts`) and WebRTC signaling
  (`signaling.ts`), separate from the HTTP request/response path.
- **Stellar RPC client / Soroban indexer (TS)** (`server/stellar/`) — the
  Next.js side's own path to Soroban RPC, independent of the Rust
  indexer below; see [Soroban RPC `getEvents`](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents)
  for how both indexers actually pull contract events.
- **Rust API / Auth / Indexer / Discovery / Notifications**
  (`backend/services/*`) — a separate Actix-web service tier. `discovery`
  lets the other services find each other; `indexer` is a second,
  independent path from contract events to Postgres (the TypeScript one
  above is the other). Don't assume these are redundant with the
  Next.js-side equivalents without checking which one a given feature
  actually reads from — they are not interchangeable today.
- **Soroban contracts** (`backend/contracts/`) — canonical on-chain logic.
  The top-level `contracts/` directory (not pictured here) is legacy/
  scaffold and not built by CI — see the note in the root
  [README's Project Structure section](../README.md#project-structure)
  before touching it.
- **Data stores** — Postgres (Prisma) is the system of record; Redis and
  S3 are used from `lib/storage/` for caching/rate-limiting and object
  storage respectively. Both the TS and Rust indexers write Soroban
  contract events into the same Postgres instance.

## Scope note

This stays one level deep by design — a diagram with every file would
defeat the purpose of shortening onboarding. For the next level down in
any box, follow the path mentioned in that box out to the file-level
breakdown in `README.md` or `backend/README.md`.
