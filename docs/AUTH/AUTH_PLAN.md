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

### Phase 0b — Realtime gateway tests · *independent, can run any time*

Closes F-10 before Phase 5 touches this code.

| # | Chunk | Delivers |
| --- | --- | --- |
| 0b.1 | `boardGateway` tests | Join, replay, room isolation, `boardId` mismatch, de-duplication, presence, disconnect cleanup |
| 0b.2 | `voiceGateway` tests | Join announcement, unicast offer/answer/ICE, absent target, disconnect cleanup |
| 0b.3 | `OperationStore` tests | Add, duplicate, per-board isolation |

**Change no behaviour here.** If a test reveals a bug, record it in
`AUDIT_FINDINGS.md` and pin the current behaviour.

### Phase 0c — Supporting infrastructure · *independent, small*

| # | Chunk | Delivers |
| --- | --- | --- |
| 0c.1 | CI | Lint, both suites, frontend build, on every push (G-11) |
| 0c.2 | Security headers | CSP, HSTS, frame options, referrer policy (F-6) |
| 0c.3 | Redis + shared rate limiting | Redis client, readiness check, the limiter Phase 7 needs (ADR 0003) |

### Phase 1 — Password identity ← **next**

| # | Chunk | Delivers |
| --- | --- | --- |
| 1.1 | Hashing module | ✅ Argon2id, ADR 0004 |
| 1.2 | Email normalisation | ✅ NFC + lowercase, RFC limits, injection-safe |
| 1.3 | `authErrors.js` | Error envelope mirroring `aiErrors.js` |
| 1.4 | `POST /api/auth/signup` | Create user, hash password, no auto-login |
| 1.5 | `POST /api/auth/login` | Verify with uniform timing and a failure message that never reveals whether an email exists |

### Phase 2 — Tokens and sessions

Introduces cookies, so CSRF lands **in this phase**.

| # | Chunk | Delivers |
| --- | --- | --- |
| 2.1 | `refresh_tokens` migration | Hashed token, family id, user, device metadata, issued/expires/revoked |
| 2.2 | Access tokens | JWT issue + verify, `token_version` check, signing key config |
| 2.3 | Refresh tokens | Issue, hash at rest, cookie flags `HttpOnly`/`Secure`/`SameSite` |
| 2.4 | `POST /api/auth/refresh` | Rotation, reuse detection, family revocation, concurrency-safe |
| 2.5 | `POST /api/auth/logout` | Revoke the presented token |
| 2.6 | CSRF | Protection for every cookie-authenticated route |
| 2.7 | HTTP auth middleware | Verified `request.user` |

### Phase 3 — Session management

`GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`, revoke-all-others.

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

`GET`/`PATCH /api/auth/me`; password change (revokes other sessions); email
change (verify before effect); data export; deletion with soft delete, grace
period and hard delete; the deleted-boards policy (D-7).

### Phase 7 — Auth hardening

Redis-backed per-IP and per-account rate limits; lockout with backoff; bot
protection (D-8); a security review of the whole surface.

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
