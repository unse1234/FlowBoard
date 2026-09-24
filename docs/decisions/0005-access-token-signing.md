# 0005 — Sign access tokens with HS256 through `node:crypto`

- **Status:** Accepted
- **Date:** 2026-09-24
- **Follows:** ADR 0002, which chose JWT access tokens but not how to sign them

## Context

ADR 0002 commits FlowBoard to short-lived JWT access tokens, verified by
signature with no datastore lookup. Chunk 2.2 has to sign and verify them, which
means choosing an algorithm and deciding whether to add a JWT library.

The backend has six runtime dependencies, and `ENGINEERING_RULES.md` rule 50
asks for the platform first. Rule 49 asks for a record whenever a dependency is
added or deliberately not added for a security-relevant job.

Three facts about FlowBoard shaped the choice:

- **One service issues tokens and the same service verifies them.** Auth lives
  in the existing backend (E-1). Socket authentication in Phase 5 runs in the
  same process.
- **No third party verifies FlowBoard tokens.** There is no public API or
  partner integration today.
- **Every instance already shares configuration** through the environment, so a
  shared secret is no harder to distribute than `DATABASE_URL`.

## Decision

**HS256 (HMAC-SHA256), implemented with `node:crypto`, in one module:
`Backend/src/auth/accessTokens.js`.**

The verifier accepts only what the issuer produces:

- `alg` must be exactly `HS256`, whatever the header claims. This is what
  closes the `alg: none` and algorithm-confusion attacks.
- The header may carry only `alg`, `typ` and `kid`, so `jku`, `jwk` and `crit`
  are refused.
- The key is found by `kid` from a configured keyring, never by trying each key.
- The signature is compared with `timingSafeEqual` before the payload is parsed.
- Only canonical base64url is accepted, so a token has one valid spelling.
- Length is capped at 2048 characters before any work is done.
- `iss`, `aud`, `sub`, `sid`, `ver`, `iat` and `exp` are type-checked, and only
  `iat` gets clock-skew leeway (30 s).

Keys come from `AUTH_ACCESS_TOKEN_KEYS` as `id:secret` pairs, each secret at
least 32 random bytes. The first signs and all of them verify, which is how a
key is rotated without signing anyone out. A malformed key stops the process
at startup, and so does a missing one once the auth routes are mounted (2.3).
There is no default.

## Alternatives considered

**`jose`**: a well-maintained, well-reviewed library with no dependencies of its
own. It would be the right choice if FlowBoard needed asymmetric algorithms,
JWKS endpoints, or encrypted tokens. It needs none of them today, and what it
guards against by default is covered above in about a hundred lines that the
tests exercise directly. Every check has a negative test, and a mutation run
disabled each check in turn to confirm a test fails.

**`jsonwebtoken`**: its history includes the algorithm-confusion class of bug
this decision exists to avoid, and it pulls in several dependencies. Rejected.

**EdDSA or ES256 with `node:crypto`**: asymmetric signing lets a party verify
tokens without being able to mint them. Nobody but FlowBoard verifies, so it
buys nothing yet and costs key-pair handling. It is the upgrade path if that
changes. See Consequences.

## Consequences

**Makes easy**

- Verification is one HMAC with no I/O, on every request and every socket
  handshake.
- No new dependency, and no transitive supply chain for the most sensitive
  code in the service.
- Key rotation is a configuration change: add a key first, remove the old one
  after 15 minutes.

**Makes harder**

- **Any holder of the secret can mint tokens.** Every instance has it, so it is
  exactly as sensitive as the database credentials, and has to be kept out of
  logs, errors and the frontend in the same way. The config module never prints
  it, and a test asserts that its error messages do not.
- **FlowBoard now owns JWT parsing.** A future change to `accessTokens.js`
  deserves the same scrutiny as a change to password hashing.

**Revisit when**

- A separate service, a partner or a public API has to verify tokens without
  being able to mint them. Move to EdDSA through `node:crypto`, or adopt `jose`
  and a JWKS endpoint. `issue` and `verify` are the only interface callers use,
  so the change stays inside one module.

**On `token_version`**

ADR 0002 says the version is "checked when an access token is verified", and
also that verification needs no lookup. Both cannot hold, because the current
version lives in the database. This ADR resolves it:

- `verify` checks signature and claims only, with no I/O, as ADR 0002 intends.
- The token carries `ver`. Code that already reads the user row compares it:
  the refresh endpoint and sensitive routes such as password change and session
  management.
- Revoking everything bumps the version **and** revokes every session, so no new
  access token can be minted. An outstanding one lives out its 15 minutes. That
  is the bound ADR 0002 accepted.
