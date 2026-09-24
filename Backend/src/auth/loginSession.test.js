const assert = require("node:assert/strict");
const test = require("node:test");
const { createAccessTokens } = require("./accessTokens");
const { hashRefreshToken } = require("./refreshTokens");
const {
  BASE_CONFIG,
  SKIP,
  VALID_SIGNUP,
  readSetCookie,
  startAuthServer,
} = require("./testServer");

/**
 * What a successful sign-in hands out (chunk 2.3): a session row, a refresh
 * token in an HttpOnly cookie, and an access token bound to that session.
 */

const COOKIE = BASE_CONFIG.auth.cookie.name;
const CREDENTIALS = Object.freeze({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });
const accessTokens = createAccessTokens({ config: BASE_CONFIG.auth.accessToken });

async function serverWithAccount(t, options) {
  const server = await startAuthServer(t, options);
  const response = await server.signup(VALID_SIGNUP);
  assert.equal(response.status, 202, "setup: signup should have succeeded");
  return server;
}

const rows = async (server, sql) => (await server.database.query(sql)).rows;

/** Seconds between two instants, for comparing lifetimes without depending on exact timing. */
const secondsBetween = (later, earlier) => (later.getTime() - earlier.getTime()) / 1000;

test("signing in sets a refresh cookie that script cannot read", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const response = await server.login(CREDENTIALS);
  const cookie = readSetCookie(response, COOKIE);

  assert.equal(response.status, 200);
  assert.ok(cookie, "expected a refresh cookie");
  assert.equal(COOKIE, "__Secure-flowboard_refresh");
  assert.equal(cookie.attributes.httponly, true);
  assert.equal(cookie.attributes.secure, true);
  assert.equal(cookie.attributes.samesite, "Strict");
  // Sent to the auth routes and nowhere else.
  assert.equal(cookie.attributes.path, "/api/auth");
  assert.equal(cookie.attributes.domain, undefined);
  // Fourteen days, the idle limit.
  const maxAge = Number(cookie.attributes["max-age"]);
  assert.ok(Math.abs(maxAge - 14 * 24 * 60 * 60) <= 5, `max-age ${maxAge}`);
});

test("the database holds the token's hash, never the token", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const { value } = readSetCookie(await server.login(CREDENTIALS), COOKIE);
  const tokens = await rows(server, "SELECT token_hash, consumed_at FROM refresh_tokens");

  assert.match(value, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(tokens.length, 1);
  assert.ok(tokens[0].token_hash.equals(hashRefreshToken(value)));
  assert.equal(tokens[0].token_hash.includes(Buffer.from(value)), false);
  assert.equal(tokens[0].consumed_at, null);
});

test("signing in answers with an access token bound to the new session", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const payload = await (await server.login(CREDENTIALS)).json();
  const [session] = await rows(server, "SELECT id, user_id FROM auth_sessions");
  const verified = accessTokens.verify(payload.accessToken);

  assert.equal(verified.valid, true, verified.reason);
  assert.equal(verified.claims.userId, payload.user.id);
  assert.equal(verified.claims.userId, session.user_id);
  assert.equal(verified.claims.sessionId, session.id);
  assert.equal(verified.claims.tokenVersion, 0);
  assert.equal(payload.accessTokenExpiresAt, verified.claims.expiresAt.toISOString());

  const lifetime = secondsBetween(verified.claims.expiresAt, new Date());
  assert.ok(lifetime > 890 && lifetime <= 900, `lifetime ${lifetime}`);
});

test("the body carries the access token and never the refresh token", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const response = await server.login(CREDENTIALS);
  const { value } = readSetCookie(response, COOKIE);
  const payload = await response.json();

  // Script can read the body. The refresh token must only ever be in the
  // HttpOnly cookie, or a single XSS keeps the session forever.
  assert.deepEqual(Object.keys(payload).sort(), ["accessToken", "accessTokenExpiresAt", "ok", "user"]);
  assert.equal(JSON.stringify(payload).includes(value), false);
});

test("a response carrying a token is never cached", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const response = await server.login(CREDENTIALS);

  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("the session records its lifetimes and the device that signed in", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  await server.login(CREDENTIALS, { "user-agent": "  FlowBoardTest/1.0 (X11; Linux)  " });
  const [session] = await rows(
    server,
    "SELECT created_at, expires_at, last_used_at, user_agent, ip_address, revoked_at FROM auth_sessions",
  );
  const [token] = await rows(server, "SELECT created_at, expires_at FROM refresh_tokens");

  assert.equal(session.user_agent, "FlowBoardTest/1.0 (X11; Linux)");
  assert.match(session.ip_address, /^(::ffff:)?127\.0\.0\.1$/);
  assert.equal(session.revoked_at, null);
  assert.equal(secondsBetween(session.expires_at, session.created_at), 30 * 24 * 60 * 60);
  assert.equal(secondsBetween(token.expires_at, token.created_at), 14 * 24 * 60 * 60);
});

test("an oversized user agent is cut to fit rather than failing the sign-in", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  // Non-ASCII, which arrives as one character per byte, so the column's
  // character-counted CHECK and the cut agree.
  const response = await server.login(CREDENTIALS, { "user-agent": "é".repeat(600) });
  const [session] = await rows(server, "SELECT user_agent FROM auth_sessions");

  assert.equal(response.status, 200);
  assert.equal(session.user_agent, "é".repeat(512));
});

test("a refresh token never outlives its session", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t, {
    auth: { refreshToken: { idleTtlSeconds: 7_200, sessionTtlSeconds: 3_600 } },
  });

  const response = await server.login(CREDENTIALS);
  const [session] = await rows(server, "SELECT expires_at FROM auth_sessions");
  const [token] = await rows(server, "SELECT expires_at FROM refresh_tokens");
  const maxAge = Number(readSetCookie(response, COOKIE).attributes["max-age"]);

  assert.deepEqual(token.expires_at, session.expires_at);
  assert.ok(maxAge <= 3_600 && maxAge > 3_590, `max-age ${maxAge}`);
});

test("each sign-in is a session of its own", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const first = readSetCookie(await server.login(CREDENTIALS), COOKIE).value;
  const second = readSetCookie(await server.login(CREDENTIALS), COOKIE).value;

  assert.notEqual(first, second);
  assert.equal((await rows(server, "SELECT id FROM auth_sessions")).length, 2);
  assert.equal((await rows(server, "SELECT id FROM refresh_tokens")).length, 2);
});

test("a refused sign-in creates no session and sets no cookie", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const wrongPassword = await server.login({ ...CREDENTIALS, password: "not-the-right-one" });
  const unknownAddress = await server.login({ ...CREDENTIALS, email: "nobody@example.com" });
  await server.database.query("UPDATE users SET status = 'suspended'");
  const suspended = await server.login(CREDENTIALS);

  assert.deepEqual(
    [wrongPassword.status, unknownAddress.status, suspended.status],
    [401, 401, 403],
  );
  for (const response of [wrongPassword, unknownAddress, suspended]) {
    assert.equal(readSetCookie(response, COOKIE), null);
  }
  assert.equal((await rows(server, "SELECT id FROM auth_sessions")).length, 0);
});

test("the access token carries the account's current token_version", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  await server.database.query("UPDATE users SET token_version = 4");

  const { accessToken } = await (await server.login(CREDENTIALS)).json();

  assert.equal(accessTokens.verify(accessToken).claims.tokenVersion, 4);
});
