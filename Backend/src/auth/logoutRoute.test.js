const assert = require("node:assert/strict");
const test = require("node:test");
const { generateRefreshToken, hashRefreshToken } = require("./refreshTokens");
const {
  BASE_CONFIG,
  SKIP,
  VALID_SIGNUP,
  readSetCookie,
  startAuthServer,
} = require("./testServer");

/** POST /api/auth/logout against a real PostgreSQL (chunk 2.5). */

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
  return readSetCookie(response, COOKIE).value;
}

const sessionFor = async (server, token) =>
  (
    await server.database.query(
      `SELECT s.* FROM auth_sessions s
       JOIN refresh_tokens t ON t.session_id = s.id
       WHERE t.token_hash = $1`,
      [hashRefreshToken(token)],
    )
  ).rows[0];

/** Every logout answers the same way and clears the cookie, whatever it was given. */
async function assertSignedOut(response, label) {
  assert.equal(response.status, 200, label);
  assert.deepEqual(await response.json(), { ok: true }, label);

  const cleared = readSetCookie(response, COOKIE);
  assert.ok(cleared, `${label}: expected the cookie to be cleared`);
  assert.equal(cleared.value, "", label);
  assert.equal(cleared.attributes.path, "/api/auth", label);
}

test("signing out ends the session and clears the cookie", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const token = await signIn(server);

  await assertSignedOut(await server.logout(token), "logout");

  const session = await sessionFor(server, token);
  assert.ok(session.revoked_at instanceof Date);
  assert.equal(session.revoked_reason, "logout");
});

test("a signed-out session cannot be refreshed", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const token = await signIn(server);

  await server.logout(token);
  const response = await server.refresh(token);

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "SESSION_INVALID");
});

test("signing out on one device leaves the others signed in", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const laptop = await signIn(server);
  const phone = await signIn(server);

  await server.logout(laptop);

  assert.equal((await server.refresh(phone)).status, 200);
  assert.equal((await sessionFor(server, phone)).revoked_at, null);
});

test("any token of the session ends it, including one already exchanged", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const first = await signIn(server);
  const current = readSetCookie(await server.refresh(first), COOKIE).value;

  // The browser may hold an older cookie than the server's newest token, for
  // example after a response it never received.
  await assertSignedOut(await server.logout(first), "logout with a spent token");

  assert.equal((await server.refresh(current)).status, 401);
});

test("signing out without a live session still answers ok and clears the cookie", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const token = await signIn(server);

  await assertSignedOut(await server.logout(null), "no cookie");
  await assertSignedOut(await server.logout("not-a-token"), "malformed cookie");
  await assertSignedOut(await server.logout(generateRefreshToken().token), "unknown token");

  // None of those touched the real session.
  assert.equal((await sessionFor(server, token)).revoked_at, null);
});

test("signing out twice is harmless and keeps the first revocation", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const token = await signIn(server);

  await server.logout(token);
  const first = await sessionFor(server, token);
  await assertSignedOut(await server.logout(token), "second logout");
  const second = await sessionFor(server, token);

  assert.deepEqual(second.revoked_at, first.revoked_at);
});

test("a logout never relabels a session revoked for theft", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const token = await signIn(server);
  await server.database.query(
    "UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'reuse_detected'",
  );

  await assertSignedOut(await server.logout(token), "logout after reuse detection");

  // The record of the theft is what an investigation, and Phase 3's session
  // list, will rely on.
  assert.equal((await sessionFor(server, token)).revoked_reason, "reuse_detected");
});
