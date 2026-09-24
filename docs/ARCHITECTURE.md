# FlowBoard — Architecture

**Part A describes what exists today, verified against the code.
Part B describes what does not exist yet. They are never mixed.**

---

# PART A — CURRENT ARCHITECTURE

## A.1 System shape

Two deployable units and one external service. No database, no cache, no queue,
no object store.

```
┌──────────────────────────────────────────────────────────┐
│ BROWSER                                                  │
│                                                          │
│  React 19 SPA (no router — BoardPage is the whole app)   │
│    ├── Konva canvas (single <Layer>)                     │
│    ├── localStorage  ← the only durable board storage    │
│    └── sessionStorage ← per-room display name            │
└───────┬──────────────────┬───────────────────┬───────────┘
        │                  │                   │
   HTTP │ POST             │ Socket.IO         │ WebRTC
        │ /api/ai/*        │ (9 events)        │ (mesh, peer-to-peer audio)
        ▼                  ▼                   │
┌──────────────────────────────────────────┐   │
│ NODE SERVER (single process, stateful)   │   │
│                                          │   │
│  Express 5            Socket.IO 4        │   │
│   ├── GET  /health     ├── boardGateway  │   │
│   └── POST /api/ai/     │    └── OperationStore (in-memory Map)
│        generate-diagram └── voiceGateway ├───┘ (signalling only;
│                              │                 audio never touches
│                              │                 the server)
└──────────┬───────────────────┘
           │ HTTPS (API key server-side only)
           ▼
   ┌─────────────────┐        ┌──────────────────────────┐
   │ Google Gemini   │        │ Google public STUN       │
   │ @google/genai   │        │ stun.l.google.com:19302  │
   └─────────────────┘        └──────────────────────────┘
```

**The server is stateful.** All board state lives in one process's memory, so
FlowBoard currently runs as exactly one instance.

## A.2 Frontend

### Layering

```
pages/BoardPage.jsx        presentation + wiring (773 lines)
        │
hooks/useWhiteboard.js     the application core (902 lines) — tools, shapes,
        │                  selection, history, persistence, realtime wiring
        ├── hooks/         useHistory, useBoardSelection, useClipboard,
        │                  useShapeRegistry, useCanvasPan, useTouchGestures, …
        ├── features/      side-effecting subsystems (see below)
        └── domain/        pure functions, no React, no I/O — heavily tested
```

`domain/` is the healthiest part of the codebase: `geometry/`, `shapes/`,
`board/`, `selection/`, `diagram/`, `text/` are pure and carry most of the 194
frontend tests.

### Rendering

- One Konva `<Stage>` with a **single `<Layer>`**
  (`Frontend/src/components/WhiteboardCanvas.jsx:137`).
- `ShapeRenderer` dispatches to per-type strategies in
  `components/renderers/renderingStrategies.jsx`.
- Every shape renders every frame. **No viewport culling, no spatial index, no
  dirty-rectangle redraw, no layer separation, no Web Workers, no code
  splitting** — verified by search.

### Board identity and mode

`useWhiteboard` picks a board id once, at mount:

```
?roomId=<id>  present → collaborative mode; boardId = roomId
              absent  → local mode;         boardId = localStorage board id
```

`joinedExistingRoom` (true when the URL already carried `?roomId=`) is the
**only ownership signal in the product**, and it drives nothing but a "Host"
badge.

## A.3 Realtime

### Client stack

```
useRealtimeCollaboration   identity, presence heartbeat/sweep, React state
        │
OperationDispatcher        local op → applier.markProcessed → publish
        │
RealtimeManager            join/leave, pending-op queue, status, presence
        │
SocketService              socket.io-client wrapper, emitWithAck + timeout
```

### Operation flow

```
local edit
  → useWhiteboard mutates React state (optimistic, already applied)
  → publishLocalOperation(type, payload)
  → createBoardOperation  { operationId, boardId, userId, type, payload, timestamp }
  → applier.markProcessed(operationId)   ← so the echo is ignored
  → RealtimeManager.publishOperation → emitWithAck("board:event", 5 s)
        │
        ▼ server
  validateOperation(envelope + payload shape)
  reject if operation.boardId !== socket.data.boardId
  operationStore.add → { duplicate: true } short-circuits
  socket.to("board:<id>").emit("board:event", { operation, serverTimestamp })
        │
        ▼ peer
  RealtimeManager → OperationDispatcher.applyRemoteOperation
  → OperationApplier.apply → validate, de-dup by operationId, apply → setShapes
```

