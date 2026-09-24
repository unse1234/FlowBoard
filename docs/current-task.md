# Current Task

**The execution pointer. One active item. Update it at the end of every chunk.**

---

## Current task

Step 1 · **Phase 7 — auth hardening.** 7.0–7.3 done; 7.4 (per-account backoff) next.

## Status

**Phase 2 and the auth UI complete: persistent, revocable sign-in, in the web app** — 2026-09-24.

The project owner chose to finish Phase 2 before building the auth UI, so the
UI can keep people signed in across a refresh rather than hold sign-in state in
memory.

- 2.1: `auth_sessions` and `refresh_tokens`, verified on PostgreSQL 18.6.
- 2.2: HS256 access tokens, signed and verified with `node:crypto`.
- 2.3: login creates a session, sets the refresh cookie and returns an
  access token.
- 2.4: **`POST /api/auth/refresh` rotates the cookie and returns a fresh
  access token.** A replayed token revokes the session.
- 2.5: `POST /api/auth/logout` ends this device's session.
- 2.6: CSRF — every state-changing `/api/auth` request needs a trusted `Origin`.
- 2.7: `requireAuth` for HTTP routes, and `GET /api/auth/me`.
- UI-1 to UI-3: sign-in and create-account dialog, account dialog and
  board-menu entries on every layout, with a session controller that
  restores on reload and keeps tabs in step.

Backend suite: **380 passing, 0 skipped.**

**Deployment prerequisite (E-15):** the web app and API must be same-site in
production. Where the backend runs is unknown.

**F-20 resolved.** Migration checksums no longer change with the checkout's
line endings, and 0002 is applied to the development database.

## What was built

| Chunk | Delivers | Files |
| --- | --- | --- |
| 0.1 | Pooled connection, timeouts, transaction helper, slow-query reporting, readiness probe, graceful shutdown | `Backend/src/db/createDatabase.js`, `Backend/src/server.js`, `Backend/src/config/serverConfig.js` |
| 0.2 | Forward-only migration runner with advisory lock, checksum drift detection, per-migration transactions, `npm run migrate` | `Backend/src/db/migrate.js` |
| 0.3 | `users` table: UUID ids, soft delete, `token_version`, case-insensitive unique email | `Backend/migrations/0001_create_users.sql` |
| 0.4 | Schema integration suite, skipped unless `TEST_DATABASE_URL` is set | `Backend/src/db/schema.integration.test.js` |
| 1.1 | Argon2id hashing: PHC-stored parameters, `needsRehash` for transparent cost upgrades, input cap, non-throwing verification, timing-equalised unknown-user path | `Backend/src/auth/passwordHasher.js` |
| 1.2 | Email validation and normalisation: NFC then lowercase, byte-counted RFC limits, rejects header injection and invisible characters, and an integration test proving the app and PostgreSQL agree on `lower()` | `Backend/src/auth/emailAddress.js` |
| 1.3 | Auth error envelope mirroring `aiErrors.js`; `toResponseBody` makes leaking `detail` impossible; tests police the enumeration rule rather than commenting it | `Backend/src/auth/authErrors.js` |
| 1.4 | `POST /api/auth/signup` — uniform response whether or not the address is taken (E-12), always hashes before inserting, `ON CONFLICT DO NOTHING` so a race cannot leak, per-IP rate limit | `Backend/src/auth/authRouter.js`, `signupRequest.js`, `userRepository.js` |
| 1.5 | `POST /api/auth/login` — one answer for an unknown address, a wrong password and a no-password account, each doing equal work; account status checked only after the password verifies; stale hashes upgraded transparently | `Backend/src/auth/authRouter.js`, `loginRequest.js` |
| 2.1 | `auth_sessions` (one row per sign-in: the token family, with absolute expiry and reasoned revocation) and `refresh_tokens` (SHA-256 digest, idle expiry, `consumed_at` for reuse detection). Two tables so revocation cannot race rotation — E-13 | `Backend/migrations/0002_create_auth_sessions_and_refresh_tokens.sql`, `Backend/src/db/schema.integration.test.js` |
| 2.2 | HS256 access tokens via `node:crypto` (ADR 0005): strict verifier, `kid` keyring, `AUTH_ACCESS_TOKEN_KEYS`; no JWT dependency | `Backend/src/auth/accessTokens.js`, `Backend/src/config/serverConfig.js` |
| 2.3 | Login creates a session and refresh token, sets the `HttpOnly`/`Secure`/`Strict` cookie on `/api/auth`, returns an access token; credentialed CORS on `/api/auth` only | `Backend/src/auth/sessionRepository.js`, `refreshTokens.js`, `authRouter.js`, `Backend/src/server.js` |
| 2.4 | `POST /api/auth/refresh`: rotation under a session lock, reuse detection revoking the session, 20 s grace for racing tabs, uniform `SESSION_INVALID` | `Backend/src/auth/sessionRepository.js`, `authRouter.js` |
| 2.5 | `POST /api/auth/logout`: ends this device's session, never relabels a theft, always `{ ok: true }` | `Backend/src/auth/sessionRepository.js`, `authRouter.js` |
| 2.6 | CSRF: trusted-`Origin` check on the auth router, before routes and the rate limiter | `Backend/src/http/originCheck.js`, `authRouter.js` |
| 2.7 | `requireAuth` (bearer only, no I/O, frozen `request.user`) and `GET /api/auth/me` with database re-checks | `Backend/src/auth/authenticate.js`, `authRouter.js` |
| UI-1 | API client and form rules sharing the server's codes, limits and wording; contract test | `Frontend/src/features/auth/authClient.js`, `authForm.js` |
| UI-2 | Session controller: restore, refresh ahead of expiry, Web Locks, cross-tab sync, generation guard | `Frontend/src/features/auth/authSession.js` |
| UI-3 | `AuthDialog`, `AccountDialog`, account section of the board menu, `AuthProvider` | `Frontend/src/components/auth/`, `features/auth/AuthProvider.jsx`, `pages/BoardPage.jsx`, `main.jsx` |

