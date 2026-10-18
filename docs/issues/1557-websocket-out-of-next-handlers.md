# #1557: Move WebSocket servers out of Next.js route handlers

Related ADR: capture the architectural decision in `docs/adr/` once this work lands (see suggested ADR outline below).

## Context

Two standalone WebSocket servers already exist and run correctly:

| Server | File | Port env var | Protocol |
| --- | --- | --- | --- |
| Yjs collaboration | [`server/realtime/collab.ts`](../../server/realtime/collab.ts) | `WS_PORT` (default `1234`) | `y-websocket` CRDT sync |
| WebRTC signaling | [`server/realtime/signaling.ts`](../../server/realtime/signaling.ts) | separate port (see file) | custom JSON signaling |

The problem is with the two Next.js route handlers that are supposed to be their entry points:

### `app/api/collab/route.ts`
Does **not** hold a WebSocket connection at all. A `GET` request with `Upgrade: websocket` returns `200 { message: "WebSocket endpoint ready" }` instead of performing the HTTP upgrade. A `POST` request simulates WebSocket actions (connect/sync) over plain HTTP. On a serverless platform, this means Yjs collaboration is silently broken — clients cannot sync documents.

### `app/api/signaling/route.ts`
Works correctly as an **HTTP handler**: it issues time-limited TURN credentials (HMAC-SHA1 signed), returns the `signalingWsUrl` pointing at the standalone signaling server, and provides an HTTP fallback relay for SDP/ICE. This route does _not_ attempt to hold a WebSocket connection and does not need to change. However, the in-memory `signalingStore`, `peerOwners`, and `roomMembers` maps do not survive cold starts and do not work across multiple replicas.

### `app/api/messages/`
Not yet audited in detail; should be checked for the same pattern.

## Why it matters

Next.js route handlers run in a serverless or edge runtime. They cannot hold long-lived TCP connections — every request gets its own execution context that terminates after the response is sent. An HTTP upgrade to WebSocket requires a persistent process, which only the standalone servers in `server/realtime/` can provide. Deploying the collab route handler as-is means real-time collaboration will not work in any production environment.

## Proposed approach

The standalone servers are correct. The work is to wire the Next.js route handlers to them properly, and to deploy the realtime servers as their own service.

### Step 1 — Fix `app/api/collab/route.ts`: issue a connection token

The route handler should not attempt a WebSocket upgrade. Instead it should:
1. Authenticate the caller (session or JWT).
2. Mint a short-lived signed token (JWT or HMAC, TTL ≤ 30 s) encoding the `docName` and `userId`.
3. Return `{ wsUrl, token }` where `wsUrl` is `process.env.NEXT_PUBLIC_COLLAB_URL` (pointing at the standalone `collab.ts` server).

The standalone `collab.ts` server then validates the token on connection (add a query-string check in the `connection` handler before calling `setupWSConnection`).

```ts
// app/api/collab/route.ts (after fix)
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const docName = req.nextUrl.searchParams.get('docName') ?? 'default';
  const token = signCollabToken({ userId: session.user.id, docName });
  return NextResponse.json({
    wsUrl: process.env.NEXT_PUBLIC_COLLAB_URL ?? 'ws://localhost:1234',
    token,
    docName,
  });
}
```

### Step 2 — Fix `app/api/signaling/route.ts`: move in-memory state to Redis

The signaling route handler already has the right shape (issues credentials, HTTP fallback relay) but its in-memory stores (`signalingStore`, `peerOwners`, `roomMembers`) reset on cold start and diverge across replicas. Replace them with short-TTL Redis keys. The public API (`GET` for credentials, `POST` for relay) does not change.

### Step 3 — Deploy `server/realtime/` as a standalone service

Add (or update) Docker and Helm resources so the two realtime servers run as their own `Deployment`:

```
deployments/
  realtime/
    Dockerfile          # FROM node:lts-alpine, copies server/realtime/
    collab.Dockerfile   # or a single multi-stage build
```

Relevant env variables to document in `.env.example` and Helm values:

```
# Collaboration WebSocket server
NEXT_PUBLIC_COLLAB_URL=wss://collab.example.com
WS_PORT=1234
WS_HOST=0.0.0.0
WS_HEARTBEAT_INTERVAL_MS=30000
WS_PONG_DEADLINE_MS=10000
WS_IDLE_TIMEOUT_MS=300000
COLLAB_TOKEN_SECRET=          # signs connection tokens

# Signaling server
NEXT_PUBLIC_SIGNALING_URL=wss://signaling.example.com
TURN_SECRET=
TURN_HOST=
TURN_PORT=3478
TURN_TLS_PORT=5349
STUN_URL=stun:stun.l.google.com:19302
TURN_CREDENTIAL_TTL=86400
```

### Step 4 — Check `app/api/messages/`

Audit the messages route handler for the same anti-pattern: if it attempts a WebSocket upgrade or holds a long-lived connection, apply the same token-issuance pattern.

## Suggested ADR outline

Capture in `docs/adr/000N-realtime-deployment.md`:
- **Decision**: Next.js route handlers only issue connection tokens; WebSocket connections are held exclusively by standalone servers in `server/realtime/`.
- **Alternatives considered**: Next.js custom server (`server.js`), edge WebSockets via Cloudflare Durable Objects.
- **Consequences**: Requires separate Docker/Helm resources for realtime servers; adds a token-issuance round-trip before clients connect.

## Acceptance criteria

- [ ] `app/api/collab/route.ts` returns `{ wsUrl, token, docName }` and does not attempt a WebSocket upgrade
- [ ] Standalone `collab.ts` validates the connection token before accepting a Yjs connection
- [ ] `app/api/signaling/route.ts` in-memory relay stores are replaced with Redis-backed storage
- [ ] Realtime servers have a Dockerfile and Helm `Deployment` manifest
- [ ] All required env variables are documented in `.env.example` and Helm values
- [ ] ADR is merged in `docs/adr/`
- [ ] Realtime works in staging
- [ ] CI is green (lint, type-check, tests)
- [ ] No new TODOs without a linked issue
