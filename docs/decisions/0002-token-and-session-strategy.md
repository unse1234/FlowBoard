# 0002 — Short JWT access tokens with rotating opaque refresh tokens

- **Status:** Accepted
- **Date:** 2026-09-23
- **Resolves:** `AUTH_DECISIONS.md` D-3

## Context

FlowBoard has no tokens, no sessions and no authentication today. `userId` is a
`user_<uuid>` generated fresh in the browser on every page load and is never
verified by the server (audit findings F-1, F-2).

`flowboard-production-checklist.md` §1 asks for "JWT access tokens with refresh
token rotation" and "session management — list active sessions, revoke
individually". Those two requirements pull in opposite directions: JWTs are not
revocable, and revocable sessions need server lookup.

The scale target is millions of users, so adding a database round trip to every
authenticated request and every socket handshake is a real cost.

## Decision

A **two-token** scheme.

**Access token** — a JWT, short-lived (~15 minutes), verified locally by
signature with no datastore lookup. Carries the user id and token version.
Sent as a bearer credential on API requests and in the Socket.IO handshake.

**Refresh token** — opaque, high-entropy, **stored only as a hash**, delivered
in an `HttpOnly` + `Secure` + `SameSite` cookie. Rotated on every use: the
presented token is revoked as the replacement is issued.

**Reuse detection** — refresh tokens belong to a family. Presenting an
already-revoked token means the token was stolen and replayed, so the entire
family is revoked and every session descended from that login ends.

**CSRF protection ships in the same phase as the cookie**, not later. Introducing
a cookie creates ambient authority and therefore a CSRF surface that does not
exist today.

## Alternatives considered

**Opaque tokens for both** — instantly revocable and simple to reason about, but
every API call and every socket handshake becomes a datastore lookup. At the
stated scale that is the hottest path in the system.

**JWT for both** — no server state at all, and fast, but refresh tokens could
not be revoked before expiry. "Revoke this session" would be a lie, and a leaked
token could not be contained. Rejected outright.

## Consequences

**Makes easy**

- Request authentication with no I/O — a signature check.
- Socket handshake authentication without a lookup per connect, which matters
  during a reconnect storm.
- Genuine session listing and revocation, because refresh tokens are rows.
- Horizontal scale: any instance can verify any access token.

**Makes harder**

- Access tokens stay valid until they expire. Immediate revocation needs the
  token-version check described below, and even then is bounded by access-token
  lifetime. This is the accepted cost of the design.
- Rotation must be correct under concurrency. Two tabs refreshing at once must
  not trigger false reuse detection; the implementation needs a short grace
  window or a single-flight refresh.
- A JWT signing key now exists and must be managed, rotated, and never logged.

**Commits the project to**

- Access tokens ~15 minutes; refresh tokens long-lived and rotated.
- A `token_version` column on `users`, bumped by password change, "revoke all
  sessions" and account deletion, and checked when an access token is verified,
  so a bump invalidates outstanding access tokens.
- Refresh tokens never stored in plaintext, never in `localStorage`, never
  readable by JavaScript.
- CSRF protection on every cookie-authenticated route.
