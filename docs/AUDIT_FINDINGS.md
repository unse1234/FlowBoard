# FlowBoard — Audit Findings

Defects and risks **in what already exists**. Missing checklist features are not
findings — those are in `PRODUCTION_PLAN.md`.

First audited 2026-09-23. Kept current as work lands: a fixed finding is marked
RESOLVED rather than deleted, so a future session can see it was considered.
New risks introduced by new code are added here too, even when not yet
reachable.

**Severity** reflects impact *if FlowBoard were exposed publicly today*. Several
CRITICAL items are inherent to a link-shared demo with no accounts, and are
resolved by Step 1 rather than by a patch.

| ID | Severity | Area | Finding |
| --- | --- | --- | --- |
| F-1 | CRITICAL | AuthZ | No authorisation on any socket event |
| F-2 | CRITICAL | AuthN | `userId` is client-asserted and forgeable |
| F-3 | CRITICAL | Durability | Server restart destroys every collaborative board |
| F-4 | HIGH | Correctness | Undo diverges peers, and the comments claim otherwise |
| F-5 | HIGH | Availability | Operation log grows without bound and is fully replayed |
| F-6 | HIGH | Security | No security headers, no CSP, no HSTS |
| F-7 | MEDIUM | Security | Voice signalling has no room-membership check |
| F-8 | MEDIUM | Correctness | Board id sanitisation collapses distinct ids together |
| F-9 | MEDIUM | Security | Operation payload size and shape are effectively unbounded |
| F-10 | MEDIUM | Testing | The entire realtime server layer is untested |
| F-11 | MEDIUM | Correctness | Local cache and server replay can both seed a room |
| F-12 | LOW | Maintainability | Voice event names are a third, unguarded contract copy |
| F-13 | ~~LOW~~ | Ops | ~~`/health` reports health it never checks~~ — **RESOLVED 2026-09-23** |
| F-14 | LOW | Security | AI rate limiting is per-IP, in-memory, and proxy-naive |
| F-15 | MEDIUM | Dependencies | `qs` DoS advisory reaches the app through express |
| F-16 | MEDIUM | Availability | Password hashing can starve the libuv threadpool |

---

## F-1 — CRITICAL — No authorisation on any socket event

**Evidence:** `Backend/src/realtime/boardGateway.js:6-104`,
`Backend/src/realtime/voiceGateway.js:13-189`. No `io.use()` middleware exists
anywhere in `Backend/src` (verified by search).

`board:join` accepts any `boardId` string and any `user` object, joins the
socket to the room, and immediately replays the board's entire operation
history. The only check on `board:event` is that `operation.boardId` equals the
board this socket already joined — which the same client chose.

**Impact:** anyone who learns or guesses a room id has full read and write access
to that board, plus its complete edit history. There is no viewer role, no
membership, and no revocation. Sharing is one-way and permanent: a link cannot
be un-shared.

**Fix belongs to:** Step 1 (identity), then Step 12 (permissions). Not
patchable in isolation — there is no identity to authorise against.

---

## F-2 — CRITICAL — `userId` is client-asserted and forgeable

**Evidence:** `Backend/src/operations/operationValidator.js:17-19` checks only
that `operation.userId` is a non-empty string.
`Backend/src/realtime/boardGateway.js:88` falls back to
`socket.handshake.auth?.userId`, which is also client-supplied and never
verified. `Frontend/src/features/realtime/hooks/useRealtimeCollaboration.js:81`
generates it fresh per page load.

**Impact:** any client can emit operations and presence claiming to be any other
user. Everything downstream that would rely on attribution — "who drew this",
audit logs, per-user undo, comment authorship — is unbuildable until the server
owns identity.

**Fix belongs to:** Step 1. The server must derive `userId` from an
authenticated session and **overwrite** any client-supplied value.

---

## F-3 — CRITICAL — Server restart destroys every collaborative board

**Evidence:** `Backend/src/operations/operationStore.js` — a private
`Map<boardId, Map<operationId, operation>>` with no I/O of any kind.

