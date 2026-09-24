# FlowBoard — Deployment

How FlowBoard runs in production, and what each service needs. Verified
against the live deployments on 2026-09-25 unless marked **UNVERIFIED**.

---

## Topology

```
                         ┌──────────────────────────────┐
 Browser ── HTTPS ──────►│ Vercel  flow-board-beige     │  the web app (static Vite build)
   │                     │         .vercel.app          │
   │                     │  /api/auth/*  ── rewrite ──┐ │
   │                     └────────────────────────────┼─┘
   │                                                  ▼
   │                     ┌──────────────────────────────┐
   └── HTTPS + WSS ─────►│ Render  flowboard-dmpm       │  the API + Socket.IO
       (AI, realtime)    │         .onrender.com        │  behind Cloudflare
                         └──────────────┬───────────────┘
                                        │ TLS
                                        ▼
                         ┌──────────────────────────────┐
                         │ Neon    PostgreSQL           │  accounts and sessions
                         └──────────────────────────────┘
```

**Why auth goes through Vercel** (`AUTH_DECISIONS.md` E-15). `vercel.app` and
`onrender.com` are both on the Public Suffix List, so the app and the API are
different *sites*. The refresh cookie is `SameSite=Strict`, and a browser never
sends such a cookie across sites. Safari blocks cross-site cookies outright.
Called directly, the API would sign everyone out on every reload. So the app
calls `/api/auth/...` **on its own origin**, and Vercel forwards it
(`Frontend/vercel.json`). To the browser, the cookie is first-party.

AI requests and the realtime socket still go straight to Render. They carry no
cookie, and a Vercel rewrite cannot carry a WebSocket anyway.

Development has the same shape: Vite's dev server forwards `/api/auth` to the
local backend (`Frontend/vite.config.js`).

## What was found live on 2026-09-25

| Check | Result |
| --- | --- |
| `GET https://flowboard-dmpm.onrender.com/health` | 200 |
| `GET https://flowboard-dmpm.onrender.com/ready` | **503, `database: not_configured`**: production has no database |
| `POST …/api/auth/refresh` | **404**: auth routes are off without a database |
| Response headers | `Server: cloudflare`, `CF-RAY`, `x-render-origin-server`: **Render sits behind Cloudflare** |
| Live frontend bundle | Calls `https://flowboard-dmpm.onrender.com`; contains no auth code yet |

## Database: Neon (E-16)

1. Create a Neon project in a region near the Render service.
2. Copy the **direct** connection string, not the pooled one. The pooled host
   contains `-pooler`. The migration runner holds a session-level advisory
   lock, and a transaction-mode pooler does not keep a session.
3. In that string, change **`sslmode=require` to `sslmode=verify-full`**.
   - Today `pg` 8 treats `require` as `verify-full`. Its own warning says v9
     will make `require` stop verifying the certificate.
   - A `sslmode` in the URL also silently overrides `DATABASE_SSL`
     (finding F-23), so the URL is where TLS is decided.
   - `channel_binding=require` can stay. `pg` parses it and does not enforce it.

## Render: the API

Set these in the service's **Environment**. None has a default that is safe for
production.

| Variable | Value | Why |
| --- | --- | --- |
| `DATABASE_URL` | The Neon direct string, with `sslmode=verify-full` | Without it, auth is switched off and `/ready` is 503 |
| `AUTH_ACCESS_TOKEN_KEYS` | `prod-1:<secret>`, where the secret comes from `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` | Signs access tokens. **With a database and no key, the server refuses to start.** Anyone holding it can sign in as anyone: treat it like the database password |
| `CLIENT_ORIGIN` | `https://flow-board-beige.vercel.app` | The only page allowed to call the API. The built-in default also allows `http://localhost:5173`, which production should not |
| `AUTH_PROXY_SECRET` | The **same** value as on Vercel (below) | Proves an auth request came through Vercel's route, so the client address it carries can be trusted. Requests without it are refused |
| `GEMINI_API_KEY` | (already set) | AI diagrams |

Leave `AUTH_COOKIE_SECURE` and `AUTH_COOKIE_SAME_SITE` unset. Their defaults
(`Secure`, `Strict`) are the production values.

### Migrations

The schema must exist before the new code serves a request.

- **Paid instance:** set the **Pre-Deploy Command** to `npm run migrate`. It runs
  before each deploy goes live, and a failure stops the deploy.
