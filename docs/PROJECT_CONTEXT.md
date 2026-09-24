# FlowBoard — Project Context

**Verified state of the repository as of the audit (2026-09-23).**
Everything here was checked against the code. Anything not verified is marked
`UNKNOWN`. Planned work lives in `PRODUCTION_PLAN.md`, not here.

---

## 1. Product

A collaborative whiteboard in the browser. Users draw shapes, sketch freehand,
write text, drop images, and build diagrams on an infinite canvas. A board can be
shared as a link; anyone with the link edits it live, sees other people's
cursors, and can join a voice call. An AI assistant turns a written description
into editable diagram shapes.

Positioned as a final-year project (`flowboard-production-checklist.md` says so
explicitly) being hardened toward production.

## 2. Technology stack

### Frontend — `Frontend/`

| Concern | Choice |
| --- | --- |
| Framework | React 19.2.4 |
| Build | Vite 8 (`Frontend/vite.config.js` — react + tailwind plugins only) |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` |
| Canvas | Konva 10.3 / react-konva 19.2.5 |
| Icons | lucide-react |
| Realtime | socket.io-client 4.8.3 |
| Voice | Browser-native WebRTC (no SDK) |
| Routing | **None.** No router dependency. `App.jsx` renders `BoardPage` directly |
| State | React hooks only. No Redux/Zustand/Jotai |
| Language | JavaScript (ESM). No TypeScript |

### Backend — `Backend/`

| Concern | Choice |
| --- | --- |
| Runtime | Node.js, CommonJS (`"type": "commonjs"`) |
| HTTP | Express 5.2.1 |
| Realtime | Socket.IO 4.8.3 |
| Database | PostgreSQL 13+ via `pg` 8.23.0, plain SQL migrations |
| AI | `@google/genai` 2.22.0 (Gemini) |
| CORS | `cors` 2.8.6 |
| Language | JavaScript. No TypeScript |

**The backend has five production dependencies.** `pg` was added in Step 1
Phase 0. There is still no ORM, no auth library, no session store, no Redis
client, no queue, no mailer, and no object-storage SDK.

## 3. Repository structure

```
Flow Board/
├── CLAUDE.md                              # entry point for Claude sessions
├── README.md                              # user-facing project README
├── flowboard-production-checklist.md      # the target specification
├── docs/                                  # this context system
├── Backend/
│   ├── .env.example
│   ├── migrations/                        # forward-only SQL, NNNN_name.sql
│   └── src/
│       ├── server.js                      # app factory + listener + shutdown
│       ├── config/serverConfig.js         # env -> config
│       ├── db/                            # pool, migration runner
│       ├── ai/                            # AI diagram endpoint (best-built area)
│       ├── operations/                    # operation contract + in-memory store
│       └── realtime/                      # Socket.IO gateways (board, voice)
└── Frontend/
    └── src/
        ├── main.jsx, App.jsx, pages/BoardPage.jsx
        ├── components/                    # ui/, layout/, canvas/, inspector/,
        │                                  # collab/, panels/, ai/, renderers/
        ├── domain/                        # pure logic: shapes, geometry,
        │                                  # selection, grouping, diagram, text
        ├── features/                      # realtime/, communication/voice/,
        │                                  # persistence/, ai/, export/,
        │                                  # shortcuts/, theme/, toasts/
        ├── hooks/                         # useWhiteboard (902 lines) and friends
        └── utils/, constants/, design/
