# Current Task

**The execution pointer. One active item. Update it at the end of every chunk.**

---

## Current task

Step 1 · Phase 1 — password identity.

## Status

**Phase 0 complete. Chunks 1.1, 1.2 and 1.3 complete** — 2026-09-23.

Hashing, email handling and the auth error envelope are in place. Backend
suite: **161 passing, 0 skipped.**

Nothing authenticates yet — these are the primitives, not a signup or login.

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

## Tests

| Suite | Result |
| --- | --- |
| Backend | **161 pass, 0 fail, 0 skipped** |
| Frontend | 194 pass, 0 fail |
| Frontend lint | Clean |

Backend tests grew from 47 to 161. The hashing tests run at deliberately cheap
Argon2 parameters so the suite stays fast, with two tests pinning the real
shipped defaults against OWASP's baseline.

**The backend suite now requires a database** — 14 of these tests are schema
integration tests. They skip without `TEST_DATABASE_URL`, so check the skip
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

**Chunk 1.4 — `POST /api/auth/signup`.**

**Blocked on decision D-10** in `AUTH/AUTH_DECISIONS.md`: may signup say that an
address is already registered? Answering reveals who has an account; not
answering leaves a returning user with no feedback until Phase 4 can send the
email that would explain it. It is a product trade-off, so it needs the project
owner rather than a default.

Everything else for 1.4 is ready: the schema, the hasher, the email parser and
the error envelope.

Then 1.5 (login). Login is where F-16 becomes reachable, so Phase 7 rate
limiting should not drift far behind it.

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
