# 0004 — Argon2id for password hashing

- **Status:** Accepted
- **Date:** 2026-09-23
- **Resolves:** `AUTH_DECISIONS.md` D-2

## Context

FlowBoard has no passwords yet, so there was no precedent to follow. Phase 1
needs a hash before it can store a credential.

The scale target is millions of users, which cuts two ways. A breach would
expose millions of hashes at once, so resistance to offline cracking matters
more than it would for a small service. But hashing is deliberately expensive,
so the parameters also set the login throughput of every instance.

OWASP's 2024 guidance ranks Argon2id first, scrypt second where Argon2 is
unavailable, and bcrypt third.

## Decision

**Argon2id**, via `@node-rs/argon2`, with OWASP's baseline parameters as the
default: **m=19456 KiB, t=2, p=1**.

All three parameters are configurable through the environment
(`AUTH_ARGON2_MEMORY_KIB`, `AUTH_ARGON2_TIME_COST`,
`AUTH_ARGON2_PARALLELISM`), because the right cost depends on the hardware this
runs on, which is not yet known.

Stored hashes use the PHC string format, which encodes the algorithm and its
parameters inside the hash:

```
$argon2id$v=19$m=19456,t=2,p=1$<salt>$<digest>
```

That gives algorithm agility for free. `needsRehash` compares a stored hash
against current configuration, so raising the cost later upgrades each account
transparently on its next successful login, with no migration and no forced
password reset.

## Alternatives considered

**bcrypt** — the most widely deployed option, and the one most people reach for.
Rejected because it is only CPU-hard, not memory-hard, so GPU and ASIC attacks
parallelise against it far more effectively. It also silently truncates input at
72 bytes, which quietly caps the strength of a long passphrase.

**Node's built-in `crypto.scrypt`** — genuinely attractive, because it is
memory-hard, OWASP-approved, and would add no dependency at all, which fits this
project's low-dependency character (`ENGINEERING_RULES.md` rule 50). Rejected
because Argon2id is the current standard and specifically resists the
time-memory trade-off attacks that scrypt is weaker against. Kept as the
fallback if the native module ever becomes a problem; `needsRehash` plus the PHC
format means switching would not require a reset.

**`argon2` (node-argon2)** — same algorithm, but compiles through node-gyp,
which needs a build toolchain on every machine and in every CI image.
`@node-rs/argon2` ships prebuilt binaries and installed on Windows with no
toolchain, verified during this chunk.

## Consequences

**Measured on the development machine** (Windows, Node 24), at the default
parameters:

| Concurrency | Per hash | Effective |
| --- | --- | --- |
| 1 | ~30 ms | ~33 hash/s |
| 4 | ~21 ms | ~49 hash/s |
| 8 | ~25 ms | ~40 hash/s |

Throughput stops improving past the libuv threadpool size, so it is
memory-bandwidth bound rather than CPU bound.

**This has two operational consequences that later phases must handle.**

1. **`UV_THREADPOOL_SIZE` becomes a tuning knob.** Hashing runs on the libuv
   threadpool, which defaults to 4 threads and is shared with other native
   work. An instance will not exceed roughly 40–50 logins per second at these
   parameters without raising it.

2. **A burst of login attempts can starve the threadpool**, delaying unrelated
   work on the same instance, including readiness checks. Rate limiting is
   therefore not only an abuse control but a stability requirement, and belongs
   with Phase 7 rather than being optional. Recorded as a risk so it is not
   rediscovered under load.

**Also committed to:**

- A 1024-byte cap on password input. Argon2 has no bcrypt-style truncation
  problem, but an unbounded password is a cheap way to make the server do
  expensive work.
- Verification never throws. A malformed or absent stored hash returns false, so
  a corrupted row cannot become a 500 that distinguishes itself from a wrong
  password.
- An account with no password (OAuth-only, Phase 8) must fail verification
  rather than error, which the same rule covers.
