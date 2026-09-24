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

## E-12 · Signup answers the same whether or not the address is taken · *was D-10*

**Decision:** signup returns an identical response for a new address and for one
that already has an account. The truth is carried by email: "confirm your
address" to a new one, "you already have an account, reset your password" to an
existing one.

**Reason:** any difference in the response — status, body, or how long it takes
— lets anyone test addresses against FlowBoard and learn who has an account.
Letting the mailbox answer gives the real owner what they need while telling a
stranger nothing, because only the address owner sees it.

**Impact, and the part that is not free:** the email half needs Phase 4, which
does not exist yet. Until it does, someone who signs up again with an existing
address gets a success response and **no email and no explanation**. That is a
real gap, accepted deliberately as the cost of not shipping an enumeration
oracle, and it is what makes Phase 4 a completion requirement for Phase 1
rather than a later nicety.

**Consequences for the implementation:**

- Signup hashes the password before attempting the insert, on both paths. A
  branch that skipped hashing would answer measurably faster and be the same
  oracle in the time domain.
- The insert uses `ON CONFLICT DO NOTHING`, so two concurrent signups for one
  address cannot produce a unique-violation error that distinguishes the cases.
- `EMAIL_ALREADY_REGISTERED` stays in the catalogue but is unreachable from
  signup. It is kept for an authenticated flow that may legitimately report it,
  such as changing your own email address in Phase 6.

**Measured afterwards:** the status and body are identical, but the two paths do
not take exactly the same time — an insert writes WAL and a no-op conflict does
not, about 64ms against 51ms with overlapping ranges. Finding F-17 records it.
The decision stands: the difference is small relative to the fixed hashing cost
and is bounded by rate limiting, whereas a differing status code would be a
single-request oracle.

**Status:** Accepted 2026-09-23. Chosen by the project owner.

## E-13 · A token family is a row of its own

**Decision:** ADR 0002's "family" is stored as an `auth_sessions` row, and each
refresh token references its session. There is no `family_id` column repeated
across tokens. `AUTH_PLAN.md` chunk 2.1 said "`refresh_tokens` migration …
family id". This is the same model with the family made explicit.

**Reason:** revoking a family has to be race-free. With a shared `family_id`,
revocation is `UPDATE refresh_tokens … WHERE family_id = $1`. Under READ
COMMITTED, that update cannot see a successor inserted by a rotation that
commits at the same moment, so the thief's copy of the family can outlive its
own revocation. With a session row, rotation and revocation both go through one
row, and a revoked session invalidates every token in it whenever it was made.
The same row also gives Phase 3 a table to list, and holds the absolute session
lifetime, which rotation must never extend.

**Impact:**

- Chunk 2.4 must check the session, not only the token, on every refresh, and
  must lock the session row while rotating. That lock is also the natural point
  for the concurrency safety ADR 0002 requires.
- Consumed tokens are kept until their session is purged, because reuse
  detection needs them. Deleting one would turn the replay of a stolen token
  into an ordinary "unknown token". **Rows grow with every rotation,** so a purge
  of expired and revoked sessions is required before launch. It is not built;
  see `AUTH_PLAN.md` Phase 3.
- Two expiries: a per-token idle limit and a per-session absolute limit. Their
  values are chunk 2.3's to choose.

**Evidence:** `Backend/migrations/0002_create_auth_sessions_and_refresh_tokens.sql`.

**Status:** Accepted 2026-09-24. An implementation choice made in chunk 2.1
within ADR 0002, not by the project owner, so reverse it here if it is wrong.

## E-14 · Access tokens are HS256, signed with `node:crypto`

**Decision:** no JWT library. One module, `Backend/src/auth/accessTokens.js`,
issues and verifies. It accepts only HS256, only the header fields it writes,
and chooses the key by `kid` from a keyring configured in
`AUTH_ACCESS_TOKEN_KEYS`.
**Reason:** one service issues and verifies, so an asymmetric key buys nothing
yet, and the platform covers HMAC (rule 50).
**Also resolves** an inconsistency in ADR 0002. `verify` does no I/O, and
`token_version` is compared where the user row is already read, not on every
request.
**Evidence:** `../decisions/0005-access-token-signing.md`.
**Status:** Accepted 2026-09-24. Chosen in chunk 2.2 at the owner's request to
decide and record it.