**Impact:** every deploy, crash or restart silently loses all collaborative
board content. Clients that happen to be connected keep their local copy; anyone
joining afterwards sees an empty board. There is no snapshot and no recovery.

Solo boards are unaffected — they live in the browser's `localStorage`.

**Fix belongs to:** the database foundation (Step 1 prerequisite), then
server-authoritative persistence.

---

## F-4 — HIGH — Undo diverges peers, and the comments claim otherwise

**Evidence:**
- `Frontend/src/hooks/useHistory.js:69-79` — `undo` pops a snapshot and calls
  `setShapes(previous)`.
- `Frontend/src/hooks/useWhiteboard.js:102-110` — that `setShapes` is the plain
  local state setter, not `publishLocalOperation`.
- `OPERATION_TYPES.UNDO` and `.REDO` are declared in both contract copies and
  **referenced by no code at all** (verified by search).

Undo therefore restores a local snapshot and publishes nothing.

**The code comments assert the opposite.**
`Backend/src/operations/operationTypes.js:8-10` says undo and redo "are
published as ordinary inverse operations", and
`Frontend/src/features/realtime/operations/operationTypes.js:14` says they
"travel as ordinary operations". Neither is true of the wired behaviour.

**Impact:** in a shared room, pressing undo silently desynchronises that client
from everyone else. The divergence persists until an unrelated operation happens
to overwrite the affected shapes. Because undo restores a *whole-board* snapshot,
it can also locally discard peers' edits that arrived after the checkpoint.

**Note:** this matches a previously recorded observation that undo is a local
snapshot and never synced. This audit confirms it against the current code and
additionally finds that the contract comments contradict it.

**Fix belongs to:** either wire undo through `publishLocalOperation` as inverse
operations (what the comments already promise), or correct the comments and
document undo as local-only. Do not leave both states asserted.

---

## F-5 — HIGH — Operation log grows without bound and is fully replayed

**Evidence:** `Backend/src/operations/operationStore.js:4-14` never evicts.
`Backend/src/realtime/boardGateway.js:25-31` emits one socket message per stored
operation on every join.

**Impact:** server memory grows with the total number of edits a board has ever
received, for the process lifetime. Join time and join bandwidth grow with the
same number. A long-lived busy board — or a malicious client emitting operations
in a loop — degrades the whole process, since all rooms share it. Base64 images
in the log make each entry large.

**Fix belongs to:** durable storage with periodic snapshot plus compaction, so a
joiner receives one snapshot and a short tail.

---

## F-6 — HIGH — No security headers, no CSP, no HSTS

**Evidence:** `Backend/src/server.js:18-19` applies `cors` and `express.json`
only. No `helmet`, no `Content-Security-Policy`, no `Strict-Transport-Security`,
no `X-Frame-Options` anywhere in `Backend/src` (verified by search). No
`helmet` dependency in `Backend/package.json`.

**Impact:** the app is clickjackable and has no defence-in-depth against script
injection. **UNKNOWN:** whether a reverse proxy or host platform adds headers in
the actual deployment — no deployment config is in the repository.

Mitigating: the frontend has **no** `dangerouslySetInnerHTML`, `innerHTML`,
`eval` or `new Function` (verified by search), and React escapes by default, so
no concrete XSS vector was identified. Canvas text is drawn by Konva, not HTML.

---

## F-7 — MEDIUM — Voice signalling has no room-membership check

**Evidence:** `Backend/src/realtime/voiceGateway.js:14-52`. `voice:join` takes
`roomId`, `userId` and `username` straight from the payload and joins the room.
There is no check that this socket ever joined the corresponding **board**.

**Impact:** anyone who knows a room id can enter its voice room, be announced to
participants as any chosen name and id, receive peers' SDP offers and ICE
candidates, and negotiate audio. Because `voice:join` replays existing
participants to the newcomer, it also enumerates who is present.

Partially mitigating: offer/answer/ICE are routed to a single target socket
rather than broadcast (`voiceGateway.js:5-11`), so an attacker learns
connection metadata only for peers that negotiate with them.

---

