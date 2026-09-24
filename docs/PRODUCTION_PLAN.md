# FlowBoard — Production Plan

Source specification: `flowboard-production-checklist.md` (repository root).
This file maps that checklist onto the **verified** repository and sequences the
work. It does not restate the checklist — read the checklist for full item text.

Statuses: **BUILT** (verified working) · **PARTIAL** · **HARDEN** (works, not
production-safe) · **MISSING** · **UNKNOWN**

---

## 1. Scorecard — all 32 checklist sections

| # | Section | Status | One-line evidence |
| --- | --- | --- | --- |
| 1 | Identity & Accounts | **MISSING** | No auth code exists — see `AUTH/AUTH_STATUS.md` |
| 2 | Workspaces & Teams | **MISSING** | No workspace concept anywhere |
| 3 | Board Management | **MISSING** | No dashboard, no board list; one board per URL |
| 4 | Canvas Engine | **PARTIAL** | Pan/zoom/select/group/align/order/snap/grid/minimap built; no rotate, lock, frames, rulers, context menus |
| 5 | Drawing & Styling | **PARTIAL** | Core tools and styles built; no extra primitives, bezier, eyedropper, palettes, per-end arrowheads |
| 6 | Connectors & Diagramming | **MISSING** | Arrows are coordinate-based; no shape binding — `domain/diagram/` lays out AI output only |
| 7 | Text & Rich Content | **PARTIAL** | Inline editing + font/size built; no rich text, lists, links, tables, markdown |
| 8 | Media & Embeds | **HARDEN** | Image upload works but is base64-in-document; no cloud storage, no optimisation, no embeds |
| 9 | Realtime Collaboration | **HARDEN** | Rooms, cursors, presence, reconnect built; no CRDT, no offline, no Redis, no durable persistence |
| 10 | Presence, Voice & Video | **HARDEN** | WebRTC mesh voice built; no TURN, no SFU, no video, no screen share, no chat |
| 11 | Comments & Feedback | **MISSING** | No comment code |
| 12 | Permissions & Sharing | **MISSING** | Link-sharing only, no roles; knowing a room id is full edit access (F-1) |
| 13 | Version History | **MISSING** | No snapshots, no timeline, no restore |
| 14 | AI Layer | **PARTIAL** | Generation, validation, layout, preview, sync, prompt-injection defence built; no comprehension, editing, beautification, streaming, cost tracking |
| 15 | Templates & Facilitation | **MISSING** | No templates |
| 16 | Search & Discovery | **MISSING** | No search |
| 17 | Import / Export | **PARTIAL** | PNG export built; no SVG/PDF/JSON, no import |
| 18 | Integrations & API | **MISSING** | Two endpoints total: `/health`, `/api/ai/generate-diagram` |
| 19 | Notifications | **MISSING** | No notification or email code |
| 20 | Mobile & Input | **PARTIAL** | Responsive layouts and touch gestures built; no stylus pressure, palm rejection, PWA |
| 21 | Accessibility | **PARTIAL** | Shortcuts, focus trap, contrast-checked palette (`utils/color.js` + tests); no ARIA canvas story, no screen-reader testing, no alt text |
| 22 | Internationalisation | **MISSING** | Strings hardcoded in English; no i18n framework, no RTL |
| 23 | Performance | **MISSING** | Single layer, no culling, no spatial index, no workers, no code splitting, no budgets, no benchmarks |
| 24 | Backend Architecture | **MISSING** | No DB, no Redis, no object storage, no jobs, no caching, no backups, no graceful shutdown |
| 25 | Security | **PARTIAL** | Secrets handled well, AI input validated, prompt injection defended; no headers/CSP, no socket authz — see `AUDIT_FINDINGS.md` |
| 26 | Privacy & Compliance | **MISSING** | No policy, no consent, no export/erasure |
| 27 | Observability | **MISSING** | `console` logging only; no correlation ids, error tracking, metrics, alerting |
| 28 | DevOps & Delivery | **MISSING** | No Docker, no CI, no CD, no IaC, no preview envs |
| 29 | Testing & Quality | **PARTIAL** | 241 passing unit tests + ESLint; no integration, multi-client, E2E, load, visual, a11y, or type checking; no CI |
| 30 | Monetisation | **MISSING** | Out of scope for the project |
| 31 | Admin & Enterprise | **MISSING** | Out of scope for the project |
| 32 | Onboarding & Docs | **PARTIAL** | Empty-canvas hint, shortcut sheet, README, design system; no tour, help centre, changelog |

