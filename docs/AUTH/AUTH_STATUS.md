# Step 1 — Identity & Accounts · STATUS

**The operational file. Read this first for Step 1. Update it every chunk.**

Last updated: 2026-09-24 (Phase 1 complete except its email half)

---

## Current position

| | |
| --- | --- |
| **Step** | 1 — Identity & Accounts |
| **Phase** | 1 — Password identity. **All five chunks done** |
| **Task** | None active — pick from Next recommended task |
| **Blocker** | None. Phase 4 (email) is needed to finish E-12 |

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

## In progress

Nothing. Phase 1's five chunks are complete.

**An account can be created and its credentials checked, but nothing keeps
anyone signed in** — login issues no token, which is Phase 2.

## Not started

| Phase | Contents | Blocked by |
| --- | --- | --- |
| 0b | Realtime gateway tests | — (unblocked) |
| 0c | CI pipeline; security headers; Redis | — (unblocked) |
| 1 | Complete, except the email half of E-12 (needs Phase 4) | — |
| 2 | Access + refresh tokens, rotation, revocation, CSRF | Phase 1 |
| 3 | Session listing and revocation | Phase 2 |
| 4 | Email delivery, verification, password reset | Phase 1, D-4, D-5 |
| 5 | Socket authentication and per-board authorisation | Phase 2, Phase 0b, D-6 |
| 6 | Account settings, deletion, export, soft delete | Phase 1, D-7 |
| 7 | Auth rate limiting, lockout, bot protection | Phase 1, D-8 |
| 8 | OAuth (Google, GitHub, Microsoft) | Phase 2, D-9 |
| 9 | TOTP + recovery codes | Phase 2 |
| 10 | SSO / SAML | Phase 8 — deferred |

---

## What exists today instead of identity

An **ephemeral, client-asserted display identity**. No server ever verifies it.

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

**The `users` table exists and is verified** (`Backend/migrations/0001_create_users.sql`),
but **nothing writes to it yet** — there is no signup, and no code path creates
a user. At runtime a "user" is still only fields on in-flight socket messages.

Columns that later phases depend on: `token_version` (Phase 2 revocation),
`email_verified_at` (Phase 4), `password_hash`, nullable for OAuth-only
accounts (Phase 8), and `deleted_at` + `status` for soft delete (Phase 6).

## Token model

**None.** No access tokens, no refresh tokens, no storage, no expiry, no
rotation, no revocation. No `jsonwebtoken` or equivalent dependency.

## Session model

**None.** "Session" in this codebase means either a Socket.IO connection or the
browser's `sessionStorage` — never an authenticated session. Nothing is
listable, nothing is revocable.

## Email workflows

**None.** No mailer dependency, no templates, no verification or reset tokens,
no outbound email of any kind.

## Security controls relevant to Step 1

| Control | State | Evidence |
| --- | --- | --- |
| Password hashing | **Argon2id, OWASP baseline** | `Backend/src/auth/passwordHasher.js`, ADR 0004 |
| Auth rate limiting | **Present, interim** — per-process, 5/min per client | `config.auth.rateLimitPerMinute`; Phase 7 replaces it |
| Auth rate limiting | N/A — no auth endpoints | — |
| AI rate limiting | Present, per-IP, in-memory | `Backend/src/ai/rateLimiter.js` |
| CSRF | No surface **yet** — no cookies anywhere | Search: no cookie use |
| Secure cookie flags | N/A — no cookies | — |
| CORS | Configured, origins normalised, tested | `serverConfig.js:49-52` |
| Security headers / CSP | **Absent** | Finding F-6 |
| Socket authN / authZ | **Absent** | Findings F-1, F-2, F-7 |
| Secrets handling | Sound | `.env` gitignored, `.env.example` committed |

**CSRF becomes live the moment Phase 2 introduces cookies.** It is listed as
"no surface" today only because there is no ambient authority to ride.

## Test coverage for Step 1

| Suite | Result |
| --- | --- |
| Backend | **201 pass, 0 fail, 0 skipped** |
| Frontend | 194 pass |

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

---

## Next recommended task

Phase 1's five chunks are done, so the next move is a choice rather than one
obvious step. In recommended order:

1. **Phase 7 rate limiting**, with Redis from Phase 0c.3. F-16 and F-17 are both
   reachable now, and the limiter is per-process, so across N instances the real
   limit is N times what is configured. This is the one part of Step 1 where the
   current state is a weakness rather than simply an absence.
2. **Phase 2 — tokens and sessions.** The obvious continuation: login proves who
   someone is, but nothing keeps them signed in. `users.token_version` already
   exists, so stateless revocation needs no migration. Cookies arrive here, so
   CSRF protection lands in the same phase.
3. **Phase 0b — realtime gateway tests.** Still unblocked, still a hard
   prerequisite for Phase 5.
4. **Phase 4 — email.** Needs D-4. Phase 1 is not truly finished without it,
   because E-12 leaves a returning user with no explanation until it exists.

**Phase 0c.1 (CI)** stays cheap and valuable: 395 tests across both suites are
currently enforced by nothing.

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
