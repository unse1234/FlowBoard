# Step 1 — Identity & Accounts · DECISIONS

Two kinds of entry:

- **ESTABLISHED** — already true of the repository, or forced by it. The audit
  found these; it did not choose them.
- **UNRESOLVED** — a real decision that has not been made. Deliberately left
  open. **Do not treat a recommendation below as a decision.**

Resolve an UNRESOLVED item by discussing it with the project owner, then record
the outcome here and write an ADR in `docs/decisions/`.

---

# ESTABLISHED

## E-1 · Authentication lives in the existing Node backend

**Decision:** auth is built into `Backend/`, not a separate service or a hosted
identity provider.
**Reason:** the backend already terminates both HTTP and Socket.IO. Socket
authentication (Phase 5) needs the token verified in the same process that owns
the connection. A separate service would add a network hop to every handshake.
**Evidence:** `Backend/src/server.js:13-52` creates the Express app and the
Socket.IO server together over one HTTP server.
**Impact:** no new deployable unit in Step 1.
**Status:** Established by architecture.

## E-2 · Auth code follows the `Backend/src/ai/` pattern

**Decision:** router factory with injected dependencies, validation at the
boundary, a typed error class with codes and HTTP statuses, user-safe messages,
diagnostics logged and never returned.
**Reason:** it is the best-built code in the repository and already proven by
tests. A second pattern would fragment the backend.
**Evidence:** `aiRouter.js`, `aiErrors.js`, `diagramRequest.js`, and their
tests — including one asserting nothing shaped like an API key reaches error
detail.
**Impact:** auth errors get an `authErrors.js` mirroring `aiErrors.js`.
**Status:** Established by convention.

## E-3 · JavaScript, not TypeScript

**Decision:** Step 1 is written in JavaScript — CommonJS on the backend, ESM on
the frontend.
**Reason:** there is no TypeScript anywhere, no tsconfig, and no build step for
the backend. Introducing TS during Step 1 would couple an auth change to a
toolchain migration.
**Evidence:** no `.ts`/`.tsx` files and no tsconfig; `Backend/package.json` sets
`"type": "commonjs"`.
**Impact:** JSDoc with `// @ts-check` where useful, as the frontend already
does. Revisit TS as its own decision, never inside an auth chunk.
**Status:** Established by the codebase. The checklist wants end-to-end types
(§29) — that is a separate, later decision.

## E-4 · `node:test` is the test runner

**Decision:** tests use the built-in runner and `node:assert/strict`.
**Reason:** both suites already do, with 241 passing tests and no framework
dependency.
**Evidence:** `Backend/package.json` `"test": "node --test src/**/*.test.js"`;
the frontend's `test:realtime` is the same.
**Status:** Established.

## E-5 · The server must own `userId`

**Decision:** once authentication exists, the server derives `userId` from the
authenticated session and **overwrites** any client-supplied value in
operations and presence.
**Reason:** `userId` is currently client-asserted and forgeable (F-2), which
makes attribution, audit logs and per-user undo unbuildable.
**Evidence:** `operationValidator.js:17-19` type-checks it only;
`boardGateway.js:88` falls back to the equally unverified handshake value.
**Impact:** Phase 5. Operations already carry `userId`, so the envelope does not
change — only who fills it.
**Status:** Established by the audit as a requirement.

## E-6 · Realtime gateways get tests before auth modifies them

**Decision:** Phase 0b precedes Phase 5.
**Reason:** `boardGateway.js`, `voiceGateway.js` and `operationStore.js` have no
test coverage at all (F-10), and Phase 5 rewrites their trust model.
**Evidence:** no test file imports any of them.
**Status:** Established by the audit as sequencing.

## E-7 · Identity requires a database first

**Decision:** Phase 0 (storage) precedes every other Step 1 phase.
**Reason:** there is no persistence layer of any kind to attach a user to.
**Evidence:** no driver, ORM, schema, migration or connection code in the
repository; `localStorage` and an in-memory `Map` are the only stores.
**Status:** Established by the audit as sequencing.

## E-8 · PostgreSQL, `pg`, and plain SQL migrations · *was D-1*

**Decision:** PostgreSQL, accessed via node-postgres, with forward-only SQL
migrations run by a small in-repo runner under an advisory lock.
**Reason:** the checklist's entities are relational and authorisation
correctness benefits from database-enforced integrity; `pg` keeps the backend
build-free and the dependency count low.
**Evidence:** full reasoning and alternatives in
`../decisions/0001-datastore-and-data-access.md`.
**Impact:** every query is hand-written and must be parameterised
(`ENGINEERING_RULES.md` rule 17). Unblocks all of Step 1.
**Status:** Accepted 2026-09-23.

## E-9 · Short JWT access + rotating opaque refresh cookie · *was D-3*

**Decision:** ~15-minute JWT access tokens verified by signature with no
lookup; opaque refresh tokens stored hashed, rotated on every use, with family
revocation on reuse; refresh delivered in an `HttpOnly`/`Secure`/`SameSite`
cookie; CSRF protection in the same phase as the cookie.
**Reason:** satisfies both "JWT with rotation" and "revoke individual sessions"
from §1 without a datastore lookup on every request or socket handshake.
**Evidence:** `../decisions/0002-token-and-session-strategy.md`.
**Impact:** `users` carries a `token_version` bumped by password change,
revoke-all and deletion, checked when verifying an access token.
**Status:** Accepted 2026-09-23.