```

Frontend logic is cleanly layered: `domain/` is pure and well tested, `features/`
holds side-effecting subsystems, `hooks/` wires them to React. This is a genuine
strength of the codebase.

## 4. Current feature state

### Working and verified

- Infinite canvas: pan, zoom, grid toggle, minimap, snapping guides
- Shapes: rect, ellipse, diamond, line, arrow, freehand pen, laser, eraser,
  text, sticky notes, images
- Styling: stroke/fill colour, width, opacity, dash style, corner rounding,
  sketchy vs clean rendering, text size and font
- Selection: marquee, shift-click multi-select, group/ungroup, align/distribute,
  z-order (forward/backward/front/back, explicit reorder)
- Clipboard: copy/cut/paste/duplicate. Undo/redo (50 steps, local only)
- Export board as PNG
- Keyboard shortcuts with a discoverable `?` sheet
- Light/dark themes; desktop, tablet and phone layouts; touch gestures
- Realtime: shared rooms, live cursors, presence list with heartbeat and
  timeout sweep, connection-state UI, automatic reconnect
- Voice: WebRTC mesh with per-peer signalling, mute, speaking indicators
- AI: description into validated, laid-out, editable diagram shapes

### Not present at all

Accounts, login, workspaces, a board dashboard, folders, templates, comments,
version history, permissions, server-side board persistence, file/object
storage, email, notifications, billing, an admin surface, and a public API.

A database now exists, holding accounts and sessions only (§7). Boards are not in it.

## 5. Authentication state

**Accounts and sessions exist; authorisation does not** (updated 2026-09-24).

- **Accounts:** signup and login with Argon2id passwords (Step 1 Phase 1).
- **Sessions:** 15-minute HS256 access tokens and a rotating HttpOnly refresh
  cookie with reuse detection, logout and CSRF protection. `requireAuth`
  authenticates HTTP routes (Phase 2).
- **Web app:** sign in, create an account and sign out from the board menu, and
  stay signed in across reloads (`Frontend/src/features/auth/`,
  `Frontend/src/components/auth/`).
- **Not yet:** the board and realtime layer ignore accounts, nothing is
  authorised, and boards are not stored against anyone (Phase 5, Step 2).

What the board uses instead, until Phase 5, is an **ephemeral display identity**:

- `userId` — `user_<uuid>`, generated fresh on every page load in
  `Frontend/src/features/realtime/hooks/useRealtimeCollaboration.js:81`. Never
  persisted, never verified by the server.
- `username` — a free-text display name the user types when joining a room,
  stored per-room in `sessionStorage` (`flowboard:collab-user:<roomId>`).
- `userColor` — derived deterministically from `userId`.

Full detail: `AUTH/AUTH_STATUS.md`.

## 6. Realtime state

- **Transport:** Socket.IO, websocket with polling fallback, infinite reconnect
  attempts (`Frontend/src/features/realtime/socket/SocketService.js`).
- **Rooms:** `board:<boardId>` and `voice:<roomId>`. A board id comes from the
  `?roomId=` (collaborative) or `?boardId=` (local) query parameter.
- **Events:** 9 total — `board:join`, `board:leave`, `board:event`,
  `presence:update`, and five `voice:*` signalling events
  (`Backend/src/realtime/socketEvents.js`).
- **Model:** operation broadcast, **not** a CRDT. A client validates and applies
  an operation locally, then publishes it; the server validates the envelope,
  de-duplicates by `operationId`, stores it, and fans it out to the room.
- **Contract:** 19 operation types, duplicated between
  `Backend/src/operations/operationTypes.js` and
  `Frontend/src/features/realtime/operations/operationTypes.js`, guarded by
  `Frontend/src/features/realtime/operations/operationContract.test.js`.
- **Conflict handling:** last-writer-wins per field, plus de-duplication. There
  is no convergence guarantee for concurrent edits to the same shape.
- **Server persistence:** an in-memory `Map` only
  (`Backend/src/operations/operationStore.js`). Every operation a board has ever
  received is retained and **replayed in full to each new joiner**. Nothing
  survives a restart. There is no snapshotting or compaction.
- **Multi-instance:** not supported. No Redis adapter; room state is per-process.
- **Offline:** unsupported. `RealtimeManager` keeps unsent operations in an
  in-memory `Map` that is lost on reload. No IndexedDB queue.

## 7. Database state

**PostgreSQL, added in Step 1 Phase 0** (2026-09-23). Verified against
PostgreSQL 18.6.

- Connection: `Backend/src/db/createDatabase.js` — one pool per process, bounded
  size, connection and statement timeouts, transaction helper, graceful drain.
- Migrations: `Backend/src/db/migrate.js`, forward-only, advisory-locked.
  `npm run migrate`.
- Schema: `users` (`0001_create_users.sql`), written by signup and read by
  login; `auth_sessions` and `refresh_tokens`
  (`0002_create_auth_sessions_and_refresh_tokens.sql`), which **nothing writes
  to yet** — tokens are Phase 2 chunks 2.2–2.4.
- Readiness: `GET /ready` verifies connectivity; `GET /health` stays liveness.

Board content is **not** in the database. That is Step 2.

Persistence today is:

| Where | What | Lifetime |
| --- | --- | --- |
| Browser `localStorage` | Board shapes, per board id, debounced 250 ms (`Frontend/src/features/persistence/PersistenceManager.js`) | Until cleared |
| Browser `localStorage` | Local board id, last display name, theme, UI layout | Until cleared |
| Browser `sessionStorage` | Per-room display name | Tab session |
| Server memory | Operation log per board | Until process restart |

Images are stored as **base64 data URLs inside the shape itself**
(`Frontend/src/domain/images/imageAssets.js`), so they travel through the
operation log and into `localStorage`.

## 8. Infrastructure and deployment state

- **No Dockerfile, no docker-compose, no Terraform, no CI, no `.github/`.**
  Verified by filesystem search.
- **No CD, no staging environment, no migration strategy, no backups.**
- Health: `GET /health` returns `{ ok: true, service: "flowboard-realtime" }`.
  It checks nothing — there is nothing to check. No readiness endpoint.
- Configuration is environment variables read in
  `Backend/src/config/serverConfig.js`: `PORT`, `CLIENT_ORIGIN`,
  `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_RATE_LIMIT_PER_MINUTE`. The frontend
  reads `VITE_API_URL` / `VITE_REALTIME_URL`.
- `Backend/.env` is loaded via `process.loadEnvFile` and is gitignored;
  `.env.example` is the committed template. **No secrets are committed.**
- `serverConfig.js:4` hardcodes `https://flow-board-beige.vercel.app/` as a
  default allowed origin.
