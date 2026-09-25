# Step 1 — Identity & Accounts · PLAN

Target: section 1 of `flowboard-production-checklist.md`.
Baseline: `AUTH_STATUS.md`. Decisions: `AUTH_DECISIONS.md`.

**Stack settled 2026-09-23:** PostgreSQL + `pg` + SQL migrations (ADR 0001),
JWT access + rotating opaque refresh cookie (ADR 0002), multi-instance from the
first commit (ADR 0003).

---

## A. Why this order

Five audit facts determine the sequence. None was assumed.

1. **There was no database**, so Step 1 started with storage, not signup.
   Delivered in Phase 0.
2. **There is almost no HTTP surface to extend** — `/health`, `/ready` and the
   AI endpoint. Auth routes are new construction.
3. **`Backend/src/ai/` is the pattern to copy** — injected dependencies,
   boundary validation, typed error envelope, user-safe messages, diagnostics
   logged not returned.
4. **The realtime gateways are untested** (F-10) and Phase 5 rewrites their
   trust model, so tests come first.
5. **The socket client already sends a handshake `auth` payload**, so socket
   authentication has a clean insertion point at `io.use()`.

The checklist's listing order (signup → verification → reset → OAuth → SSO →
2FA → sessions → tokens) is **not** the build order.

---

## B. Chunks

A chunk is one bounded change plus its tests. `current-task.md` names the
active one. Both suites must pass before a chunk is done.

### Phase 0 — Database foundation ✅ **COMPLETE** (verified on PostgreSQL 18.6)

| # | Chunk | Delivers |
| --- | --- | --- |
| 0.1 | Connection + config | `pg` pool with bounded size, timeouts, startup validation, graceful drain; `DATABASE_URL` in `serverConfig`; `/ready` separated from `/health` |
| 0.2 | Migration runner | `schema_migrations` table, forward-only runner, advisory lock so concurrent instances cannot race, `npm run migrate` |
| 0.3 | `users` table | First migration: users with soft delete, `token_version`, case-insensitive unique email, `updated_at` trigger |
| 0.4 | Test harness | Disposable test database, migrations per run, helpers so later chunks can test against real SQL |

**Done:** the server boots against Postgres, `/ready` answers 200 with a live
database and 503 without, migrations apply repeatably from empty, and all 97
backend tests pass with none skipped.

### Phase 0b — Realtime gateway tests ✅ **COMPLETE**

Closes F-10 before Phase 5 touches this code.

| # | Chunk | Delivers |
| --- | --- | --- |
| 0b.1 | `boardGateway` tests | ✅ 23 tests, real Socket.IO clients |
| 0b.2 | `voiceGateway` tests | ✅ 18 tests, unicast routing proven |
| 0b.3 | `OperationStore` tests | ✅ 9 tests |

**Change no behaviour here.** If a test reveals a bug, record it in
`AUDIT_FINDINGS.md` and pin the current behaviour.

### Phase 0c — Supporting infrastructure · *independent, small*

| # | Chunk | Delivers |
| --- | --- | --- |
| 0c.1 | CI | Lint, both suites, frontend build, on every push (G-11) |
| 0c.2 | Security headers | CSP, HSTS, frame options, referrer policy (F-6) |
| 0c.3 | Redis + shared rate limiting | Redis client, readiness check, the limiter Phase 7 needs (ADR 0003) |

### Phase 1 — Password identity ✅ **COMPLETE** (except the email half of E-12)

| # | Chunk | Delivers |
| --- | --- | --- |
| 1.1 | Hashing module | ✅ Argon2id, ADR 0004 |
| 1.2 | Email normalisation | ✅ NFC + lowercase, RFC limits, injection-safe |
| 1.3 | `authErrors.js` | ✅ Envelope, enumeration rules enforced by test |
| 1.4 | `POST /api/auth/signup` | ✅ Uniform response per E-12, rate limited |
| 1.5 | `POST /api/auth/login` | ✅ Uniform failure, equal work, transparent rehash |

### Phase 2 — Tokens and sessions ✅ **COMPLETE** (2026-09-24)

Introduces cookies, so CSRF lands **in this phase**.