**Summary:** 0 sections fully built · 10 partial or needing hardening · 22
missing. The canvas, drawing, realtime, voice and AI layers are real; the
product substrate underneath them is not.

---

## 2. Gap matrix — items on the critical path

Only items that block other work, or carry real risk, are expanded here. The
scorecard above covers the rest.

### G-1 · Identity & Accounts (§1) — **MISSING**

- **Evidence:** no auth code in `Backend/src` or `Frontend/src`; four backend
  dependencies, none auth-related. Identity is a per-page-load
  `user_<uuid>` (`useRealtimeCollaboration.js:81`).
- **Gap:** everything in §1 — signup, login, verification, reset, tokens,
  sessions, OAuth, 2FA, SSO, account management, auth rate limiting, bot
  protection.
- **Risk:** CRITICAL. Blocks §2, §3, §11, §12, §13, §26, §31 and the
  attribution half of §9.
- **Depends on:** a database (G-2).
- **Phase:** Step 1. Plan in `AUTH/AUTH_PLAN.md`.

### G-2 · Database foundation (§24) — **MISSING**

- **Evidence:** no driver, ORM, schema, migration or connection code anywhere.
- **Gap:** engine choice, connection with pooling, migration tooling, first
  schema, readiness check.
- **Risk:** CRITICAL. Nothing durable can be built without it.
- **Depends on:** one unresolved decision — see `AUTH/AUTH_DECISIONS.md` D-1.
- **Phase:** Step 1, phase 0. **This is the first thing to build.**

### G-3 · Socket authorisation (§25, §12) — **MISSING**

- **Evidence:** no `io.use()` middleware; `board:join` accepts any id and
  replays full history (`boardGateway.js:6-34`). Findings F-1, F-2, F-7.
- **Gap:** authenticate the socket handshake, derive `userId` server-side,
  authorise membership per board, authorise every event.
- **Risk:** CRITICAL. Any room id is full edit access to its board and history.
- **Depends on:** G-1.
- **Phase:** Step 1, late phase (socket integration), completed in Step 12.

### G-4 · Server-authoritative persistence (§9, §24) — **MISSING**

- **Evidence:** `operationStore.js` is an in-memory `Map`. Findings F-3, F-5.
- **Gap:** durable op log, periodic snapshots, compaction, replay from snapshot.
- **Risk:** CRITICAL — every restart loses all collaborative content.
- **Depends on:** G-2.
- **Phase:** Step 2.

### G-5 · Realtime test coverage (§29) — **MISSING**

- **Evidence:** no test imports `boardGateway`, `voiceGateway` or
  `operationStore`. Finding F-10.
- **Gap:** gateway integration tests and two-client convergence tests.
- **Risk:** HIGH — this is precisely the code Step 1 must modify.
- **Depends on:** nothing.
- **Phase:** Step 1 prerequisite. Can start immediately, in parallel with G-2.

### G-6 · Undo semantics (§9) — **HARDEN**

- **Evidence:** Finding F-4 — undo is local-only, and the contract comments
  claim the opposite.
- **Gap:** decide and implement one model; make code and comments agree.
- **Risk:** HIGH — silent divergence between collaborators today.
- **Depends on:** nothing. Fixable now.
- **Phase:** Step 2, or sooner as an isolated correctness chunk.

### G-7 · CRDT / convergence (§9) — **MISSING**

