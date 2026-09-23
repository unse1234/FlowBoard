# Step 1 — Identity & Accounts · STATUS

**The operational file. Read this first for Step 1. Update it every chunk.**

Last updated: 2026-09-23 (Phase 0 complete and verified)

---

## Current position

| | |
| --- | --- |
| **Step** | 1 — Identity & Accounts |
| **Phase** | 0 — Foundation. **Complete and verified** |
| **Task** | Chunk 1.1 — password hashing |
| **Blocker** | D-2: hashing algorithm not chosen |

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

## In progress

Nothing. Phase 0 is done; Phase 1 is next.

## Not started

| Phase | Contents | Blocked by |
| --- | --- | --- |
| 0b | Realtime gateway tests | — (unblocked) |
| 0c | CI pipeline; security headers; Redis | — (unblocked) |
| 1 | Password hashing, signup, login, HTTP auth surface | D-2 |
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
| Password hashing | Column ready, no hashing yet | `users.password_hash`; no hashing dependency |
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
| Backend | **97 pass, 0 fail, 0 skipped** |
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
| D-2 | Hashing algorithm not chosen | **Blocks Phase 1** |
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

---

## Next recommended task

**Chunk 1.1 — password hashing**, once **D-2** is resolved (Argon2id vs bcrypt,
and cost parameters). Nothing else blocks Phase 1: the schema is verified and
`users.password_hash` is waiting.

Bounded as: a hashing module with explicit parameters, a verify function,
and tests covering round-trip, wrong-password rejection, and that a hash is
never logged. No routes yet.

Unblocked in parallel, needing no decision: **Phase 0b** (gateway tests,
required before Phase 5), **0c.1** (CI), **0c.2** (security headers).

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
