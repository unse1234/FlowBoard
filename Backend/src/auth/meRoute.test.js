const assert = require("node:assert/strict");
const test = require("node:test");
const { createAccessTokens } = require("./accessTokens");
const { BASE_CONFIG, SKIP, VALID_SIGNUP, readSetCookie, startAuthServer } = require("./testServer");

/**
 * GET /api/auth/me against a real PostgreSQL (chunk 2.7).
 *
 * The one route that checks an access token against the database: the
 * session must be live, the token_version current and the account active. A
 * well-signed token is not enough.
 */

const COOKIE = BASE_CONFIG.auth.cookie.name;
const CREDENTIALS = Object.freeze({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });

async function serverWithAccount(t) {
  const server = await startAuthServer(t);
  assert.equal((await server.signup(VALID_SIGNUP)).status, 202, "setup: signup");
  return server;
}

async function signIn(server) {
  const response = await server.login(CREDENTIALS);
  assert.equal(response.status, 200, "setup: login");
  const { accessToken } = await response.json();
  return { accessToken, refreshToken: readSetCookie(response, COOKIE).value };
}

async function assertUnauthenticated(response, label) {
  assert.equal(response.status, 401, label);
  assert.equal((await response.json()).code, "AUTHENTICATION_REQUIRED", label);
  // RFC 6750: every 401 from a bearer-protected route carries a challenge,
  // including one the route decides on after the signature checked out.
  assert.match(response.headers.get("www-authenticate") ?? "", /^Bearer realm="flowboard"/, label);
}

test("me answers with the signed-in account, uncached", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const { accessToken } = await signIn(server);

  const response = await server.me(accessToken);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(payload.user).sort(), ["displayName", "email", "emailVerified", "id"]);
  assert.equal(payload.user.email, VALID_SIGNUP.email);
});

test("me refuses a request with no token", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const response = await server.me(undefined);

  await assertUnauthenticated(response, "no token");
  assert.equal(response.headers.get("www-authenticate"), 'Bearer realm="flowboard"');
});

test("a well-signed token for a signed-out session is refused", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const { accessToken, refreshToken } = await signIn(server);

  await server.logout(refreshToken);

  // The signature is still good for up to 15 minutes. This route looks.
  await assertUnauthenticated(await server.me(accessToken), "after logout");
});

test("signing out one device does not affect another's token", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const laptop = await signIn(server);
  const phone = await signIn(server);

  await server.logout(laptop.refreshToken);

  assert.equal((await server.me(phone.accessToken)).status, 200);
});

test("a token from before a token_version bump is refused", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const { accessToken } = await signIn(server);

  // What "sign out everywhere" and a password change will do (Phases 3, 6).
  await server.database.query("UPDATE users SET token_version = token_version + 1");

  await assertUnauthenticated(await server.me(accessToken), "stale version");
});

test("a token whose session has expired is refused", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const { accessToken } = await signIn(server);
  await server.database.query(
    "UPDATE auth_sessions SET created_at = now() - interval '31 days', expires_at = now() - interval '1 second'",
  );

  await assertUnauthenticated(await server.me(accessToken), "expired session");
});

test("a soft-deleted account is refused, and a suspended one told so", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const { accessToken } = await signIn(server);

  await server.database.query("UPDATE users SET status = 'suspended'");
  const suspended = await server.me(accessToken);
  assert.equal(suspended.status, 403);
  assert.equal((await suspended.json()).code, "ACCOUNT_UNAVAILABLE");

  await server.database.query("UPDATE users SET deleted_at = now(), status = 'pending_deletion'");
  await assertUnauthenticated(await server.me(accessToken), "deleted");
});

test("a token naming a session that is not the user's own is refused", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const { accessToken } = await signIn(server);
  const accessTokens = createAccessTokens({ config: BASE_CONFIG.auth.accessToken });
  const { claims } = accessTokens.verify(accessToken);

  // Signed with the real key, so only the database check can catch it: a
  // token minted for a session id that belongs to nobody.
  const mismatched = accessTokens.issue({
    userId: claims.userId,
    sessionId: "00000000-0000-4000-8000-000000000000",
    tokenVersion: 0,
  }).token;

  await assertUnauthenticated(await server.me(mismatched), "foreign session");
});

test("the refresh cookie alone does not authenticate", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const { refreshToken } = await signIn(server);

  // The cookie reaches /api/auth, /me included, but authenticates nothing
  // here: only a bearer token does.
  const response = await server.me(undefined, { cookie: `${COOKIE}=${refreshToken}` });

  await assertUnauthenticated(response, "cookie only");
});