- **Deployed (confirmed 2026-09-25):** the web app on Vercel
  (`flow-board-beige.vercel.app`, root directory `Frontend`), the API on Render
  (`flowboard-dmpm.onrender.com`, behind Cloudflare), **no production database
  yet**. Neon is chosen (E-16). Full detail in `DEPLOYMENT.md`.

## 9. Testing state

| Suite | Command | Count | Result |
| --- | --- | --- | --- |
| Backend | `cd Backend && npm test` | 97 | all pass |
| Frontend | `cd Frontend && npm run test:realtime` | 194 | all pass |

Both use the built-in `node:test` runner. Coverage is strong on pure logic
(geometry, shape operations, ordering, diagram layout, the operation
validator/applier, the whole AI layer) and **absent on the realtime server**:
`boardGateway.js`, `voiceGateway.js`, `operationStore.js` and `server.js` are
imported by nothing but `server.js` and have no tests at all.

Missing entirely: integration tests, multi-client sync tests, E2E, load tests,
visual regression, accessibility audits, type checking, backend linting, CI.

## 10. Major technical debt

1. **No server-side identity.** Every trust decision is client-supplied. This
   blocks all of Step 1 and most of permissions, sharing and history.
2. **No durable storage for boards.** A server restart loses every
   collaborative board. PostgreSQL now exists but holds only `users`; moving
   board state into it is Step 2.
3. **Unbounded in-memory operation log**, replayed in full on every join —
   a memory and join-latency problem that grows without limit.
4. **Duplicated contracts.** The operation contract exists twice; voice event
   names exist a third time in
   `Frontend/src/features/communication/voice/SignalingService.js`, outside the
   contract test's guard.
5. **Undo is local-only and silently diverges peers** — see `AUDIT_FINDINGS.md`
   F-4, and note that the code comments claim the opposite.
6. **Images as base64 in the document**, inflating operations, localStorage and
   the socket payload.
7. **No rendering performance work** — a single Konva layer, no viewport
   culling, no spatial index, no workers, no code splitting.
8. **No types.** JSDoc with `// @ts-check` on some frontend modules, but no
   tsconfig and no typecheck script, so the annotations are never enforced.

## 11. Important constraints

- **Gemini free tier:** 20 requests/day per model. `gemini-2.5-flash` is closed
  to new API keys; the default is `gemini-3.6-flash`. Gemini 3 rejects
  `minItems`/`maxItems` in a response schema.
- **The frontend must never hold a secret** — `VITE_`-prefixed variables are
  bundled into the browser.
- **The backend is CommonJS, the frontend is ESM.** The contract test bridges
  them with `createRequire`. Keep both loadable from plain Node with no build.
- **Socket.IO's default `maxHttpBufferSize` is 1 MB**, which bounds how large a
  single operation — including a base64 image — can be.

## 12. Known risks

Ranked, with evidence, in `AUDIT_FINDINGS.md`. The headline ones:

- Any client can join any board by guessing its id and receives its full history.
- Any client can claim any `userId` and forge operations as another user.
- A server restart destroys all collaborative board content.
- The operation log grows forever.

## 13. Production readiness

**Not production ready.** FlowBoard is a capable, well-factored single-room
demo. The canvas, drawing, diagramming and AI layers are genuinely good. What is
missing is the entire product substrate: identity, storage, permissions and
operations.

Against `flowboard-production-checklist.md`, roughly 1 of 32 sections is
substantially complete (AI), 3 are partially complete (canvas, drawing,
realtime), and the rest are largely or entirely unimplemented. The scored matrix
is in `PRODUCTION_PLAN.md`.
