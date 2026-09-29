# Current Task

**The execution pointer. One active item. Update it at the end of every chunk.**

---

## Current task

**Step 2 — Durable boards** (`PRODUCTION_PLAN.md` §3: G-4, G-6). Started
2026-09-29.

**First chunk: the Step 2 plan.** Read-only investigation, then a written plan.
No code changes in this chunk.

## Status

**Step 1 is complete in code and paused at rollout** (owner, 2026-09-29).
Accounts, sessions, email, boards with roles, authorised realtime, account
settings and deletion, and provider sign-in are built and tested. None of it
runs in production, which has no database. What is left to close Step 1 —
merge, Neon, Resend on a domain, providers, a browser pass, the CSP — is
listed in **`AUTH/AUTH_REMAINING.md`**. The chunk-by-chunk record is in
`AUTH/AUTH_STATUS.md`.

## What Step 2 has to fix

| Finding | Problem |
| --- | --- |
| F-3 | CRITICAL — board content lives only in `operationStore.js`, an in-memory `Map`. Every restart loses every shared board |
| F-5 | HIGH — the operation log never shrinks, and a joiner is sent every operation ever made |
| F-4 | HIGH — undo restores a local snapshot and publishes nothing, so it silently diverges peers; the contract comments claim otherwise |
| F-11 | MEDIUM — the local cache and the server replay can both seed a room |

Step 2 ends when a shared board survives a restart, a joiner receives a
snapshot and a short tail rather than the whole history, and undo has one
model that the code and comments agree on.

## The first chunk: write the Step 2 plan

1. Read `operationStore.js`, `boardGateway.js`, `Backend/migrations/0008_create_boards.sql`,
   ADR 0008, and the frontend's `localStorage` persistence and `useHistory.js`.
2. Record what exists: how operations are shaped, applied, stored and replayed,
   where a board's state is computed, and what `boards` already holds.
3. Write `docs/BOARDS/BOARDS_PLAN.md` (phases and chunks) and
   `docs/BOARDS/BOARDS_STATUS.md`, following the shape of the `AUTH/` files.
4. Raise the decisions that are the owner's, notably the undo model (F-4), in a
   `docs/BOARDS/BOARDS_DECISIONS.md`.

**Where it builds:** `boards` and board membership exist only on
`feat/accounts-collaboration`, which is not merged (`AUTH/AUTH_REMAINING.md`
§1). Step 2 builds on that branch, or on `main` once it is merged.

## Tests

| Suite | Result |
| --- | --- |
| Backend | **611 pass, 0 fail, 0 skipped** |
| Frontend | **328 pass, 0 fail** |
| Frontend lint | Clean |

**The backend suite requires a database**, and runs with
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

## Before starting the next chunk

1. Read `CLAUDE.md`, then `PRODUCTION_PLAN.md` §2 (G-4, G-6) and §3.
2. Check `AUDIT_FINDINGS.md` for anything touching the files you will modify.
3. Step 1's code is finished: change it only where Step 2 genuinely needs to,
   and keep its tests passing.
