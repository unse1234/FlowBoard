const assert = require("node:assert/strict");
const test = require("node:test");
const { createAccessTokens } = require("./accessTokens");
const { generateRefreshToken, hashRefreshToken } = require("./refreshTokens");
const {
  BASE_CONFIG,
  SKIP,
  VALID_SIGNUP,
  readSetCookie,
  startAuthServer,
} = require("./testServer");

/**
 * POST /api/auth/refresh against a real PostgreSQL (chunk 2.4).
 *
 * Rotation, reuse detection and the grace window all depend on row locks and
 * on what one transaction can see of another, so a fake database would prove
 * nothing here.
 */

const COOKIE = BASE_CONFIG.auth.cookie.name;
const CREDENTIALS = Object.freeze({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });
const accessTokens = createAccessTokens({ config: BASE_CONFIG.auth.accessToken });

const SESSION_INVALID = Object.freeze({
  ok: false,
  code: "SESSION_INVALID",
  error: "Your session has ended. Sign in again.",
});

/** A server with one account, signed in once. */
async function signedIn(t, options) {
  const server = await startAuthServer(t, options);
  assert.equal((await server.signup(VALID_SIGNUP)).status, 202, "setup: signup");

  const login = await server.login(CREDENTIALS);
  assert.equal(login.status, 200, "setup: login");

  return { server, token: readSetCookie(login, COOKIE).value };
}

const query = async (server, sql, values) => (await server.database.query(sql, values)).rows;

const tokenRow = async (server, token) =>
  (await query(server, "SELECT * FROM refresh_tokens WHERE token_hash = $1", [hashRefreshToken(token)]))[0];

const sessionRow = async (server) => (await query(server, "SELECT * FROM auth_sessions"))[0];

/** Make an exchanged token look as if it were exchanged a while ago, past the grace window. */
const ageConsumption = (server, token) =>
  server.database.query(
    "UPDATE refresh_tokens SET consumed_at = now() - interval '5 minutes' WHERE token_hash = $1",
    [hashRefreshToken(token)],
  );

/** Asserts the response is the uniform refusal, and that it clears the cookie. */
async function assertSessionInvalid(response, label) {
  assert.equal(response.status, 401, label);
  assert.deepEqual(await response.json(), SESSION_INVALID, label);

  const cleared = readSetCookie(response, COOKIE);
  assert.ok(cleared, `${label}: expected the cookie to be cleared`);
  assert.equal(cleared.value, "", label);
  assert.equal(cleared.attributes.path, "/api/auth", label);
}

test("a refresh exchanges the cookie for new tokens bound to the same session", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);

  const response = await server.refresh(token);
  const payload = await response.json();
  const successor = readSetCookie(response, COOKIE);
  const session = await sessionRow(server);
  const verified = accessTokens.verify(payload.accessToken);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(payload).sort(), ["accessToken", "accessTokenExpiresAt", "ok", "user"]);
  assert.equal(payload.user.email, VALID_SIGNUP.email);

  assert.equal(verified.valid, true, verified.reason);
  assert.equal(verified.claims.sessionId, session.id);
  assert.equal(verified.claims.userId, payload.user.id);

  assert.notEqual(successor.value, token);
  assert.equal(successor.attributes.httponly, true);
  assert.equal(successor.attributes.path, "/api/auth");

  // The presented token is spent, and its successor stored as a hash.
  assert.ok((await tokenRow(server, token)).consumed_at instanceof Date);
  assert.equal((await tokenRow(server, successor.value)).consumed_at, null);
});

test("each successor refreshes in turn, all within one session", { skip: SKIP }, async (t) => {
  const { server, token: first } = await signedIn(t);

  let token = first;
  for (let round = 0; round < 3; round += 1) {
    const response = await server.refresh(token);
    assert.equal(response.status, 200, `round ${round}`);
    token = readSetCookie(response, COOKIE).value;
  }

  assert.equal((await query(server, "SELECT id FROM auth_sessions")).length, 1);
  assert.equal((await query(server, "SELECT id FROM refresh_tokens")).length, 4);
  assert.equal(
    (await query(server, "SELECT id FROM refresh_tokens WHERE consumed_at IS NULL")).length,
    1,
  );
});

test("a refresh moves last_used_at, and never the session's expiry", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);
  await server.database.query("UPDATE auth_sessions SET last_used_at = now() - interval '1 day'");
  const before = await sessionRow(server);

  await server.refresh(token);
  const after = await sessionRow(server);

  assert.ok(after.last_used_at > before.last_used_at);
  // Rotation extends a token, never the sign-in (E-13).
  assert.deepEqual(after.expires_at, before.expires_at);
});

test("the successor never outlives the session", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);
  await server.database.query("UPDATE auth_sessions SET expires_at = now() + interval '1 hour'");

  const successor = readSetCookie(await server.refresh(token), COOKIE).value;

  assert.deepEqual((await tokenRow(server, successor)).expires_at, (await sessionRow(server)).expires_at);
});

