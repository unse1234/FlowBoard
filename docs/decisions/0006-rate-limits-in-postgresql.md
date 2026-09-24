# 0006 — Auth rate limits are counted in PostgreSQL

- **Status:** Accepted
- **Date:** 2026-09-25
- **Resolves:** `AUTH_DECISIONS.md` E-17, chosen by the project owner
- **Supersedes:** the "Redis-backed rate limiting" line of ADR 0003, for auth
  only. The rest of ADR 0003 stands.

## Context

ADR 0003 commits FlowBoard to running on N instances. An in-memory rate limit
across N instances is N times the configured limit, and a restart resets it.
Sign-in's limit guards an Argon2 hash per attempt (finding F-16) and slows
password guessing, so a limit that silently multiplies is a real weakness.

ADR 0003 named Redis for shared counters. On 2026-09-25 production had no
Redis, and no database either. Neon PostgreSQL was chosen for accounts (E-16).

## Decision

Rate-limit counters for `/api/auth` live in a PostgreSQL table,
`rate_limit_counters` (migration 0003), behind `createPostgresRateLimiter` in
`Backend/src/http/rateLimiter.js`:

- **A fixed window per bucket**, incremented by one atomic
  `INSERT … ON CONFLICT DO UPDATE`, so concurrent requests on any number of
  instances cannot overshoot. A test fires 30 at once across two limiters with
  a limit of 5 and gets exactly 5.
- **Windows aligned on the database clock**, so instances agree on boundaries.
- **Keys stored as SHA-256**, so the table never holds an address or an email.
- **Swept as it goes**: every 500th request per process deletes up to 1,000
  expired rows, so the table stays bounded without a scheduled job. A failed
  sweep never fails a request.

The limiter's interface is one async `consume(key)`. A Redis implementation
can replace it without the routes noticing.

## Alternatives considered

**Redis (ADR 0003 as written).** Faster, with native expiry. But it is a second
managed service to provision, pay for, secure and monitor, for traffic
measured in sign-ins per minute. It will earn its place when realtime traffic
needs shared state: Socket.IO fan-out across instances, and per-event limits.

**Keep the in-memory limiter.** Correct only on one instance, and reset by
every deploy. Rejected: it is the weakness this phase exists to remove.

**A sliding window or token bucket in SQL.** Smoother at window boundaries,
where a fixed window allows up to twice the limit in a burst. At a handful of
attempts a minute that burst costs nothing, and the SQL would be harder to
reason about.

## Consequences

- Each limited request costs one small write. At auth volumes that is noise.
  It would not be at realtime volumes, which is where Redis comes back in.
- The limiter depends on the database. Every route it guards already does, so
  an outage fails those requests the same way either way.
- The AI endpoint keeps its in-memory limiter for now. `Backend/src/ai/` is
  outside Step 1's scope, and finding F-14 tracks it.
