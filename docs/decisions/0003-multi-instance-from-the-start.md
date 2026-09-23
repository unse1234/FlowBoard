# 0003 — Design for multiple instances from the first commit

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

FlowBoard runs as exactly one stateful process today. Board state, the AI rate
limiter's windows and the voice socket registry all live in process memory
(`operationStore.js`, `ai/rateLimiter.js`, `voiceGateway.js`), so a second
instance would serve different state for the same room.

The stated target is millions of users. Socket.IO needs persistent connections,
so the backend must be long-running processes behind a load balancer — it cannot
run on request-scoped serverless.

The question was whether to build single-instance now and retrofit, or to build
multi-instance from the start.

## Decision

**Every new subsystem is written to run on N instances from the first commit.**

Concretely, for anything added from now on:

1. **No shared state in process memory.** State that more than one request or
   socket depends on lives in Postgres or Redis.
2. **Authentication is stateless.** Access tokens verify by signature, so any
   instance can serve any request (ADR 0002).
3. **Rate limiting is shared.** Auth rate limits and lockout counters go to
   Redis, not a `Map`. The existing in-memory AI limiter (finding F-14) is
   grandfathered and migrated when §14 is next touched.
4. **Migrations run under an advisory lock**, so several instances booting
   together cannot race.
5. **Graceful shutdown** drains connections and closes the pool, so a rolling
   deploy does not cut sessions mid-write.
6. **Health and readiness are separate.** Liveness says the process is up;
   readiness says it can serve, which means its dependencies answer.

Existing single-instance subsystems are **not** rewritten as part of Step 1.
The realtime operation store is addressed in Step 2, where it is the subject
rather than a side effect.

## Alternatives considered

**Single instance now, scale later.** Cheaper today. Rejected because the
retrofit cost lands exactly on the auth and session code, which is the code
that must be most trustworthy, and because the seams cost almost nothing to
build correctly the first time.

## Consequences

**Makes easy**

- Adding instances becomes configuration rather than a rewrite.
- Rolling deploys without dropping sessions.
- Redis is introduced deliberately, for rate limiting first, rather than in an
  emergency.

**Makes harder**

- Redis becomes a dependency earlier than strictly necessary, and readiness must
  account for it.
- Every new piece of state needs a conscious "where does this live" answer.

**Commits the project to**

- Rule 35 of `ENGINEERING_RULES.md` being enforced, not aspirational: a new
  in-process `Map` holding shared state is a defect.