## F-8 — MEDIUM — Board id sanitisation collapses distinct ids together

**Evidence:** identical `sanitizeBoardId` implementations at
`Backend/src/realtime/boardGateway.js:126-130`,
`Backend/src/realtime/voiceGateway.js:207-211`, and
`Frontend/src/features/realtime/config/realtimeConfig.js:166-168`. Each replaces
every character outside `[a-zA-Z0-9_-]` with `-`.

**Impact:** `a b`, `a.b`, `a/b` and `a-b` all map to the same room. The
replacement is many-to-one, so distinct-looking ids silently share state. The
generated `room_<uuid>` ids are unaffected, but any hand-written or future
user-chosen id is. Rejecting a malformed id would be safe; rewriting it is not.

Also note this is a fourth copy of the same logic.

---

## F-9 — MEDIUM — Operation payload size and shape are effectively unbounded

**Evidence:** `Backend/src/operations/operationValidator.js` validates the
envelope and the *structure* of a payload — that `payload.shape` is an object
with an id, that `payload.shapes` is a non-empty array of such objects — but
never the number of shapes, the size of a shape, or any field's type or range.

**Impact:** a single `CREATE_SHAPES` operation may carry an arbitrary number of
arbitrarily large shapes, each with arbitrary extra fields, bounded only by
Socket.IO's 1 MB default frame size. Stored forever (F-5) and replayed to every
joiner. Shape fields are also never range-checked, so out-of-range coordinates
reach peers' renderers.

Contrast: the AI endpoint validates its board context thoroughly
(`Backend/src/ai/diagramRequest.js`) — the realtime path does not.

---

## F-10 — MEDIUM — The entire realtime server layer is untested

**Evidence:** `boardGateway.js`, `voiceGateway.js`, `operationStore.js` and
`server.js` are imported only by `server.js` — no test file imports any of them
(verified by search). The 47 backend tests cover the AI layer, `serverConfig`
and `operationValidator`.

**Impact:** join/replay, room isolation, presence broadcast, disconnect cleanup,
voice routing and de-duplication have no regression protection. This is exactly
the code Step 1 must modify to add authentication, so the tests are a
prerequisite, not a follow-up.

---

## F-11 — MEDIUM — Local cache and server replay can both seed a room

**Evidence:** `Frontend/src/hooks/useWhiteboard.js:94` seeds shape state from
`persistenceManager.loadBoard(boardId)`, where `boardId` is the room id in
collaborative mode. The server then replays its full history on join
(`boardGateway.js:25-31`).

**Impact:** a returning client starts from its own cached copy of the room and
then applies the replay on top. Shapes deleted by someone else while this client
was away exist locally and are not removed by a replay that only contains the
original create. This client then persists and may re-publish that stale state.
Not verified end to end at runtime; flagged as a design hazard with a clear
mechanism.

---

## F-12 — LOW — Voice event names are a third, unguarded contract copy

**Evidence:** `Backend/src/realtime/socketEvents.js` defines all nine events.
`Frontend/src/features/realtime/socket/socketEvents.js` defines the four board
events. `Frontend/src/features/communication/voice/SignalingService.js:6-10`
defines the five voice events separately.

`operationContract.test.js` guards the *operation* contract by cross-importing
the backend copy, but nothing guards the *event-name* contract. A renamed voice
event breaks signalling silently.

---

## F-13 — RESOLVED 2026-09-23 — `/health` reports health it never checks

**Was:** `/health` returned a static `{ ok: true }` and there was no readiness
endpoint, so nothing could tell a load balancer that an instance had lost a
dependency.

**Resolved by** splitting the two probes in chunk 0.1:

- `GET /health` stays a **liveness** probe and deliberately checks nothing, so a
  dependency outage never causes an orchestrator to restart a healthy process.
- `GET /ready` is a **readiness** probe that runs `SELECT 1` against the
  database and answers `503` when it cannot, taking the instance out of
  rotation without killing it.

Covered by five tests in `Backend/src/server.test.js`, including one asserting
that a failure never leaks the connection string into the response.

---