- **Free instance:** pre-deploy commands are not available (**UNVERIFIED**:
  check Render's current plan terms). Append to the **Build Command**:
  `… && npm run migrate`. Environment variables are available during builds.
  Migrations are forward-only and additive, so running them before a deploy
  finishes is safe.

The runner takes an advisory lock, so two deploys at once cannot both migrate.

### Free-instance cold starts

A free Render service sleeps when idle and takes tens of seconds to wake.
The web app's auth requests time out after 15 seconds. The first visit after a
quiet spell may show signed out, and the session controller retries every 30
seconds, so it restores itself once the API is awake. The realtime connection
has always had the same wait.

## Vercel: the web app

- **Root Directory:** `Frontend` (confirmed by the owner, 2026-09-25).
- `Frontend/vercel.json` holds the `/api/auth` rewrite. It names the Render URL,
  which is not secret: it is already in the public bundle.
- `VITE_API_URL` stays set to the Render URL, for AI and realtime.
- **`AUTH_PROXY_SECRET`** (Production environment): 32 random bytes, generated
  with the same command as the signing key. The route in `vercel.json` adds it
  to every `/api/auth` request as `x-flowboard-edge-secret`, reading it at
  request time, so it is never in the repository. **It must equal Render's
  value exactly.** A mismatch refuses every sign-in with `ORIGIN_NOT_ALLOWED`,
  and Render's log says `wrong edge secret`.
- **Do not** set `VITE_AUTH_API_URL`. Unset means same-origin, which is the point.
- **`VITE_TURNSTILE_SITE_KEY`** (optional, public): the Turnstile site key. It is
  compiled into the bundle, so it takes a **redeploy** to take effect.
- Preview deployments are not on `CLIENT_ORIGIN`, so sign-in is refused there
  (`ORIGIN_NOT_ALLOWED`). That is deliberate; add a preview origin only on
  purpose.

## Checking a deploy

After both services have deployed:

```bash
# The API has its database
curl -s https://flowboard-dmpm.onrender.com/ready
#   expect: {"ok":true,"checks":{"database":"ok"}}

# The rewrite reaches the API, and the API answers for its own origin
curl -s -X POST https://flow-board-beige.vercel.app/api/auth/refresh \
  -H "origin: https://flow-board-beige.vercel.app"
#   expect: {"ok":false,"code":"SESSION_INVALID",...}
#   HTML instead means the rewrite is not active; a 404 means no database.
```

Then, in a browser: create an account from the board menu, reload, and check
you are still signed in. That is the property this whole topology exists for.

**Until the database exists, the web app hides accounts entirely.** With no
`DATABASE_URL` the API mounts no auth routes and answers 404. The web app
reads that as "accounts unavailable": no Sign in in the menu, and one request
per page load, not a retry loop. The menu entry appears by itself once Render
has a database. So the code is safe to deploy before the database is.

**UNVERIFIED until the first deploy:**

- That Vercel's route forwards the `Origin` header and the cookie unchanged.
  Both behaved this way through Vite's proxy locally, and the second `curl`
  above proves it in production.
- That Vercel sends `x-vercel-forwarded-for` on to an external destination.
  Vercel documents the header for its own functions. If it does not reach
  Render, every sign-in shares one rate-limit bucket (the reader falls back to
  a single `edge-client-unknown` key, which fails strict, never open). Check
  once after deploying: sign in, then look at the new row in
  `auth_sessions.ip_address`. Your own address means it works; empty means it
  does not.

## Bot protection: Turnstile (7.5)

Off until configured, and it must be switched on **on both sides together**:

1. In Cloudflare, create a Turnstile widget for `flow-board-beige.vercel.app`
   (mode: Managed). It gives a site key and a secret key.
2. Render: `TURNSTILE_SECRET_KEY` = the secret key.
3. Vercel: `VITE_TURNSTILE_SITE_KEY` = the site key, then **redeploy**.

With the secret set and no site key, every signup is refused for want of a
token (`BOT_CHECK_FAILED`). With the site key set and no secret, tokens are
sent and nobody checks them. Sign-in is not gated.

## Client addresses (7.1)

Every auth request reaches the API from Render's proxy, the same socket
address for everyone. The real client is known only to the edge in front.
`Backend/src/http/edgeRequest.js` trusts Vercel's `x-vercel-forwarded-for`, which
Vercel documents it overwrites to stop spoofing, **only** on a request that
carries the edge secret. Without the secret a request is refused, because
anyone can call Render directly and send any header they like.
`X-Forwarded-For` itself is never read: Cloudflare and Render append to it,
and a client can start it.

Not covered: `/api/ai` goes straight to Render, so the AI rate limit still
keys on the socket and all AI users share one allowance (finding F-14).
