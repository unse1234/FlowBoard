# Current Task

**The execution pointer. One active item. Update it at the end of every chunk.**

---

## Current task

Step 1 · Phase 1 — password identity.

## Status

**Phase 0 complete. Chunks 1.1–1.4 complete** — 2026-09-23.

`POST /api/auth/signup` works end to end against PostgreSQL 18.6. Backend
suite: **184 passing, 0 skipped.**

An account can now be created. Nothing can sign **in** yet — that is 1.5.

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

## Tests

| Suite | Result |
| --- | --- |
| Backend | **184 pass, 0 fail, 0 skipped** |
| Frontend | 194 pass, 0 fail |
| Frontend lint | Clean |

Backend tests grew from 47 to 184. The hashing tests run at deliberately cheap
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

**Chunk 1.5 — `POST /api/auth/login`.** Nothing blocks it.

Bounded as: look the account up by normalised email, verify the password, and
answer `INVALID_CREDENTIALS` for an unknown address, a wrong password and an
account with no password alike — using `burnVerificationWork` so an unknown
address costs the same as a wrong one. Rehash transparently when
`needsRehash` reports the stored hash used weaker parameters, via
`upgradePasswordHash`, which is already written and tested.

Login issues no token yet; that is Phase 2. It reports success or failure only.

F-16 and F-17 are both reachable from signup already, so **Phase 7 rate
limiting should not drift much further behind**. The interim per-process
limiter is in place but is not shared across instances.

Unblocked work that can run in any order, and does not need a database:

1. **Phase 0b** — tests for `boardGateway`, `voiceGateway`, `OperationStore`
   (closes F-10; required before Phase 5 touches that code).
2. **Phase 0c.1** — CI running lint and both suites.
3. **Phase 0c.2** — security headers (closes F-6).

## Before starting the next chunk

1. Read `CLAUDE.md`, then `AUTH/AUTH_STATUS.md`.
2. Check `AUDIT_FINDINGS.md` for anything touching the files you will modify.
3. Confirm the "Do not touch" list in `AUTH_STATUS.md`.
4. **Uncommitted pre-audit work is in the tree** (operation contract, renderers,
   `styleUtils`, `textMetrics` and related tests). It is unrelated to Step 1 —
   do not fold it into your chunk, and do not revert it.