The auth UI is built **after** this phase, not before. The project owner chose
this on 2026-09-24 so the UI can ship with persistent sign-in, rather than hold
sign-in state in memory and lose it on refresh.

| # | Chunk | Delivers |
| --- | --- | --- |
| 2.1 | Sessions + refresh-token migration | ✅ `auth_sessions` (the family: user, device metadata, absolute expiry, revocation with a reason) and `refresh_tokens` (SHA-256 hash, idle expiry, `consumed_at`). Two tables, not a `family_id` — see E-13 |
| 2.2 | Access tokens | ✅ HS256 via `node:crypto` (ADR 0005): strict verifier, `kid` keyring for rotation, `AUTH_ACCESS_TOKEN_KEYS`. `ver` carried; compared where the user row is already read |
| 2.3 | Refresh tokens | ✅ Login creates a session and its first refresh token (SHA-256 at rest), sets a `__Secure-`, `HttpOnly`, `SameSite=Strict`, `Path=/api/auth` cookie, and returns a 15-minute access token. `no-store`. Credentialed CORS on `/api/auth` only. Same-site deployment required (E-15) |
| 2.4 | `POST /api/auth/refresh` | ✅ Rotation under a session-row lock with the token read after it; reuse past a 20 s grace window revokes the session (every successor with it); one `SESSION_INVALID` answer for every refusal; cookie cleared on refusal. Proven by a controlled-interleaving test and a mutation run |
| 2.5 | `POST /api/auth/logout` | ✅ Revokes the cookie's session (reason `logout`), never relabels one already revoked, clears the cookie first, always answers `{ ok: true }` |
| 2.6 | CSRF | ✅ `Origin` must be on the configured list for every state-changing request under `/api/auth`, checked on the router before routes and rate limiting. No CSRF token or `Referer` fallback, and why, in `originCheck.js` |
| 2.7 | HTTP auth middleware | ✅ `requireAuth`: `Authorization: Bearer` only, no I/O, frozen `request.user`, RFC 6750 challenges. `GET /api/auth/me` (pulled forward from Phase 6) re-checks session, `token_version` and status against the database |

### Phase 2 UI — Sign-in in the web app ✅ **COMPLETE** (2026-09-24)

Built on Phase 2, as the owner sequenced it. New files under
`Frontend/src/features/auth/` and `Frontend/src/components/auth/`. Existing
components change only where the account entry points attach.