An unacknowledged operation stays in `RealtimeManager`'s in-memory
`#pendingOperations` map and is retried on the next flush. That map does not
survive a reload.

### Join and replay

`board:join` sends the joiner **every operation the board has ever received**,
one socket message each (`boardGateway.js:25-31`). There is no snapshot, no
compaction, no paging.

### Presence

Separate from operations. A heartbeat every 4 s, a 10 s liveness timeout, a 1 s
sweep marking cursors idle after 3 s, and a 300 ms debounced reply so newcomers
are listed immediately. Presence is broadcast, never stored.

### Conflict handling

Last-writer-wins per field, plus `operationId` de-duplication. Concurrent edits
to the same shape do **not** provably converge. This is an event-broadcast
model, not a CRDT.

## A.4 Voice

WebRTC **mesh** — every participant holds a peer connection to every other, so
this scales to a handful of people, not a room.

```
VoiceManager     lifecycle, mute, speaking detection, error states
  ├── MediaManager      getUserMedia, tracks
  ├── PeerManager       RTCPeerConnection per peer, ICE
  └── SignalingService  voice:* events over the same socket
```

The server is signalling only. `voiceGateway.js` keeps a
`Map<"room::userId", socketId>` and routes offer/answer/ICE **directly to the
target socket** rather than broadcasting — a deliberate choice, documented at
`voiceGateway.js:5-11`, that avoids leaking SDP and local network addresses to
the whole room.

ICE uses Google's public STUN only. `iceServers` is injectable but **no TURN
server is configured and no environment variable exists for one.**

## A.5 AI

The most production-shaped subsystem in the repository, and the reference
pattern for new server code.

```
AiDiagramPanel → useAiDiagram → aiClient.requestDiagram (75 s timeout, abortable)
    │ POST /api/ai/generate-diagram
    ▼
aiRouter          in-memory per-IP fixed-window rate limit (default 10/min)
    │             AbortController wired to response "close"
    ▼
parseDiagramRequest   prompt ≤ 2000 chars, control chars stripped;
    │                 board context ≤ 160 elements, allow-listed fields,
    │                 clamped coordinates, ids matched against /^[A-Za-z0-9_-]+$/
    ▼
buildDiagramPrompt    request in <request> tags, board JSON in <board> tags
    │                 with "<" escaped; system instruction tells the model to
    │                 treat tag contents as data  ← prompt-injection defence
    ▼
geminiProvider        structured output against diagramSchema; one retry on
    │                 overload; never retries a rate limit or rejection
    ▼
validateDiagram       output re-validated before it leaves the server
    ▼
{ ok: true, diagram } → DiagramPreview → user inserts → CREATE_SHAPES operation
```

Errors use one envelope, `{ ok: false, code, error }`, with user-safe messages
in `aiErrors.js`; provider detail and stack traces are logged and never
returned. A test asserts nothing shaped like an API key can reach error detail.

Generated diagrams enter the board as **ordinary shapes** through a normal
`CREATE_SHAPES` operation, so they sync, undo and edit like anything else.

## A.6 Authentication and authorisation

**Neither exists.**

- No `io.use()` middleware. No HTTP auth middleware. Verified by search.
- `board:join` accepts any `boardId` and any `user` object and immediately
  replays the board's full history.
- `board:event` checks only that `operation.boardId` matches the board this
  socket joined. `operation.userId` is validated as a non-empty **string** and
  otherwise trusted entirely.
- The socket handshake carries `auth: { userId }`, but the server only ever uses
  it as a display fallback (`boardGateway.js:88`, `:112`). It is never verified.

The security boundary today is **knowledge of a room id** — a `room_<uuid>` in a
URL — and nothing else.

## A.7 Storage

