const assert = require("node:assert/strict");
const test = require("node:test");
const { hashRefreshToken } = require("./refreshTokens");
const {
  BASE_CONFIG,
  SKIP,
  VALID_SIGNUP,
  readSetCookie,
  startAuthServer,
} = require("./testServer");

/**
 * CSRF protection on every /api/auth route, against a real PostgreSQL
 * (chunk 2.6).
 *
 * Each forged request is checked for two things: that it is refused, and that
 * it changed nothing. A refusal that arrives after the session was already
 * revoked would pass the first check and fail the point.
 */

const COOKIE = BASE_CONFIG.auth.cookie.name;
const CREDENTIALS = Object.freeze({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });
const EVIL = "https://evil.example";

const REFUSED = Object.freeze({
  ok: false,
  code: "ORIGIN_NOT_ALLOWED",
  error: "This request didn't come from FlowBoard. Reload the page and try again.",
});

async function signedIn(t, options) {
  const server = await startAuthServer(t, options);
  assert.equal((await server.signup(VALID_SIGNUP)).status, 202, "setup: signup");
  const login = await server.login(CREDENTIALS);
  assert.equal(login.status, 200, "setup: login");
  return { server, token: readSetCookie(login, COOKIE).value };
}

const count = async (server, sql) => (await server.database.query(sql)).rows[0].count;

const tokenState = async (server, token) =>
  (
    await server.database.query(
      `SELECT t.consumed_at, s.revoked_at FROM refresh_tokens t
       JOIN auth_sessions s ON s.id = t.session_id WHERE t.token_hash = $1`,
      [hashRefreshToken(token)],
    )
  ).rows[0];

async function assertRefused(response, label) {
  assert.equal(response.status, 403, label);
  assert.deepEqual(await response.json(), REFUSED, label);
  // A refused request must not touch the cookie either way.
  assert.equal(readSetCookie(response, COOKIE), null, label);
}

test("a forged logout is refused and the session survives", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);

  // What a hidden form on another site would send: the cookie rides along
  // (only SameSite stops it, and not everywhere), with that site's Origin.
  const forged = await server.post("/api/auth/logout", "", {
    "content-type": "text/plain",
    origin: EVIL,
    cookie: `${COOKIE}=${token}`,
  });

  await assertRefused(forged, "forged logout");
  assert.equal((await tokenState(server, token)).revoked_at, null);
});

test("a forged refresh is refused and spends nothing", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);

  await assertRefused(await server.refresh(token, { origin: EVIL }), "forged refresh");

  const state = await tokenState(server, token);
  assert.equal(state.consumed_at, null);
  assert.equal(state.revoked_at, null);
});

test("a forged sign-in is refused and starts no session", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(VALID_SIGNUP);

  // Login CSRF: signing the victim into the attacker's account, so their work
  // lands where the attacker can read it.
  await assertRefused(await server.login(CREDENTIALS, { origin: EVIL }), "forged login");

  assert.equal(await count(server, "SELECT count(*)::int AS count FROM auth_sessions"), 0);
});

test("a forged signup is refused and creates no account", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);

  const response = await server.post("/api/auth/signup", VALID_SIGNUP, { origin: EVIL });

  await assertRefused(response, "forged signup");
  assert.equal(await server.countUsers(), 0);
});

test("a request with no Origin, or the null origin, is refused", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);

  await assertRefused(await server.refresh(token, { origin: null }), "no origin");
  await assertRefused(await server.refresh(token, { origin: "null" }), "null origin");
  await assertRefused(await server.logout(token, { origin: null }), "logout, no origin");

  assert.equal((await tokenState(server, token)).consumed_at, null);
});

test("the configured origin is let through, and a lookalike of it is not", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const [origin] = server.config.clientOrigin;
  await server.signup(VALID_SIGNUP);

  const trusted = await server.login(CREDENTIALS, { origin });
  const lookalike = await server.login(CREDENTIALS, { origin: `${origin}/` });

  assert.equal(trusted.status, 200);
  await assertRefused(lookalike, "trailing slash");
});

test("the check runs before the rate limiter, so forgeries cost the victim nothing", { skip: SKIP }, async (t) => {
  // Two attempts a minute: signup takes one, leaving exactly one.
  const server = await startAuthServer(t, { rateLimitPerMinute: 2 });
  assert.equal((await server.signup(VALID_SIGNUP)).status, 202);

  // Forged attempts from the victim's own address. If any of them counted,
  // the limit would be spent and the genuine sign-in below refused.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assertRefused(await server.login(CREDENTIALS, { origin: EVIL }), `forgery ${attempt}`);
  }

  assert.equal((await server.login(CREDENTIALS)).status, 200);
});

test("a refusal says nothing about the account or the session", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);

  const withSession = await server.refresh(token, { origin: EVIL });
  const withNothing = await server.refresh(null, { origin: EVIL });

  assert.deepEqual(await withSession.json(), await withNothing.json());
});