| # | Chunk | Delivers |
| --- | --- | --- |
| UI-1 | Client + form rules | ✅ `authClient.js` (typed errors, cookie sent only where needed, whole-session validation), `authForm.js` (the server's codes, limits and wording), `authContract.test.js` guarding drift |
| UI-2 | Session controller | ✅ `authSession.js`: restore on load, refresh a minute before expiry, retry on network failure without signing out, Web Locks single-flight, cross-tab sign-in/out carrying no token, generation counter so a late refresh cannot undo a sign-out, sign-out that waits for the server |
| UI-3 | Dialogs and entry points | ✅ `AuthDialog` (both modes, field and form errors, password managers, 44px targets and 16px text on touch), `AccountDialog`, account section leading the board menu on every layout, `AuthProvider` |

### Phase 3 — Session management ✅ **COMPLETE** (2026-09-25)

| # | Chunk | Delivers |
| --- | --- | --- |
| 3.1 | Purge of dead sessions | ✅ Sessions revoked or expired more than 30 days ago are deleted with their tokens, in batches of 500, once per 200 sign-ins and refreshes per process. Indexes in migration 0005. Closes E-13's "required before launch" |
| 3.2 | Session API | ✅ `GET /api/auth/sessions` (live, most recent first, current marked), `DELETE /api/auth/sessions/:id`, `POST /api/auth/sessions/revoke-others`. All behind `requireAuth` plus the live-session check. Another account's session, a made-up id and an ended one all answer the same 404. Mutation-checked, cross-account cases included |
| 3.3 | Devices in the account dialog | ✅ "Where you're signed in": each device in plain words ("Chrome on Windows"), last active, this one marked, sign out one or everywhere else |

### Phase 4 — Email workflows ✅ **COMPLETE** (2026-09-25, the owner's "Phase A")

| # | Chunk | Delivers |
| --- | --- | --- |
| 4.1 | Email service | ✅ `Backend/src/email/`: Resend over `fetch` with bounded retries under one idempotency key, escaped templates, background sending with `drain()` on shutdown, `RESEND_API_KEY` / `MAIL_FROM` / `APP_URL` (E-19, ADR 0007). No dev transport: tokens are never logged |
| 4.2 | Account tokens | ✅ `account_tokens` (migration 0006): one per account and purpose, SHA-256 at rest, replaced on reissue, deleted on use |
| 4.3 | Verification | ✅ Signup emails a 24-hour link, or "you already have an account" (E-12 complete). `POST /verify-email`, `POST /resend-verification` (signed in, capped per address) |
| 4.4 | Password reset | ✅ `POST /forgot-password` (one answer for every address, work done after the response), `POST /reset-password` (30-minute link, ends every session, bumps `token_version`, confirms the address, clears sign-in backoff, sends a notice) |
| 4.5 | Web app | ✅ Verification banner (dismissible per browser session), `/verify-email` and `/reset-password` links, "Forgot password?", reset dialog. `vercel.json` serves the link paths |

The unverified-account policy itself (E-20) is enforced where collaboration
happens: the board API and the socket gateway (Phases 5 and C).

### Phase 5 — Boards, roles and authorised realtime ✅ **COMPLETE** (2026-09-25, the owner's "Phases C and D")

Closes F-1, F-2, F-7 and F-8 wherever the server has a database (E-25). ADR 0008.

| # | Chunk | Delivers |
| --- | --- | --- |
| 5.1 | Boards and invitations | ✅ Migration 0008: `boards` (owner `ON DELETE RESTRICT`), `board_members` (owner never also a member, triggers both ways), `board_invites` (digest, role, expiry, uses, revocation). `boardAccess.js`: view/edit/manage per role, deny by default |
| 5.2 | Board API | ✅ `/api/boards` (list, create, read, rename, delete, roles, remove or leave, hand over, invitations) and `/api/invites` (preview, accept; confirmed address required). Bearer-only, live-session check, per-account allowance, caps |
| 5.3 | Authenticated realtime | ✅ Origin gate on the handshake, access token + live session in `io.use`, identity in `socket.data`, board join authorised before any history, edits need editor, server-stamped `userId`, sanitised presence, voice authorised per board with rebuilt signals |
| 5.4 | Revocation and limits | ✅ Sign-outs, resets, password changes and deletion close sockets; access changes re-check every socket on the board at once; per-socket buckets by event kind; connection attempts limited per account; 2-minute recovery with `skipMiddlewares: false` and a board re-check |
| 5.5 | Web app | ✅ Share panel about people and invitations, `/invite/<token>`, access dialogs, token-authenticated socket and voice, viewers read-only |

### Phase 6 — Account management ✅ **COMPLETE** (2026-09-25, the owner's "Phase B")

| # | Chunk | Delivers |
| --- | --- | --- |
| 6.1 | Name and password | ✅ `PATCH /api/auth/me`; `POST /api/auth/password`: change with the current password (backoff-counted), or set a first one after a recent provider sign-in (migration 0007); every session ends and this device gets a new one; guarded against a racing change |
| 6.2 | Deletion | ✅ `GET`/`POST /api/auth/delete-account`: shared boards must be handed over or deleted first (E-22), then DELETE typed and a fresh proof; immediate removal of the account and everything hanging off it (E-24); sockets closed, notice sent |

Not built, and not asked for: changing the email address, and data export.

### Phase 7 — Auth hardening ✅ **COMPLETE** (2026-09-25)

Reordered on 2026-09-25 so the production blockers come first: the live API had
no database, was cross-site to the app, and sits behind proxies that make every
client look alike.

| # | Chunk | Delivers |
| --- | --- | --- |
| 7.0 | Production topology | ✅ Same-origin auth: `Frontend/vercel.json` rewrite, Vite dev proxy, same-origin client. `docs/DEPLOYMENT.md`. E-15 resolved; E-16, E-17, E-18 recorded |
| 7.1 | Real client addresses | ✅ Vercel's route adds a secret (`AUTH_PROXY_SECRET`, from its environment at request time). With it configured, `/api/auth` refuses requests without it, and trusts `x-vercel-forwarded-for` on those with it. Rate limits and session records use that address. Never `X-Forwarded-For`. Contract test ties the header name across both sides |
| 7.2 | Shared limit store | ✅ `rate_limit_counters` (0003) and `createPostgresRateLimiter`: atomic upsert per request, database-clock windows, hashed keys, self-sweeping. Sign-in and sign-up moved onto it. ADR 0006 |
| 7.3 | Limits on every auth route | ✅ A separate "session" allowance (60/min per client) on refresh, sign-out and me. Refused whole, before any token, session or cookie is touched. The web app treats a 429 as a pause, and a 404 (accounts off: no database) as "unavailable", hiding the account menu with no retry loop |
| 7.4 | Per-account backoff | ✅ `login_throttles` (0004): from the 5th consecutive failure on an address, the next attempt waits 1 min, doubling to a 15 min cap, checked before any lookup or hash. Keyed on the submitted address (hashed), registered or not, so it is no enumeration oracle. Success resets; a day's quiet forgets. Backoff, not lockout |
| 7.5 | Bot protection | ✅ Cloudflare Turnstile on signup (E-18), off until both keys are set. Verified after the form is valid (a typo keeps the token) and before the hash; fails closed if Cloudflare is unreachable; checks the widget's `action`. Tested against Cloudflare's real API with its test keys |
| 7.6 | Security review | ✅ `docs/AUTH/SECURITY_REVIEW.md`. Fixed: IPv6 limits by /64, `x-real-ip` fallback for the client address, `qs` advisory (F-15), web app headers with a report-only CSP (F-6). Residual risks listed with their bounds |

### Phase 8 — Sign-in with providers ✅ **COMPLETE in code** (2026-09-25, the owner's "Phase E")

Google, GitHub and Microsoft (E-23, ADR 0009): `auth_identities` and
`oauth_states` (migration 0009), PKCE for all three, OIDC ID tokens verified
with `node:crypto`, browser-bound single-use state, no linking by email,
explicit connect from settings, the last way in never removable, provider
tokens never stored. **Not yet run against the real providers**: that needs
the owner's app registrations (`DEPLOYMENT.md`).

### Phase 9 — Two-factor authentication · *deferred by the owner, 2026-09-25*

TOTP enrolment, login second step, hashed single-use recovery codes, disable
flow behind re-authentication. Not in this phase. Nothing built so far stands
in its way: a second factor slots in after the password (or provider) check in
`authRouter.js` and `oauthRoutes.js`, before `startSession`.

### Phase 10 — SSO / SAML

Requires Phase 8 and organisation accounts from §2. **Deferred** — not needed
for the defensible project scope.

---

## C. Production validation for Step 1

- [x] Signup, verify, login, refresh, logout, reset and delete work end to end
      against a real database. *(Verified against the local and test databases;
      production has none yet, so not yet there.)*
- [x] No endpoint reveals whether an email address is registered. *(Signup,
      login, forgot-password; the provider "account exists" answer goes only to
      whoever controls a verified identity with that address.)*
- [x] Refresh rotation detects reuse and revokes the family.
- [x] Every socket event is authorised; `userId` is server-derived everywhere.
      *(Where the server has a database: E-25.)*
- [x] Rate limiting and lockout are demonstrated by tests.
- [x] Sessions are listable and individually revocable.
- [x] A negative test exists for every authorisation boundary.
- [x] Both suites pass in CI; migrations run cleanly from empty.
- [x] No secret in frontend code, logs, or error responses.
- [x] `AUTH_STATUS.md`, `PROJECT_CONTEXT.md` and `ARCHITECTURE.md` Part A
      describe the built system.

What is left for Step 1 in production is the owner's configuration: the
database, email, and provider credentials (`../DEPLOYMENT.md`).

---

## D. Out of scope for Step 1

Workspaces and teams (§2), audit logs, SCIM, admin consoles, billing, SSO
(Phase 10) and 2FA (Phase 9). Board roles (owner, editor, viewer) were pulled
forward into Step 1 by the owner on 2026-09-25 (E-21); finer permissions stay
with Step 12.
