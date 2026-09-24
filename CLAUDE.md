# CLAUDE.md — FlowBoard

## What FlowBoard is

A collaborative whiteboard: infinite canvas, drawing and diagramming tools,
real-time multi-user editing over Socket.IO, WebRTC voice chat, and AI
natural-language → diagram generation via Gemini.

It is a final-year project being taken toward production readiness. The scope
target is `flowboard-production-checklist.md` at the repository root.

## Current production objective

Move FlowBoard from "working demo" to "real product", in small controlled steps,
following `docs/PRODUCTION_PLAN.md`.

## Current active step

**Step 1 — Identity & Accounts.**

FlowBoard today has **no authentication, no user accounts, and no database**.
This is verified, not assumed — see `docs/AUTH/AUTH_STATUS.md`.

Step 1 is currently **blocked on one decision**: which datastore to adopt.
See `docs/AUTH/AUTH_DECISIONS.md` (D-1).

## Where things are written down

| File | What it holds | Update when |
| --- | --- | --- |
| `docs/current-task.md` | The single active work item | Every chunk |
| `docs/AUTH/AUTH_STATUS.md` | Step 1 live state | Every Step 1 chunk |
| `docs/PROJECT_CONTEXT.md` | Verified current state of the whole project | Architecture changes |
| `docs/ARCHITECTURE.md` | How the systems actually fit together | Architecture changes |
| `docs/AUDIT_FINDINGS.md` | Defects and risks in what already exists | A finding is fixed or found |
| `docs/PRODUCTION_PLAN.md` | Checklist → gap matrix → roadmap | A checklist item changes status |
| `docs/AUTH/AUTH_PLAN.md` | Step 1 phase-by-phase plan | Step 1 plan changes |
| `docs/AUTH/AUTH_DECISIONS.md` | Step 1 decisions, incl. unresolved ones | A decision is made |
| `docs/ENGINEERING_RULES.md` | Project-wide rules for writing code here | Rarely |
| `docs/decisions/` | Architecture decision records | A significant decision is made |

Read `docs/current-task.md` first. It points at everything else you need.

## How to behave when implementing

1. **Read the relevant context files first** — `docs/current-task.md`, then the
   status/plan files it points to.
2. **Inspect the actual implementation before changing it.** The docs describe
   the repository as of the audit; the code is the truth. Verify before relying.
3. **Never assume undocumented behaviour.** If something is not in the docs and
   not in the code, it does not exist. A route, filename or dependency is not
   evidence that a feature works.
4. **Work in small chunks.** One bounded change at a time, with its tests.
   Do not start the next chunk in the same pass.
5. **Avoid unrelated changes.** No opportunistic refactors, renames, dependency
   bumps or "improvements" to code you happened to read. If you find a problem
   outside your chunk, record it in `docs/AUDIT_FINDINGS.md` and move on.
6. **Test every implementation.** Backend: `cd Backend && npm test`.
   Frontend: `cd Frontend && npm run test:realtime` and `npm run lint`.
   Both suites must pass before a chunk is done.
7. **Update the status docs after meaningful changes** — at minimum
   `docs/current-task.md` and, during Step 1, `docs/AUTH/AUTH_STATUS.md`.

## Rules that bite here

- **The operation contract is duplicated.** `Backend/src/operations/operationTypes.js`
  and `Frontend/src/features/realtime/operations/operationTypes.js` are separate
  copies with no build step between them, and the same is true of the validators.
  Change both together. `Frontend/src/features/realtime/operations/operationContract.test.js`
  cross-imports the backend copy and fails on drift — but it only runs in the
  **frontend** suite, so run that one after touching either side.
- **Never put a secret in frontend code.** Anything prefixed `VITE_` is bundled
  into the browser. `GEMINI_API_KEY` lives only in `Backend/.env`.
- **The AI layer is the quality bar.** `Backend/src/ai/` shows the intended
  pattern for new server code: explicit validation, a typed error envelope,
  user-safe messages, diagnostics logged and never returned. Follow it.
- Full rules: `docs/ENGINEERING_RULES.md`.

## Commands

```bash
cd Backend  && npm install && npm run dev   # realtime + AI server, port 3001
cd Frontend && npm install && npm run dev   # Vite dev server, port 5173

cd Backend  && npm run migrate              # apply pending SQL migrations
cd Backend  && npm test                     # 448 tests (needs a database)
cd Frontend && npm run test:realtime        # 276 tests (node:test)
cd Frontend && npm run lint                 # ESLint (frontend only)
```

**The backend suite needs PostgreSQL 13+.** The schema integration tests read
`DATABASE_URL`/`TEST_DATABASE_URL` from `Backend/.env`, and **skip** if neither
is set — so a green run with skips is not a full run. Check the skip count.

Local setup, as superuser:

```sql
CREATE ROLE flowboard LOGIN PASSWORD 'flowboard';
CREATE DATABASE flowboard OWNER flowboard;
CREATE DATABASE flowboard_test OWNER flowboard;
```

Endpoints: `GET /health` is liveness (checks nothing, by design), `GET /ready`
is readiness (checks the database, answers 503 when it cannot).

Every API response carries security headers
(`Backend/src/http/securityHeaders.js`), set before the routes so error
responses keep them. **The web app is served elsewhere and still has none** —
see finding F-6.

**Windows:** Git Bash `kill -TERM` does not reliably terminate a Windows node
process — a killed-looking server can keep its port and answer with stale
config. Use `taskkill //PID <pid> //F` and verify with `netstat -ano`.

CI runs both suites, lint and the frontend build on every push and pull request
(`.github/workflows/ci.yml`). It asserts a **minimum test count**, because an
unquoted glob once collected 13 of 194 frontend tests and still exited zero
(finding F-18). Raise the minimum when you add tests.

There is no type checker, no backend linter, and no E2E suite.
