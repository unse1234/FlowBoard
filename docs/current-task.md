# Current Task

**The execution pointer. One active item. Update it at the end of every chunk.**

---

## Current task

**Step 2 — Durable boards** (`PRODUCTION_PLAN.md` §3: G-4, G-6). Started
2026-09-29.

**Plan written** (2026-09-29): `BOARDS/BOARDS_PLAN.md`, `BOARDS/BOARDS_DECISIONS.md`,
`BOARDS/BOARDS_STATUS.md`. **Next chunk: 0.1, size limits in the operation
contract.** It needs no decision.

**Waiting on the owner:** D-11 (undo), D-12 (images), D-13 (how much history
to keep), each with a recommendation in `BOARDS/BOARDS_DECISIONS.md`.

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
| F-27 | HIGH — an operation over the 1 MB message cap loops the sender's connection (found while planning) |
| F-9 | MEDIUM — operation size and shape are unbounded |

Step 2 ends when a shared board survives a restart, a joiner receives a
snapshot and a short tail rather than the whole history, and undo has one
model that the code and comments agree on. Full exit list:
`BOARDS/BOARDS_PLAN.md` §C.

## Order (`BOARDS/BOARDS_PLAN.md` §B)

| Phase | Delivers | Closes |
| --- | --- | --- |
| 0 | Size limits, no retry loops, images within bounds | F-27, F-9 for what is stored |
| 1 | Durable operation log, sequence numbers from the database | F-3 |
| 2 | Snapshots folded on the server, snapshot + tail on join, compaction | F-5 |
| 3 | The web app takes the server's copy; unsent edits survive a reload | F-11 |
| 4 | Undo your own changes, as ordinary edits | F-4 |
| 5 | End-to-end restart proof, measurements, ADR 0010 | — |

## Next chunk: 0.1 — size limits in the operation contract

Both validators (backend and frontend copies) check quantity and magnitude,
not just structure: serialised size per operation, entries per batch, string
length per field, shape count and bytes per board. Set the numbers from
measured real boards (rule 42), under the 1 MB message cap. Refuse with a
reason in the socket envelope. Change both copies together and run the
frontend suite, which holds the contract test.

**Where it builds:** `boards` and board membership exist only on
`feat/accounts-collaboration`, which is not merged (`AUTH/AUTH_REMAINING.md`
§1). Step 2's code goes on a branch from it (`feat/durable-boards`), or on
`main` once it is merged.

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

1. Read `CLAUDE.md`, then `BOARDS/BOARDS_STATUS.md` and the chunk's row in
   `BOARDS/BOARDS_PLAN.md`.
2. Check `AUDIT_FINDINGS.md` for anything touching the files you will modify.
3. Step 1's code is finished: change it only where Step 2 genuinely needs to,
   and keep its tests passing.
