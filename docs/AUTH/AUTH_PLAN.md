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

### Phase 3 — Session management

`GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`, revoke-all-others.

Also a scheduled purge of sessions that expired or were revoked more than a
retention period ago. Their tokens cascade with them. Without it,
`refresh_tokens` grows by one row per rotation forever (E-13). **Required before
launch**, and it gets an index on `auth_sessions` when its query is written.

### Phase 4 — Email workflows · *parallel with 2/3 once Phase 1 lands*

Provider abstraction with a no-op dev transport (D-4); single-use expiring
hashed tokens; verification; forgot-password that always responds identically;
reset that revokes all sessions; the unverified-account policy (D-5).

### Phase 5 — Socket authentication and authorisation

Requires Phase 2 and Phase 0b. Closes F-1, F-2, F-7.

`io.use()` handshake validation; server-derived `userId` **overwriting** the
client value; membership check on `board:join` before any replay; authorisation
on `board:event`, `presence:update` and `voice:join`; frontend token handling
that distinguishes auth failure from a network drop.

**Changes existing product behaviour** — needs D-6 resolved first.

### Phase 6 — Account management

`PATCH /api/auth/me` (`GET` landed in 2.7); password change (revokes other sessions); email
change (verify before effect); data export; deletion with soft delete, grace
period and hard delete; the deleted-boards policy (D-7).

### Phase 7 — Auth hardening ← **in progress**

Reordered on 2026-09-25 so the production blockers come first: the live API had
no database, was cross-site to the app, and sits behind proxies that make every
client look alike.

| # | Chunk | Delivers |
| --- | --- | --- |
| 7.0 | Production topology | ✅ Same-origin auth: `Frontend/vercel.json` rewrite, Vite dev proxy, same-origin client. `docs/DEPLOYMENT.md`. E-15 resolved; E-16, E-17, E-18 recorded |
| 7.1 | Real client addresses | ✅ Vercel's route adds a secret (`AUTH_PROXY_SECRET`, from its environment at request time). With it configured, `/api/auth` refuses requests without it, and trusts `x-vercel-forwarded-for` on those with it. Rate limits and session records use that address. Never `X-Forwarded-For`. Contract test ties the header name across both sides |
| 7.2 | Shared limit store | ✅ `rate_limit_counters` (0003) and `createPostgresRateLimiter`: atomic upsert per request, database-clock windows, hashed keys, self-sweeping. Sign-in and sign-up moved onto it. ADR 0006 |
| 7.3 | Limits on every auth route | ✅ A separate "session" allowance (60/min per client) on refresh, sign-out and me. Refused whole, before any token, session or cookie is touched. The web app treats a 429 as a pause, and a 404 (accounts off: no database) as "unavailable", hiding the account menu with no retry loop |
| 7.4 | Per-account backoff | Slows guessing at one account without letting anyone lock its owner out |
| 7.5 | Bot protection | Cloudflare Turnstile on signup (E-18) |
| 7.6 | Security review | The whole Step 1 surface |

### Phase 8 — OAuth

Provider abstraction; `oauth_accounts` migration; Google, GitHub, Microsoft;
account linking and the email-collision policy (D-9).

### Phase 9 — Two-factor authentication

TOTP enrolment, login second step, hashed single-use recovery codes, disable
flow behind re-authentication.

### Phase 10 — SSO / SAML

Requires Phase 8 and organisation accounts from §2. **Deferred** — not needed
for the defensible project scope.

---

## C. Production validation for Step 1

- [ ] Signup, verify, login, refresh, logout, reset and delete work end to end
      against a real database.
- [ ] No endpoint reveals whether an email address is registered.
- [ ] Refresh rotation detects reuse and revokes the family.
- [ ] Every socket event is authorised; `userId` is server-derived everywhere.
- [ ] Rate limiting and lockout are demonstrated by tests.
- [ ] Sessions are listable and individually revocable.
- [ ] A negative test exists for every authorisation boundary.
- [ ] Both suites pass in CI; migrations run cleanly from empty.
- [ ] No secret in frontend code, logs, or error responses.
- [ ] `AUTH_STATUS.md`, `PROJECT_CONTEXT.md` and `ARCHITECTURE.md` Part A
      describe the built system.

---

## D. Out of scope for Step 1

Workspaces and teams (§2), board roles and permissions (§12), audit logs, SCIM,
admin consoles, billing. Step 1 delivers **identity**; Step 12 decides what an
identity may do.
