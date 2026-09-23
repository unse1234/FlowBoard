# 0001 — PostgreSQL with node-postgres and SQL migrations

- **Status:** Accepted
- **Date:** 2026-09-23
- **Resolves:** `AUTH_DECISIONS.md` D-1

## Context

The audit of 2026-09-23 found FlowBoard has no database of any kind: no driver,
no ORM, no schema, no migrations, no connection code. Board state lives in
browser `localStorage` and an in-memory `Map` on the server
(`Backend/src/operations/operationStore.js`), which is lost on restart.

Step 1 (Identity & Accounts) cannot begin without storage, so this decision
blocked the entire production programme.

Constraints the choice had to satisfy:

- The entities in `flowboard-production-checklist.md` are relational: users,
  organisations, memberships, boards, permissions, invitations, sessions,
  version history, seat counting.
- Authorisation correctness depends on constraints the database can enforce —
  foreign keys, unique memberships, cascade rules. Application-enforced
  integrity is a liability in an auth system.
- Migration tooling is required, because §24 demands migrations that tolerate
  rolling deploys.
- Connection pooling is required (§24).
- The backend is plain CommonJS with **no build step**. Anything requiring code
  generation or a compile pass would change the project's toolchain as a side
  effect of adding auth.
- The target is "millions of users", so indexing, read replicas and query
  control matter more than ergonomics.

## Decision

**PostgreSQL**, accessed through **`pg` (node-postgres)**, with **plain SQL
migrations** run by a small in-repo runner.

## Alternatives considered

**MySQL/MariaDB** — proven at scale, but a weaker JSON and full-text story.
Board documents (§8, §13) and board content search (§16) both benefit from
JSONB and native full-text search, and Postgres offers partial and expression
indexes that this schema uses immediately (see the `users` email index).

**MongoDB** — board documents fit naturally, but memberships, roles, seat limits
and permission inheritance would become application-enforced. For the subsystem
whose entire job is deciding who may do what, that is the wrong trade.

**Prisma** — the best migration and ergonomics story, rejected because it adds a
`generate` step to a backend that has none, and because its connection handling
needs care behind a pooler at scale.

**Kysely / Drizzle** — both are good, and both derive most of their value from
TypeScript type inference. This codebase is plain JavaScript (ADR-forced by
`AUTH_DECISIONS.md` E-3), so that value would not be realised while the
dependency cost would be.

## Consequences

**Makes easy**

- Real SQL for the auth and permission queries, where the exact plan matters.
- Database-enforced integrity from day one.
- Partial, expression and composite indexes without fighting an abstraction.
- Read replicas later (§24) with no application rewrite.
- Keeps the backend dependency count low, consistent with
  `ENGINEERING_RULES.md` rule 50.

**Makes harder**

- Queries are written by hand, so every one must be parameterised. Rule 17 in
  `ENGINEERING_RULES.md` is now load-bearing, not advisory.
- No generated types. JSDoc carries the shape of a row.
- The migration runner is ours to maintain. It is deliberately small.

**Commits the project to**

- Postgres-specific SQL. Portability is explicitly not a goal.
- One pool per process, created at startup and drained on shutdown.
- Forward-only migrations, applied under an advisory lock so that several
  instances starting at once cannot race.