test("a replayed token revokes the session, and with it every successor", { skip: SKIP }, async (t) => {
  const { server, token: stolen } = await signedIn(t);

  // The owner refreshes. The thief, holding the old token, tries later.
  const successor = readSetCookie(await server.refresh(stolen), COOKIE).value;
  await ageConsumption(server, stolen);

  await assertSessionInvalid(await server.refresh(stolen), "replay");

  const session = await sessionRow(server);
  assert.ok(session.revoked_at instanceof Date);
  assert.equal(session.revoked_reason, "reuse_detected");

  // The owner's perfectly good successor is gone too. That is the point: the
  // server cannot tell which holder is the thief, so both sign in again.
  await assertSessionInvalid(await server.refresh(successor), "successor after revocation");
});

test("a replay within the grace window is a race, not a theft", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);

  const first = await server.refresh(token);
  // The same token again, immediately: a second tab, or a retry after a lost
  // response.
  const second = await server.refresh(token);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await sessionRow(server)).revoked_at, null);

  // Each got a token of its own, and both work.
  const a = readSetCookie(first, COOKIE).value;
  const b = readSetCookie(second, COOKIE).value;
  assert.notEqual(a, b);
  assert.equal((await server.refresh(a)).status, 200);
  assert.equal((await server.refresh(b)).status, 200);
});

test("with no grace window, an immediate replay is reuse", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t, {
    auth: { refreshToken: { ...BASE_CONFIG.auth.refreshToken, reuseGraceSeconds: 0 } },
  });

  assert.equal((await server.refresh(token)).status, 200);
  await assertSessionInvalid(await server.refresh(token), "immediate replay");
  assert.equal((await sessionRow(server)).revoked_reason, "reuse_detected");
});

test("concurrent refreshes of one token all succeed and revoke nothing", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);

  // Five tabs waking at once. They queue on the session row's lock; the first
  // rotates and the rest land in the grace window.
  const responses = await Promise.all(Array.from({ length: 5 }, () => server.refresh(token)));

  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200, 200, 200, 200],
  );
  assert.equal((await sessionRow(server)).revoked_at, null);

  const issued = new Set(responses.map((response) => readSetCookie(response, COOKIE).value));
  assert.equal(issued.size, 5, "every response carries a distinct token");
  assert.equal(
    (await query(server, "SELECT id FROM refresh_tokens WHERE consumed_at IS NOT NULL")).length,
    1,
    "the presented token is consumed exactly once",
  );
});

test("concurrent replays of a long-spent token revoke once and admit no one", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);
  await server.refresh(token);
  await ageConsumption(server, token);

  const responses = await Promise.all(Array.from({ length: 5 }, () => server.refresh(token)));

  for (const response of responses) await assertSessionInvalid(response, "concurrent replay");
  assert.equal((await sessionRow(server)).revoked_reason, "reuse_detected");
});

test("every refusal looks the same from outside", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);

  // Each case below reaches a different branch. None of them may be told apart.
  await assertSessionInvalid(await server.refresh(null), "no cookie");
  await assertSessionInvalid(await server.refresh("not-a-token"), "malformed cookie");
  await assertSessionInvalid(await server.refresh(generateRefreshToken().token), "unknown token");

  await server.database.query(
    "UPDATE refresh_tokens SET created_at = now() - interval '20 days', expires_at = now() - interval '1 day'",
  );
  await assertSessionInvalid(await server.refresh(token), "idle-expired token");
  // An expired token is dead, not evidence of theft.
  assert.equal((await sessionRow(server)).revoked_at, null);
});

test("an expired session refuses even a fresh token", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);
  await server.database.query(
    "UPDATE auth_sessions SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day'",
  );

  await assertSessionInvalid(await server.refresh(token), "expired session");
});

test("a session revoked for any reason refuses its tokens", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);
  await server.database.query(
    "UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'revoked_by_user'",
  );

  await assertSessionInvalid(await server.refresh(token), "revoked session");
  // No token was spent on the attempt.
  assert.equal((await tokenRow(server, token)).consumed_at, null);
});

test("a soft-deleted account's session refuses to refresh", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);
  await server.database.query("UPDATE users SET deleted_at = now(), status = 'pending_deletion'");

  await assertSessionInvalid(await server.refresh(token), "deleted account");
});

test("a suspended account is told so, and its session is kept", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);
  await server.database.query("UPDATE users SET status = 'suspended'");

  const response = await server.refresh(token);

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ACCOUNT_UNAVAILABLE");
  // A suspension can be lifted. Nothing here ends the session, and the token
  // is not spent.
  assert.equal(readSetCookie(response, COOKIE), null);
  assert.equal((await sessionRow(server)).revoked_at, null);
  assert.equal((await tokenRow(server, token)).consumed_at, null);
});

test("a refreshed access token carries the current token_version", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);
  await server.database.query("UPDATE users SET token_version = token_version + 1");

  const { accessToken } = await (await server.refresh(token)).json();

  assert.equal(accessTokens.verify(accessToken).claims.tokenVersion, 1);
});

test("a cookie sent twice is refused rather than guessed at", { skip: SKIP }, async (t) => {
  const { server, token } = await signedIn(t);
  const planted = generateRefreshToken().token;

  const response = await server.post("/api/auth/refresh", {}, {
    cookie: `${COOKIE}=${planted}; ${COOKIE}=${token}`,
  });

  await assertSessionInvalid(response, "duplicated cookie");
  // The genuine token was never touched.
  assert.equal((await tokenRow(server, token)).consumed_at, null);
});