- **Evidence:** last-writer-wins broadcast; no convergence guarantee.
- **Gap:** CRDT state, deterministic resolution, offline queue, reconcile.
- **Risk:** HIGH for correctness, but not blocking.
- **Depends on:** G-4.
- **Phase:** Step 3. Large — treat as its own programme.

### G-8 · Image storage (§8) — **HARDEN**

- **Evidence:** base64 data URLs in the shape
  (`domain/images/imageAssets.js`); 1 MB socket frame cap.
- **Gap:** object storage, upload endpoint, validation (type, size, magic
  bytes), optimisation, signed URLs.
- **Risk:** MEDIUM — bloats operations, localStorage and replay.
- **Depends on:** G-1 (ownership), G-2.
- **Phase:** Step 4.

### G-9 · Bound connectors (§6) — **MISSING**

- **Evidence:** arrows and lines are coordinate-based; no `startBinding`
  equivalent in `domain/shapes/shapeTypes.js`.
- **Gap:** attach by shape id, anchor points, follow on move, rerouting.
- **Risk:** MEDIUM — the checklist marks it a must-have differentiator.
- **Depends on:** nothing technically; touches the operation contract.
- **Phase:** Step 5. Purely frontend-domain work, so it can run in parallel with
  backend phases.

### G-10 · Security headers (§25) — **MISSING**

- **Evidence:** Finding F-6.
- **Gap:** CSP, HSTS, frame options, referrer policy.
- **Risk:** HIGH once publicly deployed.
- **Depends on:** nothing. Small, isolated chunk.
- **Phase:** Step 1, can be done any time.

### G-11 · CI (§28, §29) — **MISSING**

- **Evidence:** no `.github/`, no pipeline of any kind.
- **Gap:** lint + both test suites + build on every push.
- **Risk:** MEDIUM — 241 tests exist and nothing enforces them.
- **Depends on:** nothing. Small chunk, high leverage.
- **Phase:** Step 1, early. Recommended immediately after G-2.

---

## 3. Roadmap

Sequenced by the dependencies found in the audit, not by checklist order. Each
step is delivered in small chunks; `current-task.md` names the active one.

### Step 1 — Identity & Accounts **(active)**

Detailed plan: `AUTH/AUTH_PLAN.md`. Live state: `AUTH/AUTH_STATUS.md`.

Covers G-2, G-5, G-11, G-10, G-1, G-3. Ends when a user can sign up, verify,
sign in, manage sessions and delete their account, and when the socket layer
authenticates and authorises against that identity.

### Step 2 — Durable boards

G-4, G-6. Boards become rows; the op log gains snapshots and compaction; undo
semantics are settled. Unlocks §3 (board management) and §13 (version history).

### Step 3 — Sync correctness and scale

G-7 plus the Redis adapter and horizontal scaling from §9/§24.

### Step 4 — Media and storage

G-8 plus §17 export formats.

### Step 5 — Diagramming depth

G-9 bound connectors, §6 auto-layout and tidy-up, and the §14 canvas-
comprehension AI items that depend on structured connections.

### Step 6 — Product surface

§3 board management, §12 permissions, §13 version history UI, §11 comments.

### Ongoing, not a step

§23 performance, §27 observability, §29 testing depth, §21 accessibility —
each advanced alongside the step that touches the relevant code, with §23
benchmarks measured and recorded as the checklist expects.

### Deliberately deferred

§15, §16, §18, §19, §22, §26, §30, §31, and most of §10 beyond voice. The
checklist's own scope note places these in "Future Work"; this plan agrees and
does not schedule them.

---

## 4. Scope note

`flowboard-production-checklist.md` states that the full list describes a funded
product and that attempting all of it would sink the project. Its defensible
subset is sections 1, 2 (light), 3, 9, 12, 13, 24, 25 (basics), 6 and 8, with
section 14 as the differentiator and sections 23 and 29 for depth.

**The roadmap above is that subset, ordered by real dependencies.** No
requirement here was invented; anything not in the checklist is not in this plan.