## E-10 · Multi-instance from the first commit

**Decision:** every new subsystem is written to run on N instances — no shared
state in process memory, stateless auth, Redis-backed rate limiting, migrations
under an advisory lock, graceful shutdown, separate health and readiness.
**Reason:** the scale target is millions of users, and the retrofit cost would
land precisely on the auth code, which must be the most trustworthy.
**Evidence:** `../decisions/0003-multi-instance-from-the-start.md`.
**Impact:** existing single-instance subsystems are *not* rewritten in Step 1;
the operation store is Step 2's subject.
**Status:** Accepted 2026-09-23.

## E-11 · Argon2id for password hashing · *was D-2*

**Decision:** Argon2id via `@node-rs/argon2`, at OWASP's 2024 baseline
(m=19456 KiB, t=2, p=1), all three parameters configurable. Hashes are stored
as PHC strings, and `needsRehash` upgrades an account transparently on its next
successful login when the cost is raised.
**Reason:** memory-hard, so GPU and ASIC cracking scale far worse against it
than bcrypt — which matters most in the case being designed for, where a breach
exposes millions of hashes at once. `@node-rs/argon2` ships prebuilt binaries,
so it needs no build toolchain.
**Evidence:** `../decisions/0004-password-hashing.md`, with measured throughput.
**Impact:** ~30ms per hash and roughly 40–50 logins/second per instance at the
defaults, bounded by the libuv threadpool. This makes `UV_THREADPOOL_SIZE` a
tuning knob and makes auth rate limiting a stability requirement rather than
only an abuse control — see finding F-16.
**Status:** Accepted 2026-09-23.

---

# UNRESOLVED

## D-10 · Whether signup may say an address is already registered · **needed for 1.4**

**Question:** when someone signs up with an address that already has an
account, does the API say so?

**The tension.** Answering "already registered" is a user-enumeration oracle:
anyone can test addresses against FlowBoard and learn who has an account. Not
answering it means a real person who forgot they had an account gets a success
response and no account, which is worse UX than it sounds.

**The usual resolution** is to answer identically either way and let the
*email* carry the truth — a "confirm your address" message to a new address, a
"you already have an account, reset your password" message to an existing one.
That needs Phase 4, which does not exist yet, so chunk 1.4 cannot implement it
today.

**What exists already:** `EMAIL_ALREADY_REGISTERED` is in the catalogue with a
409, and `CREDENTIAL_CHECK_CODES` deliberately excludes it, so it can never be
reached from a sign-in whichever way this is decided. The decision only affects
signup.

**Options:**

1. **Reveal it now, revisit at Phase 4.** Simplest, best UX, and what GitHub and
   Google do. Accepts enumeration on the signup endpoint, mitigated by Phase 7
   rate limiting.
2. **Uniform response now**, and leave the account uncreated with no feedback
   until Phase 4 can send the email. Closes enumeration, but until Phase 4 a
   returning user gets silence.
3. **Block 1.4 until Phase 4**, so signup is built once with email in place.

**Status:** UNRESOLVED. Needed before chunk 1.4. Recorded rather than decided,
because it is a product trade-off rather than something the repository settles.

## D-4 · Email provider

**Question:** which transactional email service, and the local development
transport.
**Why unresolved:** no mailer dependency, no templates, no provider
configuration anywhere.
**Status:** UNRESOLVED. Needed for Phase 4.

## D-5 · What an unverified account may do

**Question:** can a user sign in, create boards or join rooms before verifying
their email?
**Why unresolved:** a product decision with no technical forcing function.
**Status:** UNRESOLVED. Needed for Phase 4.

## D-6 · The interim sharing model once auth exists

**Question:** when Phase 5 starts authorising `board:join`, what happens to
today's "anyone with the link edits" behaviour — before Step 12 defines roles?
**Why unresolved:** Phase 5 must not leave boards unreachable, and must not
keep F-1 open. Some interim rule is required, and the audit does not determine
which.
**Why it matters:** this is the one place Step 1 changes existing product
behaviour. Everything else in Step 1 is additive.
**Status:** UNRESOLVED. Needed for Phase 5. Decide before starting it.

## D-7 · What happens to a deleted user's boards

**Question:** on account deletion, are their boards deleted, anonymised, or
transferred?
**Why unresolved:** there is no board ownership model yet, so the question
cannot be answered from the repository. Interacts with GDPR erasure (§26).
**Status:** UNRESOLVED. Needed for Phase 6.

## D-8 · Bot protection mechanism

**Question:** CAPTCHA, proof-of-work, or another approach on signup.
**Why unresolved:** no precedent; a third-party choice with privacy
implications.
**Status:** UNRESOLVED. Needed for Phase 7.

## D-9 · OAuth email collision policy

**Question:** an OAuth login whose email matches an existing password account —
auto-link, require password confirmation, or refuse?
**Why unresolved:** a security-sensitive product decision. Auto-linking on an
unverified provider email is an account-takeover vector.
**Status:** UNRESOLVED. Needed for Phase 8.

---

## How to resolve one

1. Decide with the project owner.
2. Move the entry to **ESTABLISHED** here, with Decision, Reason, Evidence,
   Impact and Status.
3. Write an ADR in `docs/decisions/` if it has consequences beyond Step 1.
4. Update `AUTH_STATUS.md` if it unblocks a phase.
