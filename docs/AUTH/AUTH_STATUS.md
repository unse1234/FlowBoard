# Step 1 — Identity & Accounts · STATUS

**The operational file. Read this first for Step 1. Update it every chunk.**

Last updated: 2026-09-24 (Phase 2 and its web UI complete)

---

## Current position

| | |
| --- | --- |
| **Step** | 1 — Identity & Accounts |
| **Phase** | 2 — Tokens and sessions. **COMPLETE** |
| **Task** | Phase 7 — auth hardening. 7.0–7.3 done; 7.4 (per-account backoff) next |
| **Blocker** | None. F-20 resolved; 0002 is applied to the dev database |

Stack settled: PostgreSQL + `pg` + SQL migrations (ADR 0001), JWT access +
rotating opaque refresh cookie (ADR 0002), multi-instance from the first commit
(ADR 0003).

**There is still no authentication.** Phase 0 built the storage foundation
underneath it, not identity itself.

---

## Completed

| Chunk | Delivers |
| --- | --- |
| 0.1 | `createDatabase` — pooled connection, connection/statement timeouts, transaction helper that discards a connection whose rollback failed, slow-query reporting that never logs values, idle-client error handling. `GET /ready` separate from `/health`. Graceful shutdown draining sockets → HTTP → pool. |
| 0.2 | Migration runner — forward-only, advisory-locked so concurrent instances cannot race, checksum drift detection, each migration committed with its bookkeeping row. `npm run migrate`. |
| 0.3 | `0001_create_users.sql` — UUID ids, `email`/`email_normalized` split, partial unique index on live accounts, `token_version` for stateless revocation, soft delete, CHECK constraints, `updated_at` trigger. **Applied to PostgreSQL 18.6; needed no changes.** |
| 0.4 | Schema integration suite — 11 tests, all passing against a real server. |
| 1.1 | `createPasswordHasher` — Argon2id at OWASP's baseline, PHC-stored parameters, `needsRehash` for transparent cost upgrades, 1024-byte input cap, verification that never throws, and `burnVerificationWork` so an unknown address costs the same as a wrong password. |
| 1.2 | `parseEmailAddress` / `normalizeEmailAddress` — NFC then lowercase, byte-counted RFC 5321 limits, rejects CR/LF (SMTP header injection), invisible characters, bare hostnames and IP-literal domains. Accepts internationalised addresses. Verified against PostgreSQL that the app and `lower()` agree, so the CHECK constraint cannot reject a valid signup. |
| 1.5 | `POST /api/auth/login` — one answer for an unknown address, a wrong password and an account with no password, each doing one Argon2 verification. Account status is checked **after** the password verifies, so `ACCOUNT_UNAVAILABLE` reaches the owner and never a guesser. A stale hash is replaced while the plaintext is in hand, and a failed upgrade never fails the login. |
| 1.4 | `POST /api/auth/signup` — parses the request, hashes, inserts with `ON CONFLICT DO NOTHING`, and answers 202 `{ ok: true }` either way. `userRepository` holds every statement touching `users`, including `findByNormalizedEmail` and `upgradePasswordHash` which 1.5 needs. Per-IP rate limit, interim and per-process. |
| 1.3 | `AuthError` and the error catalogue, mirroring `aiErrors.js`. `toResponseBody` is the only serialiser, so `detail` and `cause` cannot leak by a route spreading the object. `CREDENTIAL_CHECK_CODES` names what a sign-in may answer, and a test greps those messages for wording that would reveal whether an account exists. Password policy: 12–128 code points, with a test that a policy-valid password cannot exceed the hasher's byte cap. |
| 2.1 | `0002_create_auth_sessions_and_refresh_tokens.sql` — `auth_sessions` is the token family (user, sign-in device metadata, absolute expiry, revocation that must carry one of six named reasons); `refresh_tokens` holds a 32-byte SHA-256 digest under a unique index, a per-token idle expiry and `consumed_at` for reuse detection. Cascades from user to session to token. Two tables rather than a `family_id` so revocation cannot race rotation (E-13). 13 integration tests. |
| 2.2 | `createAccessTokens` — HS256 JWTs through `node:crypto` (ADR 0005). Verifier refuses any other `alg`, any header field beyond `alg`/`typ`/`kid`, unknown `kid`, non-canonical base64url and tokens over 2 KB; compares the signature in constant time before parsing claims; never throws. `kid` keyring from `AUTH_ACCESS_TOKEN_KEYS`, first key signs, all verify. A malformed key stops startup. 18 tests; a mutation run disabling each check in turn was caught every time. |
| 2.3 | Login starts a session: `auth_sessions` row with device metadata, first refresh token stored as SHA-256, cookie `__Secure-flowboard_refresh` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`, Max-Age = token life, capped by the session). Body carries the access token, never the refresh token; `Cache-Control: no-store`. The cookie reader rejects a duplicated cookie (planted-cookie defence). Credentialed CORS only for `/api/auth`. With a database but no signing key the server refuses to start. `sessionRepository.js`, `refreshTokens.js`. 24 tests, plus a live check against the dev server. |
| 2.4 | `POST /api/auth/refresh` — `rotateRefreshToken` locks the session row, then reads the token in a separate statement so a rotation it queued behind is visible. A replay past the 20 s grace window revokes the session (`reuse_detected`), killing every successor. Within it, a sibling token (two tabs, or a retry). Grace measured from arrival (`now()`), not lock wait. Every refusal is one `SESSION_INVALID` and clears the cookie; a suspended account gets `ACCOUNT_UNAVAILABLE` and keeps its session. Successors capped by session expiry; `last_used_at` moved, `expires_at` never. 19 tests, including a controlled interleaving that pauses one rotation mid-transaction. A mutation run over 12 faults, including a missing lock and reading the token before the lock, was caught every time. |
| 2.5 | `POST /api/auth/logout` — `revokeSessionByToken` ends the session any of its tokens belongs to, only if not already revoked, so `reuse_detected` is never relabelled. The cookie is cleared before anything can fail; the answer is always `{ ok: true }`. Other devices stay signed in. The outstanding access token lives out its 15 minutes (ADR 0002's bound). 7 tests; mutation-checked. |
| 2.6 | CSRF: `isTrustedOrigin` (`Backend/src/http/originCheck.js`) requires a listed `Origin` on every state-changing request to `/api/auth`, exact match, `null` never trusted, missing refused. Applied on the auth router ahead of every route and of the rate limiter, so a forgery costs the victim nothing. New code `ORIGIN_NOT_ALLOWED` (403). 12 tests asserting refusal *and* no side effect; mutation-checked (removal, ordering after the limiter, case, prefix, null, missing). |
| 2.7 | `createRequireAuth` (`authenticate.js`): `Authorization: Bearer` only, never query or cookie; verification with no I/O; frozen `request.user = { id, sessionId, tokenVersion }`; one body for every failure and RFC 6750 challenges (bare when no credentials, `invalid_token` otherwise). `GET /api/auth/me` re-checks against the database: live session belonging to this user, current `token_version`, account not deleted, and `ACCOUNT_UNAVAILABLE` if suspended. `no-store`. 15 tests; mutation-checked. A live run found `/me`'s own 401s lacked the challenge header, now fixed and pinned. |
| UI-1 | `authClient.js`: typed errors, the cookie sent only by login/refresh/logout, whole-session validation. `authForm.js`: the server's codes, limits and wording, measured the server's way. `authContract.test.js` fails on drift. |
| UI-2 | `authSession.js`: restore on load; refresh a minute before expiry; a network failure retries without signing out; an ended session signs out; Web Locks single-flight; BroadcastChannel carries only signed-in/out; a generation counter so a late refresh cannot undo a sign-out; sign-out waits for the server. 26 tests, mutation-checked. |
| UI-3 | `AuthDialog`, `AccountDialog`, `accountMenuItems.js` (leads the board menu, so the desktop dropdown and phone sheet alike), `AuthProvider` (one controller per page, StrictMode-safe). |

## In progress

**Phase 2 is complete.** Sign-in issues a 15-minute access token and a
rotating refresh cookie. Refresh keeps a session alive across reloads, reuse
detection revokes a stolen session, logout ends it, CSRF is defended, and
`requireAuth` authenticates HTTP routes with no I/O. **Next: the auth UI**
(owner's sequencing, 2026-09-24). Its deployment prerequisite is E-15.

## Not started

| Phase | Contents | Blocked by |
| --- | --- | --- |
| 0b | ✅ Realtime gateway tests — 50 tests, F-10 resolved | — |
| 0c | CI pipeline; security headers; Redis | — (unblocked) |
| 1 | Complete, except the email half of E-12 (needs Phase 4) | — |
| 2 | ✅ **Complete** — sessions, access + refresh tokens, rotation, reuse detection, logout, CSRF, `requireAuth`, `GET /me` | — |
| 3 | Session listing and revocation | Phase 2 |
| 4 | Email delivery, verification, password reset | Phase 1, D-4, D-5 |
| 5 | Socket authentication and per-board authorisation | Phase 2, Phase 0b, D-6 |
| 6 | Account settings, deletion, export, soft delete | Phase 1, D-7 |
| 7 | Auth rate limiting, lockout, bot protection | Phase 1, D-8 |
| 8 | OAuth (Google, GitHub, Microsoft) | Phase 2, D-9 |
| 9 | TOTP + recovery codes | Phase 2 |
| 10 | SSO / SAML | Phase 8 — deferred |

---

## What the board still uses instead of identity

**Accounts exist and the web app signs people in** (Phase 2 and its UI). The
board and realtime layer do not use them yet: until Phase 5 it keeps the
**ephemeral, client-asserted display identity** below, which no server
verifies.

| Thing | Value | Where | Lifetime |
| --- | --- | --- | --- |
| `userId` | `user_<uuid>` | `Frontend/src/features/realtime/hooks/useRealtimeCollaboration.js:81` | One page load |
| `username` | Free text typed on join | `sessionStorage` `flowboard:collab-user:<roomId>` | Tab session |
| Last name used | Convenience default | `localStorage` `flowboard:display-name` | Until cleared |
| `userColor` | Hash of `userId` | `constants/presence.js` | Derived |

`userId` is sent in the Socket.IO handshake as `auth: { userId }`
(`SocketService.js:16`), but the server uses it **only** as a display fallback
(`boardGateway.js:88`, `:112`) and never validates it.

### Request flow as it exists

```
Browser
  → ?roomId=<id> in the URL, or none (solo, localStorage board)
  → JoinRoomDialog asks for a display name   ← the only "sign-in"-shaped step
  → socket.connect(auth: { userId })         ← not verified
  → emit board:join { boardId, user }        ← not authorised
  → server: socket.join("board:<id>") and replays the entire operation history
