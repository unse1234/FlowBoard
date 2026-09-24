# Step 1 — Security review (chunk 7.6)

A review of the whole authentication surface as built through Phase 7: signup,
login, sessions, tokens, the web app's handling of them, and the production
topology in front. Carried out 2026-09-25, against the code at the end of
chunk 7.5 plus the fixes below.

Evidence is file paths and tests. **Mutation-checked** means each defence
was disabled in turn and a test failed every time.

---

## Summary

| | |
| --- | --- |
| Fixed in this review | IPv6 limit bypass; a client-address single point of failure; `qs` advisory (F-15); web app security headers (F-6, partly) |
| Accepted residual risks | 7, listed below, each with its bound |
| Owner actions before auth is live | Provision Neon; set five environment variables; confirm two deploy checks (`DEPLOYMENT.md`) |

## What was checked

| Area | Result | Evidence |
| --- | --- | --- |
| **Account enumeration** | Sound. Signup answers identically for a taken address (E-12); login answers one way for every failure; per-address backoff counts unknown addresses the same; refresh gives one answer for every refusal; Turnstile's check does not depend on the address | `authRouter.js`; `loginRoute.test.js`, `refreshRoute.test.js`, `loginThrottle.test.js` (mutation: not counting unknown addresses fails a test) |
| **Timing** | One known residual, F-17 (signup insert vs no-op, ~13 ms, bounded by limits). Login does equal hashing *and* equal database work on both failure paths | F-17; `failedCheck` in `authRouter.js` |
| **Passwords** | Argon2id at OWASP's baseline, input capped at 1024 bytes, transparent rehash | ADR 0004, `passwordHasher.js` |
| **Access tokens** | HS256 only, header allow-listed, key by `kid`, signature checked before parsing, canonical encoding, 2 KB cap, `iat` skew only. Mutation-checked | ADR 0005, `accessTokens.js` |
| **Refresh tokens** | 256 random bits, SHA-256 at rest, rotated every use, reuse past 20 s revokes the session, concurrency proven by a controlled interleaving. Mutation-checked | `sessionRepository.js`, `sessionRepository.test.js` |
| **Cookie** | `HttpOnly`, `Secure`, `SameSite=Strict`, `__Secure-` prefix, `Path=/api/auth`; a duplicated cookie is refused, not guessed at | `refreshTokens.js` |
| **CSRF** | Trusted `Origin` required on every state-changing auth request, checked before routes and limits | `originCheck.js`, `csrf.test.js` |
| **Edge trust** | Auth requests must carry Vercel's secret; only then is Vercel's client address believed; `X-Forwarded-For` is never read | `edgeRequest.js`, `edgeRoute.test.js` |
| **Rate limits** | Shared across instances (PostgreSQL); sign-in 5/min, session routes 60/min, per-address backoff | ADR 0006, `rateLimiter.js`, `loginThrottle.js` |
| **Bot protection** | Turnstile on signup, fails closed, action checked, verified against Cloudflare's real API | `botCheck.js` |
| **Error responses** | Built only by `toResponseBody`, so `detail` and `cause` cannot leak; a test greps credential messages for revealing words | `authErrors.js` |
| **Logs** | No token, cookie, password, edge secret or Turnstile secret is ever logged (the last asserted by test). User and session ids only | route handlers, `botCheck.test.js` |
| **Web app storage** | Access token in memory only; refresh token never reachable by script; cross-tab messages carry no token (mutation-checked) | `authSession.js` |
| **Transport to the database** | TLS set in two places now refuses to start (F-23 fixed) | `createDatabase.js` |
| **Dependencies** | `npm audit`: 0 vulnerabilities after this review (was 1, F-15) | `Backend/package-lock.json` |

## Fixed in this review

1. **IPv6 made every per-address limit meaningless.** An ordinary connection
   gets a /64 and can use a fresh address per request. Limits now count IPv6
   clients by /64, and an IPv4-mapped address as its IPv4 address
   (`Backend/src/http/clientKey.js`). The session record keeps the full
   address. Mutation-checked through the route.
2. **One unverified header could have made sign-in limits site-wide.** If
   `x-vercel-forwarded-for` does not survive the hops to Render, every sign-in
   would share a single bucket: 5 a minute for everyone. Vercel's `x-real-ip`,
   documented as identical, is now read as a fallback (still only behind the
   secret), and a one-time log line says so if neither arrives.
3. **`qs` advisory (F-15).** `qs` 6.15.3 → 6.16.0 inside Express's own range, a
   three-line lockfile change. `npm audit` is clean.
4. **The web app sent no security headers (F-6).** `Frontend/vercel.json` now
   enforces `nosniff`, a referrer policy, and a permissions policy (no camera,
   location, payment or USB; the microphone for voice). A full CSP ships as
   **report-only**. It could not be checked in a browser from this session,
   and an enforced CSP that blocks the app's own fonts or socket would take
   the site down. Contract tests tie its API host to the auth route.

## Accepted residual risks

| Risk | Bound |
| --- | --- |
| An access token outlives sign-out by up to 15 minutes | ADR 0002's accepted cost; `GET /me` and future sensitive routes re-check the session |
| An attacker who knows an address can keep it in backoff | Capped at 15 minutes between attempts, never a lockout. A Turnstile challenge on sign-in can replace the wait later |
| Signup timing residual (F-17) | Small, overlapping ranges, bounded by limits |
| XSS could drive `/api/auth/refresh` from the page | Enforcing the CSP closes most of it. It is report-only until seen clean in a browser |
| No email verification or password reset | Phase 4 (D-4, D-5). Until then an address can be registered by anyone, and a forgotten password cannot be recovered |
| No session list or "sign out everywhere" | Phase 3; the account dialog is its home |
| The AI endpoint's limit is per-process and shared by all users in production | Finding F-14; `Backend/src/ai/` is outside Step 1 |

## Before auth goes live

Everything is in `docs/DEPLOYMENT.md`. In short:

1. Create the Neon database. Put its **direct** URL, with
   `sslmode=verify-full`, in Render's `DATABASE_URL`, and run the migrations.
2. Render: `AUTH_ACCESS_TOKEN_KEYS`, `CLIENT_ORIGIN`, `AUTH_PROXY_SECRET`.
   Vercel: the same `AUTH_PROXY_SECRET`. Optionally Turnstile's two keys.
3. After deploying: `/ready` answers ok, and a sign-in records your own address
   in `auth_sessions.ip_address`. That confirms the client-address header
   arrives.
4. Open the app, check the browser console for CSP reports, and when there are
   none, rename `Content-Security-Policy-Report-Only` to
   `Content-Security-Policy` in `Frontend/vercel.json` and update the test that
   pins it as report-only.