## E-15 · The web app and the API must be same-site

**Decision:** the refresh cookie is `SameSite=Strict`, `HttpOnly`, `Secure`,
`__Secure-` prefixed, and scoped to `Path=/api/auth`. Production must serve the
web app and the API from the **same site**, meaning the same registrable domain
(`app.flowboard.example` and `api.flowboard.example`), or the API proxied under
the app's own domain.

**Reason:** a browser sends a `Strict` or `Lax` cookie only to the site the
page is on. If the API is on another site, the cookie is third-party. Safari
blocks third-party cookies outright, and other browsers partition or restrict
them. The symptom would be a user who signs in and is signed out again on the
next reload.

**The escape hatch:** `AUTH_COOKIE_SAME_SITE=none` works where third-party
cookies still do. It is a stopgap, not a deployment model, and `none` without
`Secure` stops startup.

**Open:** where the backend is deployed is **UNKNOWN** (`PROJECT_CONTEXT.md`
§8). `serverConfig.js` names `flow-board-beige.vercel.app` as a web origin, and
`vercel.app` is on the Public Suffix List, so that deployment is its own site.
An API anywhere else is cross-site to it. **Settle the production topology
before the auth UI ships**: a Vercel rewrite of `/api` to the backend is the
smallest change.

**Status:** Accepted 2026-09-24 (chunk 2.3).

**Resolved 2026-09-25 (chunk 7.0).** The owner confirmed the API runs on
Render (`flowboard-dmpm.onrender.com`) and the app on Vercel, two different
sites. The web app now calls `/api/auth` on its own origin. Vercel rewrites
it to Render in production (`Frontend/vercel.json`), and Vite's proxy does the
same in development. The cookie is first-party everywhere, and
`SameSite=Strict` stands. See `../DEPLOYMENT.md`.

## E-16 · Production database: Neon

**Decision:** the Render backend uses a Neon PostgreSQL database, through the
**direct** (unpooled) connection string with `sslmode=verify-full`.
**Reason:** a free tier that does not expire. The direct string, because the
migration runner holds a session-level advisory lock that a transaction-mode
pooler cannot keep. `verify-full`, because `pg` 8 warns that `require` stops
verifying certificates in v9, and a URL `sslmode` overrides `DATABASE_SSL`
(F-23).
**Found first:** production had no database at all on 2026-09-25 (`/ready`:
`not_configured`), so every auth route was a 404 there.
**Status:** Chosen by the project owner, 2026-09-25. Provisioning is the
owner's step (`../DEPLOYMENT.md`).

## E-17 · Rate-limit counters live in PostgreSQL

**Decision:** Phase 7's shared rate limits keep their counters in PostgreSQL,
behind an interface Redis can later implement.
**Reason:** production has no Redis, and adding one means a second managed
service for traffic that is small: sign-in, sign-up and refresh. PostgreSQL is
already required, and an atomic upsert per attempt is cheap at that volume.
Realtime traffic, when it needs shared limits or Socket.IO fan-out, is where
Redis earns its place.
**Supersedes:** ADR 0003's "Redis-backed rate limiting", for auth only. ADR
0006 records it (chunk 7.2).
**Status:** Chosen by the project owner, 2026-09-25.

## E-18 · Bot protection: Cloudflare Turnstile · *was D-8*

**Decision:** signup is protected by Cloudflare Turnstile, verified on the
server.
**Reason:** free, usually invisible, no image puzzles, and it does not track
people across sites for advertising.
**Impact:** a site key in the frontend (public) and a secret key on the server.
Chunk 7.5.
**Status:** Chosen by the project owner, 2026-09-25.

---

# UNRESOLVED

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

**Status:** RESOLVED 2026-09-25 as E-18 (Cloudflare Turnstile).

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
