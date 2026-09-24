# Current Task

**The execution pointer. One active item. Update it at the end of every chunk.**

---

## Current task

Step 1 · Phase 1 — password identity.

## Status

**Phase 1 complete except its email half** — 2026-09-24.

Signup and login both work end to end against PostgreSQL 18.6. Backend
suite: **201 passing, 0 skipped.**

An account can be created and its credentials checked. Login issues **no
token** — that is Phase 2 — so nothing keeps anyone signed in yet. The
email that E-12 depends on needs Phase 4.

## What was built

| Chunk | Delivers | Files |
| --- | --- | --- |
| 0.1 | Pooled connection, timeouts, transaction helper, slow-query reporting, readiness probe, graceful shutdown | `Backend/src/db/createDatabase.js`, `Backend/src/server.js`, `Backend/src/config/serverConfig.js` |
| 0.2 | Forward-only migration runner with advisory lock, checksum drift detection, per-migration transactions, `npm run migrate` | `Backend/src/db/migrate.js` |
| 0.3 | `users` table: UUID ids, soft delete, `token_version`, case-insensitive unique email | `Backend/migrations/0001_create_users.sql` |
| 0.4 | Schema integration suite, skipped unless `TEST_DATABASE_URL` is set | `Backend/src/db/schema.integration.test.js` |
| 1.1 | Argon2id hashing: PHC-stored parameters, `needsRehash` for transparent cost upgrades, input cap, non-throwing verification, timing-equalised unknown-user path | `Backend/src/auth/passwordHasher.js` |
| 1.2 | Email validation and normalisation: NFC then lowercase, byte-counted RFC limits, rejects header injection and invisible characters, and an integration test proving the app and PostgreSQL agree on `lower()` | `Backend/src/auth/emailAddress.js` |
| 1.3 | Auth error envelope mirroring `aiErrors.js`; `toResponseBody` makes leaking `detail` impossible; tests police the enumeration rule rather than commenting it | `Backend/src/auth/authErrors.js` |
| 1.4 | `POST /api/auth/signup` — uniform response whether or not the address is taken (E-12), always hashes before inserting, `ON CONFLICT DO NOTHING` so a race cannot leak, per-IP rate limit | `Backend/src/auth/authRouter.js`, `signupRequest.js`, `userRepository.js` |
| 1.5 | `POST /api/auth/login` — one answer for an unknown address, a wrong password and a no-password account, each doing equal work; account status checked only after the password verifies; stale hashes upgraded transparently | `Backend/src/auth/authRouter.js`, `loginRequest.js` |

## Tests

| Suite | Result |
| --- | --- |
| Backend | **201 pass, 0 fail, 0 skipped** |
| Frontend | 194 pass, 0 fail |
| Frontend lint | Clean |

Backend tests grew from 47 to 201. The hashing tests run at deliberately cheap
Argon2 parameters so the suite stays fast, with two tests pinning the real
shipped defaults against OWASP's baseline.

**The backend suite now requires a database**, and runs with
`--test-concurrency=1`. Several files reset the schema of one shared database,
so running files in parallel makes them drop it under each other — which
appeared as a handful of failures that moved between runs. Do not remove the
flag without first giving each file its own schema or database.

Database-backed tests skip without `TEST_DATABASE_URL`, so check the skip
count: a green run with skips is not a full run.

## Local database

PostgreSQL 18.6, using a least-privilege `flowboard` role rather than the
`postgres` superuser, so the application connection string holds no superuser
credentials. `Backend/.env` carries `DATABASE_URL` and `TEST_DATABASE_URL` and
is gitignored. To recreate, as superuser:

```sql
CREATE ROLE flowboard LOGIN PASSWORD 'flowboard';
CREATE DATABASE flowboard OWNER flowboard;
CREATE DATABASE flowboard_test OWNER flowboard;
```

Then `cd Backend && npm run migrate`. The integration suite reads `.env`, so
`npm test` runs it with no extra environment variables.

**Windows note:** Git Bash `kill -TERM` does not reliably terminate a Windows
node process — a killed-looking server can still hold its port and answer
requests with stale config. Use `taskkill //PID <pid> //F`, and check
`netstat -ano | grep :<port>` before trusting a smoke test.

## Next task

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

## Before starting the next chunk

1. Read `CLAUDE.md`, then `AUTH/AUTH_STATUS.md`.
2. Check `AUDIT_FINDINGS.md` for anything touching the files you will modify.
3. Confirm the "Do not touch" list in `AUTH_STATUS.md`.
4. **Uncommitted pre-audit work is in the tree** (operation contract, renderers,
   `styleUtils`, `textMetrics` and related tests). It is unrelated to Step 1 —
   do not fold it into your chunk, and do not revert it.