```

There is **no** controller layer, no service layer, no database, and no token
handling. The chain the audit was asked to trace stops at the socket handler.

## Identity data model

**The `users` table exists and is verified** (`Backend/migrations/0001_create_users.sql`).
Signup (1.4) writes to it and login (1.5) reads it, but no socket or board path
knows about it: at runtime a collaborator is still only fields on in-flight
socket messages.

**`auth_sessions` and `refresh_tokens` exist and are verified**
(`Backend/migrations/0002_create_auth_sessions_and_refresh_tokens.sql`), and
**nothing writes to them yet.**

Columns that later phases depend on: `token_version` (Phase 2 revocation),
`email_verified_at` (Phase 4), `password_hash`, nullable for OAuth-only
accounts (Phase 8), and `deleted_at` + `status` for soft delete (Phase 6).

## Token model

**Access tokens: issued at sign-in and refresh.** `accessTokens.js` (2.2)
signs and verifies 15-minute HS256 JWTs carrying `sub`, `sid` (the session) and
`ver` (`token_version`). No JWT dependency (ADR 0005). Sent as
`Authorization: Bearer`, checked by `requireAuth` (2.7) with no I/O.

**Refresh tokens: issued at sign-in (2.3), rotated on every refresh (2.4).**
32 random bytes, sent as an HttpOnly cookie scoped to `/api/auth`, stored as a
SHA-256 digest. Reuse detection revokes the session; logout (2.5) ends it.

**Login now issues both tokens** and creates an `auth_sessions` row.

## Session model

**Live.** `auth_sessions` (2.1) is one row per sign-in, the family of ADR
0002, with an absolute expiry and revocation that must carry a reason. Created
at sign-in, rotated on refresh, ended by logout or reuse detection. Listing and
revoking from a UI is Phase 3.
Elsewhere in the codebase "session" still means a Socket.IO connection or the
browser's `sessionStorage`, which is why the table is `auth_sessions`.

## Email workflows

**None.** No mailer dependency, no templates, no verification or reset tokens,
no outbound email of any kind.

## Security controls relevant to Step 1

| Control | State | Evidence |
| --- | --- | --- |
| Password hashing | **Argon2id, OWASP baseline** | `Backend/src/auth/passwordHasher.js`, ADR 0004 |
| Auth rate limiting | **Shared across instances** (PostgreSQL, 7.2), keyed on the edge-vouched client address (7.1), 5/min for sign-in and sign-up together | `Backend/src/http/rateLimiter.js`, ADR 0006 |
| AI rate limiting | Present, per-IP, in-memory | `Backend/src/ai/rateLimiter.js` |
| CSRF | **Defended** — trusted-`Origin` check on every state-changing `/api/auth` request, plus `SameSite=Strict` and `Path=/api/auth` | `originCheck.js`, 2.6 |
| Secure cookie flags | **`HttpOnly`, `Secure`, `SameSite=Strict`, `__Secure-` prefix, `Path=/api/auth`** | `refreshTokens.js`, E-15 |
| CORS | Configured, origins normalised, tested | `serverConfig.js:49-52` |
| Security headers / CSP | **Absent** | Finding F-6 |
| Socket authN / authZ | **Absent** | Findings F-1, F-2, F-7 |
| Secrets handling | Sound | `.env` gitignored, `.env.example` committed |

**CSRF becomes live the moment Phase 2 introduces cookies.** It is listed as
"no surface" today only because there is no ambient authority to ride.

## Test coverage for Step 1

| Suite | Result |
| --- | --- |
| Backend | **411 pass, 0 fail, 0 skipped** |
| Frontend | **267 pass** |

The backend grew from 47 to 97 tests in Phase 0. The schema integration tests
run against PostgreSQL 18.6 and confirm, among other things, that the login
lookup uses `users_email_normalized_active_key` — read from the EXPLAIN plan
rather than assumed.

`server.js` now has coverage for readiness and shutdown. `boardGateway.js`,
`voiceGateway.js` and `operationStore.js` remain untested (finding F-10) —
**Phase 0b exists to fix this before Phase 5 touches those files.**

---

## Known issues blocking or shaping Step 1

| ID | Issue | Effect on Step 1 |
| --- | --- | --- |
| F-16 | Hashing can starve the libuv threadpool | Latent until 1.4/1.5; Phase 7 is the fix |
| — | `POST /api/auth/refresh` has no rate limit | Tokens are 256 random bits, so not guessable; Phase 7 adds a generous limit |
| F-1 | No socket authorisation | Phase 5 closes this |
| F-2 | `userId` forgeable | Phase 5 closes this |
| F-10 | Realtime layer untested | Phase 0b must precede Phase 5 |
| F-6 | No security headers | Small independent chunk, do early |
| F-8 | Id sanitisation collapses ids | Do not copy this pattern into auth code |
| F-15 | `qs` advisory via express | Bump express when convenient; not auth-specific |

## Important dependencies

- **Phase 1 before Phase 2** — tokens need a user to issue against.
- **Phase 2 before Phase 5** — the socket cannot authenticate without a token.
- **Phase 0b before Phase 5** — do not modify untested gateways.
- **Email (Phase 4) is independent of tokens (Phase 2)** and can run in
  parallel once Phase 1 lands.
- **Adding cookies (Phase 2) makes CSRF protection mandatory** in the same
  phase, not later.
- **`token_version` already exists on `users`**, so Phase 2 does not need a
  migration for stateless revocation.

## Recent changes

| Date | Change |
| --- | --- |
| 2026-09-23 | Repository audit; context system created. No functional code changed. |
| 2026-09-23 | D-1, D-3 and the scaling model resolved as ADRs 0001–0003. |
| 2026-09-23 | Phase 0 chunks 0.1–0.4: connection layer, readiness, graceful shutdown, migration runner, `users` migration, integration harness. Backend tests 47 → 97. |
| 2026-09-23 | Schema verified against PostgreSQL 18.6. All 11 integration tests pass; the migration needed no changes. Suite now 97 pass, 0 skipped. |
| 2026-09-23 | D-2 resolved as ADR 0004. Chunk 1.1: Argon2id password hasher, 23 tests. Backend suite 97 → 120. |
| 2026-09-23 | Chunk 1.2: email validation and normalisation, 19 unit tests plus 3 integration tests confirming the app and PostgreSQL agree on lowercasing. Backend suite 120 → 142. |
| 2026-09-23 | Chunk 1.3: auth error envelope, 19 tests. D-10 raised (signup enumeration policy). Backend suite 142 → 161. |
| 2026-09-23 | D-10 resolved as E-12 by the project owner: uniform signup response, email carries the truth. Chunk 1.4: signup route, request parser, user repository. F-17 recorded (residual signup timing). Test suite made serial. Backend suite 161 → 184. |
| 2026-09-24 | Chunk 1.5: login route, `ACCOUNT_UNAVAILABLE`, transparent hash upgrade. Shared test harness extracted to `testServer.js`. Login timing measured flat across all three paths. Backend suite 184 → 201. |
| 2026-09-24 | Owner chose to finish Phase 2 before the auth UI. Chunk 2.1: `auth_sessions` + `refresh_tokens` migration, E-13 recorded. F-20 found while applying it to the dev database. Backend suite 264 → 277. |
| 2026-09-24 | F-20 resolved: migration checksums ignore line endings, `.gitattributes` pins migrations to LF. 0002 applied to the dev database. Backend suite 277 → 280. |
| 2026-09-24 | Chunk 2.2: access tokens, ADR 0005 / E-14. Backend suite 280 → 303. |
| 2026-09-24 | Chunk 2.3: login issues a session, refresh cookie and access token. E-15 (same-site deployment) recorded. Dev `.env` gained a signing key. Backend suite 303 → 327. |
| 2026-09-24 | Chunk 2.4: refresh with rotation and reuse detection. An HTTP-level concurrency test was found by mutation to prove nothing and was replaced by a controlled-interleaving test. Backend suite 327 → 346. |
| 2026-09-24 | Chunk 2.5: logout. Backend suite 346 → 353. |
| 2026-09-24 | Chunk 2.6: CSRF protection. Backend suite 353 → 365. |
| 2026-09-24 | Chunk 2.7: `requireAuth` and `GET /api/auth/me`. **Phase 2 complete.** Backend suite 365 → 380. |
| 2026-09-24 | UI-1: `authClient.js`, `authForm.js`, auth contract test. F-21 recorded. Frontend suite 207 → 228. |
| 2026-09-24 | UI-2: session controller, mutation-checked; a Node run of the real client against the live server proved sign-in survives reloads and sign-out survives a reload. Frontend suite 228 → 254. |
| 2026-09-24 | UI-3: dialogs, menu entries, provider. Build verified; not yet viewed in a browser. Test accounts removed from the dev database. Frontend suite 254 → 259. |
| 2026-09-25 | Owner: backend on Render. Live checks found no production database, a cross-site API, and Cloudflare in front. Decisions E-16 (Neon), E-17 (PostgreSQL limits), E-18 (Turnstile). Chunk 7.0: same-origin auth via Vercel rewrite and Vite proxy, `docs/DEPLOYMENT.md`; the full sign-in flow verified through the proxy. F-23 found. Frontend suite 259 → 260. |
| 2026-09-25 | Chunk 7.1: edge-authenticated client addresses. Research: Vercel documents overwriting `x-forwarded-for`; Render's behaviour is undocumented and was not relied on. Mutation-checked. F-14 raised to MEDIUM (all AI users share one limit in production). Backend 380 → 394, frontend 260 → 263. |
| 2026-09-25 | Chunk 7.2: rate limits in PostgreSQL (migration 0003, ADR 0006). 30 concurrent requests across two limiters, limit 5, gave exactly 5. Mutation-checked. Dev database migrated. Backend 394 → 404. |
| 2026-09-25 | Chunk 7.3: session allowance on refresh, sign-out and me. The web app treats a 404 from auth as accounts unavailable, so it is safe to deploy before production has a database, verified against a database-less server. Backend 404 → 411, frontend 263 → 267. |

---

## Next recommended task

**Phase 2 and its UI are complete** (2026-09-24). In order:

1. **Look at the UI in a browser.** It could not be viewed in the session that
   built it. It is verified by lint, the build, 259 frontend tests, and a Node
   run of the real client against the live server, but nobody has seen it. Run
   the backend and `npm run dev`, open **http://localhost:5173** (not
   127.0.0.1, which is not on the CORS list), then use the board menu (the
   ellipsis on desktop, the menu button on a phone), choose Sign in, then Create
   an account. Reload, and you should still be signed in. Check dark mode and a
   phone width.
2. **Decide the production topology (E-15)** before auth is deployed. The web
   app and the API must be same-site, and where the backend runs is unknown.
   A Vercel rewrite of `/api` to the backend is the smallest change.
3. **Phase 7: rate limiting.** F-16 and F-17 are reachable, the limiter is
   per-process, and `POST /api/auth/refresh` has no limit at all.
4. **Phase 5: socket authentication.** Unblocked by Phase 2 and Phase 0b, but
   it needs D-6 decided first. `getAccessToken()` in `authSession.js` is the
   seam it will use.
5. **Phase 3** (a session list: the account dialog is its home) and **Phase 4**
   (email, D-4), in either order.

## Do not touch / protected areas

Step 1 has no business changing these. Modifying them is out of scope and will
break passing tests.

| Area | Why |
| --- | --- |
| `Backend/src/ai/**` | Complete, well tested, and the pattern to copy — read it, do not edit it |
| `Frontend/src/domain/**` | Pure, heavily tested board logic; unrelated to identity |
| `Frontend/src/components/**` | UI; auth UI is later phases and gets new files |
| Canvas, drawing, export, theme, shortcuts | Entirely unrelated |
| Both `operationTypes.js` copies | Only with a deliberate contract change, in both, with the contract test run |
| `voiceGateway.js` | Only in Phase 5, and only after Phase 0b covers it |

**Uncommitted work is present in the tree** (operation contract, renderers,
`styleUtils`, `textMetrics` and related tests). It is unrelated to Step 1.
Do not fold it into an auth chunk, and do not revert it.
