# Current Task

**The execution pointer. One active item. Update it at the end of every chunk.**

---

## Current task

Step 1 · Phase 0 — database foundation.

## Status

**Phase 0 complete and verified** — 2026-09-23.

The schema has been applied to PostgreSQL 18.6 and all 11 schema integration
tests pass. The migration needed no changes. Backend suite: **97 passing, 0
skipped.**

## What was built

| Chunk | Delivers | Files |
| --- | --- | --- |
| 0.1 | Pooled connection, timeouts, transaction helper, slow-query reporting, readiness probe, graceful shutdown | `Backend/src/db/createDatabase.js`, `Backend/src/server.js`, `Backend/src/config/serverConfig.js` |
| 0.2 | Forward-only migration runner with advisory lock, checksum drift detection, per-migration transactions, `npm run migrate` | `Backend/src/db/migrate.js` |
| 0.3 | `users` table: UUID ids, soft delete, `token_version`, case-insensitive unique email | `Backend/migrations/0001_create_users.sql` |
| 0.4 | Schema integration suite, skipped unless `TEST_DATABASE_URL` is set | `Backend/src/db/schema.integration.test.js` |

## Tests

| Suite | Result |
| --- | --- |
| Backend | **97 pass, 0 fail, 0 skipped** |
| Frontend | 194 pass, 0 fail |
| Frontend lint | Clean |

Backend tests grew from 47 to 97 during Phase 0.

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

**Chunk 1.1 — password hashing.**
Blocked only on decision **D-2** (Argon2id vs bcrypt, and cost parameters) in
`AUTH/AUTH_DECISIONS.md`. The schema is verified, so nothing else stands in the
way.

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
