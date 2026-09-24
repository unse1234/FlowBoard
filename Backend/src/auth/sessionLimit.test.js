const assert = require("node:assert/strict");
const test = require("node:test");
const { hashRefreshToken } = require("./refreshTokens");
const { BASE_CONFIG, SKIP, VALID_SIGNUP, readSetCookie, startAuthServer } = require("./testServer");

/**
 * The session allowance on refresh, sign-out and me (chunk 7.3), against a
 * real PostgreSQL.
 *
 * A refused request must be refused whole: no token spent, no session ended,
 * no cookie touched. Otherwise the browser and the server disagree about what
 * happened.
 */

const COOKIE = BASE_CONFIG.auth.cookie.name;
const CREDENTIALS = Object.freeze({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });

async function signedIn(t, options) {
  const server = await startAuthServer(t, options);
  assert.equal((await server.signup(VALID_SIGNUP)).status, 202, "setup: signup");
  const login = await server.login(CREDENTIALS);
  assert.equal(login.status, 200, "setup: login");
  const { accessToken } = await login.json();
  return { server, token: readSetCookie(login, COOKIE).value, accessToken };
}

const tokenState = async (server, token) =>
  (
    await server.database.query(
      `SELECT t.consumed_at, s.revoked_at FROM refresh_tokens t
       JOIN auth_sessions s ON s.id = t.session_id WHERE t.token_hash = $1`,
      [hashRefreshToken(token)],
    )
  ).rows[0];

async function assertThrottled(response, label) {
  assert.equal(response.status, 429, label);
  assert.equal((await response.json()).code, "TOO_MANY_ATTEMPTS", label);
  assert.ok(Number(response.headers.get("retry-after")) >= 1, `${label}: Retry-After`);
  assert.equal(readSetCookie(response, COOKIE), null, `${label}: the cookie was touched`);
}

test("past the allowance, a refresh is refused and spends nothing", { skip: SKIP }, async (t) => {
  const { server, token, accessToken } = await signedIn(t, { sessionRateLimitPerMinute: 1 });

  // The one allowed request, spent on something harmless. It has to be an
  // authenticated one: requireAuth turns away a tokenless request before the
  // limiter ever counts it.
  assert.equal((await server.me(accessToken)).status, 200);
  await assertThrottled(await server.refresh(token), "refresh");

  const state = await tokenState(server, token);
  assert.equal(state.consumed_at, null);
  assert.equal(state.revoked_at, null);
});

test("past the allowance, a sign-out is refused whole", { skip: SKIP }, async (t) => {
  const { server, token, accessToken } = await signedIn(t, { sessionRateLimitPerMinute: 1 });

  assert.equal((await server.me(accessToken)).status, 200);
  await assertThrottled(await server.logout(token), "logout");

  // Still signed in on both sides: the session is live and the cookie stays.
  assert.equal((await tokenState(server, token)).revoked_at, null);
});

test("past the allowance, me is refused too", { skip: SKIP }, async (t) => {
  const { server, accessToken } = await signedIn(t, { sessionRateLimitPerMinute: 1 });

  assert.equal((await server.me(accessToken)).status, 200);
  await assertThrottled(await server.me(accessToken), "me");
});

test("the two allowances are separate: exhausting sign-in never blocks a refresh", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t, { rateLimitPerMinute: 2, sessionRateLimitPerMinute: 5 });

  // Signup and login took both sign-in slots, so a third attempt is refused.
  assert.equal((await server.login(CREDENTIALS)).status, 429);
  // Refresh draws on its own allowance.
  assert.equal((await server.refresh(token)).status, 200);
});

test("the two allowances are separate: tabs refreshing never block a sign-in", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t, { rateLimitPerMinute: 3, sessionRateLimitPerMinute: 2 });

  let current = token;
  for (let round = 0; round < 2; round += 1) {
    current = readSetCookie(await server.refresh(current), COOKIE).value;
  }
  assert.equal((await server.refresh(current)).status, 429);

  // Signup and login took two of three sign-in slots; one remains.
  assert.equal((await server.login(CREDENTIALS)).status, 200);
});

test("under the allowance nothing changes", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t, { sessionRateLimitPerMinute: 10 });

  const refreshed = await server.refresh(token);

  assert.equal(refreshed.status, 200);
  assert.ok(readSetCookie(refreshed, COOKIE).value);
});