## Recently fixed

Four rendering bugs, recorded as F-19: the erase preview was invisible on clean
lines and text, images ignored opacity, sketchy shapes composited opacity twice,
and fill rendered at 18% in the default style. All had one cause — each renderer
decided opacity for itself. Opacity is now set once, on the outermost node.

## Tests

| Suite | Result |
| --- | --- |
| Backend | **411 pass, 0 fail, 0 skipped** |
| Frontend | **267 pass, 0 fail** |
| Frontend lint | Clean |

Backend tests grew from 47 to 411. The hashing tests run at deliberately cheap
Argon2 parameters so the suite stays fast, with two tests pinning the real
shipped defaults against OWASP's baseline.

**The backend suite now requires a database**, and runs with
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

## Next task

**Phase 2 and its UI are complete** (2026-09-24). In order:

1. **Look at the UI in a browser.** It could not be viewed in the session that
   built it. It is verified by lint, the build, 259 frontend tests, and a Node
   run of the real client against the live server, but nobody has seen it. Run
   the backend and `npm run dev`, open **http://localhost:5173** (not
   127.0.0.1, which is not on the CORS list), then use the board menu (the
   ellipsis on desktop, the menu button on a phone), choose Sign in, then Create
   an account. Reload, and you should still be signed in. Check dark mode and a
   phone width.
2. **Decide the production topology (E-15)** before auth is deployed. The web
   app and the API must be same-site, and where the backend runs is unknown.
   A Vercel rewrite of `/api` to the backend is the smallest change.
3. **Phase 7: rate limiting.** F-16 and F-17 are reachable, the limiter is
   per-process, and `POST /api/auth/refresh` has no limit at all.
4. **Phase 5: socket authentication.** Unblocked by Phase 2 and Phase 0b, but
   it needs D-6 decided first. `getAccessToken()` in `authSession.js` is the
   seam it will use.
5. **Phase 3** (a session list: the account dialog is its home) and **Phase 4**
   (email, D-4), in either order.

## Before starting the next chunk

1. Read `CLAUDE.md`, then `AUTH/AUTH_STATUS.md`.
2. Check `AUDIT_FINDINGS.md` for anything touching the files you will modify.
3. Confirm the "Do not touch" list in `AUTH_STATUS.md`.
4. **Uncommitted pre-audit work is in the tree** (operation contract, renderers,
   `styleUtils`, `textMetrics` and related tests). It is unrelated to Step 1 —
   do not fold it into your chunk, and do not revert it.