| Layer | Mechanism | Durability |
| --- | --- | --- |
| Board shapes | `localStorage`, debounced 250 ms | Per browser, until cleared |
| Operation log | `Map<boardId, Map<operationId, op>>` in server memory | Lost on restart |
| Images | base64 data URLs inside the shape | Wherever the shape goes |
| Display name | `sessionStorage` per room; `localStorage` for last used | Per browser |
| Theme, UI layout | `localStorage` | Per browser |

Note that `useWhiteboard` persists to `localStorage` for **collaborative rooms
too**, keyed by room id, and seeds initial state from it before the server
replay arrives.

## A.8 Configuration

`Backend/src/config/serverConfig.js` is the single source. `Backend/.env` is
loaded with `process.loadEnvFile`; environment variables already set always win.

| Variable | Side | Default |
| --- | --- | --- |
| `PORT` | Backend | `3001` |
| `CLIENT_ORIGIN` | Backend | `localhost:5173`, `flow-board-beige.vercel.app` |
| `GEMINI_API_KEY` | Backend | none (AI disabled) |
| `GEMINI_MODEL` | Backend | `gemini-3.6-flash` |
| `AI_RATE_LIMIT_PER_MINUTE` | Backend | `10` (`0` disables) |
| `VITE_API_URL` / `VITE_REALTIME_URL` | Frontend | `http://localhost:3001` |

## A.9 Scaling boundaries (where this breaks today)

1. **One process only.** Board state is in-process memory; a second instance
   serves different state for the same room. No Redis adapter.
2. **Unbounded operation log.** Memory grows with total edits, forever, and join
   cost grows with it.
3. **Restart loses everything.** No persistence, no snapshot, no recovery.
4. **Voice mesh.** O(n²) peer connections; no SFU.
5. **No TURN.** WebRTC will fail behind symmetric NAT in production.
6. **Single render layer, no culling.** Frame cost is linear in total shapes,
   not visible shapes.
7. **1 MB socket frame cap** bounds base64 image size per operation.

---

# PART B — PLANNED / FUTURE ARCHITECTURE

**None of this exists. Nothing below has been started.** It records the target
implied by `flowboard-production-checklist.md` so future sessions know the
direction. Sequencing lives in `PRODUCTION_PLAN.md`; Step 1 detail in
`AUTH/AUTH_PLAN.md`.

## B.1 Planned additions

| Concern | Target | Status |
| --- | --- | --- |
| Database | Relational store with migrations, pooling, indexes | **UNRESOLVED** — engine not chosen, see `AUTH/AUTH_DECISIONS.md` D-1 |
| Identity | `users`, `sessions`/`refresh_tokens`, verification and reset tokens | `users`, `auth_sessions`, `refresh_tokens` ✅ in use; verification and reset tokens not started (Phase 4) |
| AuthN | Email/password, then OAuth, then TOTP, then SSO | Email/password ✅ with JWT access + rotating refresh cookie, CSRF, `requireAuth`, and sign-in in the web app; sockets not yet (Phase 5); OAuth, TOTP, SSO not started |
| AuthZ | Centralised policy module, enforced on every HTTP route *and* socket event | Not started |
| Board storage | Boards as rows; op log + periodic snapshots, server-authoritative | Not started |
| Sync | CRDT (Yjs/Automerge or custom) replacing event broadcast | Not started |
| Offline | IndexedDB operation queue with reconcile-on-reconnect | Not started |
| Scale-out | Redis pub/sub adapter, stateless socket layer | Not started |
| Media | Object storage + CDN, signed URLs, replacing base64 | Not started |
| Jobs | Background queue for exports, thumbnails, email, AI | Not started |
| Email | Transactional provider for verification, reset, invites | Not started |
| Observability | Structured logs with correlation ids, error tracking, metrics | Not started |
| DevOps | Docker, CI (lint + test + build), CD, migrations on deploy | Not started |

## B.2 Architectural seams that already help

The audit found three places where the planned work has somewhere clean to land:

1. **`Backend/src/ai/` is a working template** for validated, error-enveloped,
   rate-limited HTTP endpoints. Auth routes should look like it.
2. **`SocketService` already forwards a handshake `auth` payload**, so socket
   authentication has a natural insertion point at `io.use()` without touching
   the client's call sites.
3. **`OperationStore` is a small, single-purpose class** behind a two-method
   interface (`add`, `list`). Swapping it for a durable, snapshotting store is a
   contained change.
