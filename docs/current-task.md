# Current Task

**The execution pointer. One active item. Update it at the end of every chunk.**

---

## Current task

Step 1 · Phase 0 — database foundation.

## Status

**Chunks 0.1, 0.2 and 0.3 complete** — 2026-09-23.
Chunk 0.4 (test harness) landed alongside them as a skipped-by-default suite.

**One thing is not yet proven: the migration SQL has never been executed.**
No PostgreSQL server, Docker or `psql` is available on this machine, so
`Backend/migrations/0001_create_users.sql` is written and reviewed but unrun.
See "Before the next chunk" below.

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
| Backend | 97 tests — 86 pass, 0 fail, **11 skipped** (they need `TEST_DATABASE_URL`) |
| Frontend | 194 pass, 0 fail |
| Frontend lint | Clean |

Backend tests grew from 47 to 97. The 11 skips are the schema integration tests
and are the reason the SQL is unverified.

## Before the next chunk

**Run the schema integration suite against a real PostgreSQL 13+ database.**
This is the highest-value next action and needs a database, not more code.

```bash
# any throwaway database — local, Docker, or a free managed instance
cd Backend
DATABASE_URL=postgres://user:pass@host:5432/flowboard npm run migrate
TEST_DATABASE_URL=postgres://user:pass@host:5432/flowboard_test npm test
```

The 11 skipped tests then run and check: migrations apply from empty, they are
idempotent, one live account per address, a deleted address frees up, login uses
the partial index, and every CHECK constraint bites. If any fail, fix
`0001_create_users.sql` — it has not been applied anywhere, so it can still be
edited rather than superseded.

## Next task

**Chunk 1.1 — password hashing**, once the schema is verified.
Blocked on decision **D-2** (Argon2id vs bcrypt, and cost parameters) in
`AUTH/AUTH_DECISIONS.md`.

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