## F-15 — MEDIUM — `qs` DoS advisory reaches the app through express

**Evidence:** `npm audit` in `Backend/` reports `qs` 6.15.3 with two moderate
advisories (array-limit bypass, DoS via attacker-controlled `isBuffer`).
`npm ls qs` shows it arriving through `express@5.2.1` and `body-parser@2.3.0`,
not through anything added during Step 1.

**Impact:** `qs` parses query strings on every HTTP request, so the DoS path is
reachable by an unauthenticated caller. Pre-existing, found while installing
`pg`.

**Not fixed here** — bumping express is a dependency change that needs its own
chunk and a full re-test, and it is unrelated to the database foundation.
Do it before any public deployment.

---

## F-14 — LOW — AI rate limiting is per-IP, in-memory, and proxy-naive

**Evidence:** `Backend/src/ai/rateLimiter.js`, keyed by `request.ip`
(`aiRouter.js:100-102`).

**Impact:** the limit resets on restart, is not shared across instances, and
counts every client behind a proxy as one unless Express's `trust proxy` is
configured — which the code does **not** set. `README.md` and the module comment
both flag this for the operator, so it is a documented deployment requirement
rather than an oversight. With no sign-in in front of it, the endpoint still
spends a shared Gemini quota (20 requests/day on the free tier).

---

## F-16 — MEDIUM — Password hashing can starve the libuv threadpool

**Latent, not yet reachable.** Added by Step 1 chunk 1.1 and recorded now so it
is not rediscovered under load. Nothing calls the hasher yet — there is no
signup or login route — so there is currently no way to trigger it.

**Evidence:** `Backend/src/auth/passwordHasher.js` uses `@node-rs/argon2`,
whose work runs on the libuv threadpool. Measured during
`docs/decisions/0004-password-hashing.md`: throughput stops improving beyond the
threadpool size, giving roughly 40–50 hashes per second per instance at the
default parameters, with the pool defaulting to **four** threads.

**Impact once login exists:** a burst of login attempts — credential stuffing,
or simply a popular moment — occupies every threadpool thread. Other native
work on the same instance queues behind it, including anything the readiness
probe depends on, so an instance under a login flood can look unhealthy and be
pulled from rotation while it is in fact working.

**Mitigations, in the order they should land:**

1. **Phase 7 auth rate limiting** is the real fix, and is therefore a stability
   requirement rather than only an abuse control.
2. **Raise `UV_THREADPOOL_SIZE`** in the deployment, ahead of raising the Argon2
   cost. Documented in `Backend/.env.example`.
3. A concurrency cap in front of hashing was considered and deliberately not
   added in chunk 1.1: without a rate limiter it would mostly relocate the
   queue rather than remove it.

---

## Things that were checked and found sound

Recorded so future sessions do not re-audit them.

- **No secrets in source.** `.env` is gitignored on both sides; only
  `.env.example` is committed, with empty values.
- **No SQL injection surface** — there is no database.
- **No XSS sink found** — no `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `new Function` or `document.write` in `Frontend/src`.
- **No CSRF surface today** — no cookies are set or read anywhere, and the only
  mutating HTTP endpoint is authenticated by nothing, so there is no ambient
  authority to ride. **This changes the moment Step 1 introduces cookies.**
- **Prompt injection is defended.** Request and board context are tag-delimited
  with `<` escaped, the system instruction names them as data, and the model's
  output is schema-validated before it leaves the server
  (`Backend/src/ai/diagramPrompt.js`, `diagramSchema.js`). A test asserts board
  context stays inside its tags.
- **AI errors never leak provider detail** — user-safe messages only, with a
  test asserting nothing shaped like an API key reaches error detail.
- **Voice signalling is unicast, not broadcast** — a deliberate choice that
  limits SDP/ICE exposure (`voiceGateway.js:5-11`).
- **CORS origins are normalised** so a configured trailing slash still matches
  (`serverConfig.js:49-52`), with a test.
- **The operation contract has a real drift guard** —
  `operationContract.test.js` cross-imports the backend copy and fails on
  divergence. It runs only in the frontend suite.
