const assert = require("node:assert/strict");
const test = require("node:test");
const { BASE_CONFIG, SKIP, VALID_SIGNUP, readSetCookie, startAuthServer } = require("./testServer");

/**
 * The session list and its revocation routes (chunk 3.2), against a real
 * PostgreSQL. The negative cases, one account reaching into another's
 * sessions, carry the most weight.
 */

const COOKIE = BASE_CONFIG.auth.cookie.name;
const ADA = Object.freeze({ ...VALID_SIGNUP });
const GRACE = Object.freeze({ email: "grace@example.com", password: "another-fine-passphrase", displayName: "Grace Hopper" });

async function serverWithAccounts(t) {
  const server = await startAuthServer(t);
  for (const account of [ADA, GRACE]) {
    assert.equal((await server.signup(account)).status, 202, `setup: signup ${account.email}`);
  }
  return server;
}

/** Sign in as if from a named device, returning its tokens and session id. */
async function device(server, account, userAgent) {
  const response = await server.login({ email: account.email, password: account.password }, { "user-agent": userAgent });
  assert.equal(response.status, 200, `setup: login ${userAgent}`);
  const { accessToken } = await response.json();
  const { rows } = await server.database.query(
    "SELECT id FROM auth_sessions WHERE user_agent = $1 ORDER BY created_at DESC LIMIT 1",
    [userAgent],
  );
  return { accessToken, refreshToken: readSetCookie(response, COOKIE).value, sessionId: rows[0].id };
}

const list = async (server, accessToken) => {
  const response = await server.authed("GET", "/api/auth/sessions", accessToken);
  return { status: response.status, body: await response.json() };
};

test("the list shows every live device, most recent first, with this one marked", { skip: SKIP }, async (t) => {
  const server = await serverWithAccounts(t);
  const laptop = await device(server, ADA, "Laptop/1.0");
  const phone = await device(server, ADA, "Phone/1.0");

  const { status, body } = await list(server, phone.accessToken);

  assert.equal(status, 200);
  assert.deepEqual(
    body.sessions.map((session) => [session.userAgent, session.current]),
    [
      ["Phone/1.0", true],
      ["Laptop/1.0", false],
    ],
  );
  assert.ok(body.sessions.every((session) => /^[0-9a-f-]{36}$/.test(session.id)));
  assert.match(body.sessions[0].ipAddress, /127\.0\.0\.1/);
  assert.ok(!Number.isNaN(Date.parse(body.sessions[0].lastUsedAt)));
  assert.equal(laptop.sessionId !== phone.sessionId, true);
});

test("the list never includes another account's sessions", { skip: SKIP }, async (t) => {
  const server = await serverWithAccounts(t);
  const ada = await device(server, ADA, "Ada/1.0");
  await device(server, GRACE, "Grace/1.0");

  const { body } = await list(server, ada.accessToken);

  assert.deepEqual(
    body.sessions.map((session) => session.userAgent),
    ["Ada/1.0"],
  );
});

test("ended and expired sessions drop off the list", { skip: SKIP }, async (t) => {
  const server = await serverWithAccounts(t);
  const current = await device(server, ADA, "Current/1.0");
  const signedOut = await device(server, ADA, "SignedOut/1.0");
  await device(server, ADA, "Expired/1.0");
  await server.logout(signedOut.refreshToken);
  await server.database.query(
    "UPDATE auth_sessions SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day' WHERE user_agent = 'Expired/1.0'",
  );

  const { body } = await list(server, current.accessToken);

  assert.deepEqual(
    body.sessions.map((session) => session.userAgent),
    ["Current/1.0"],
  );
});

test("ending a device's session signs that device out", { skip: SKIP }, async (t) => {
  const server = await serverWithAccounts(t);
  const laptop = await device(server, ADA, "Laptop/1.0");
  const phone = await device(server, ADA, "Phone/1.0");

  const response = await server.authed("DELETE", `/api/auth/sessions/${laptop.sessionId}`, phone.accessToken);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  // The laptop can no longer refresh; the phone carries on.
  assert.equal((await server.refresh(laptop.refreshToken)).status, 401);
  assert.equal((await server.refresh(phone.refreshToken)).status, 200);
  const { rows } = await server.database.query("SELECT revoked_reason FROM auth_sessions WHERE id = $1", [
    laptop.sessionId,
  ]);
  assert.equal(rows[0].revoked_reason, "revoked_by_user");
});

test("one account cannot end another account's session, nor learn that it exists", { skip: SKIP }, async (t) => {
  const server = await serverWithAccounts(t);
  const ada = await device(server, ADA, "Ada/1.0");
  const grace = await device(server, GRACE, "Grace/1.0");

  const reachingIn = await server.authed("DELETE", `/api/auth/sessions/${grace.sessionId}`, ada.accessToken);
  const madeUp = await server.authed("DELETE", "/api/auth/sessions/00000000-0000-4000-8000-000000000000", ada.accessToken);
  const malformed = await server.authed("DELETE", "/api/auth/sessions/not-an-id", ada.accessToken);

  // Grace's session is untouched, and all three answers are the same.
  assert.equal((await server.refresh(grace.refreshToken)).status, 200);
  const bodies = [];
  for (const response of [reachingIn, madeUp, malformed]) {
    assert.equal(response.status, 404);
    bodies.push(await response.json());
  }
  assert.deepEqual(bodies[0], { ok: false, code: "SESSION_NOT_FOUND", error: "That session has already ended." });
  assert.deepEqual(bodies[1], bodies[0]);
  assert.deepEqual(bodies[2], bodies[0]);
});

test("ending a session twice answers as if it were never there", { skip: SKIP }, async (t) => {
  const server = await serverWithAccounts(t);
  const laptop = await device(server, ADA, "Laptop/1.0");
  const phone = await device(server, ADA, "Phone/1.0");

  await server.authed("DELETE", `/api/auth/sessions/${laptop.sessionId}`, phone.accessToken);
  const again = await server.authed("DELETE", `/api/auth/sessions/${laptop.sessionId}`, phone.accessToken);

  assert.equal(again.status, 404);
});

test("signing out everywhere else keeps this device and ends the rest", { skip: SKIP }, async (t) => {
  const server = await serverWithAccounts(t);
  const laptop = await device(server, ADA, "Laptop/1.0");
  const tablet = await device(server, ADA, "Tablet/1.0");
  const phone = await device(server, ADA, "Phone/1.0");
  const grace = await device(server, GRACE, "Grace/1.0");

  const response = await server.authed("POST", "/api/auth/sessions/revoke-others", phone.accessToken, {});

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, revoked: 2 });
  assert.equal((await server.refresh(laptop.refreshToken)).status, 401);
  assert.equal((await server.refresh(tablet.refreshToken)).status, 401);
  assert.equal((await server.refresh(phone.refreshToken)).status, 200);
  // Another account is never touched.
  assert.equal((await server.refresh(grace.refreshToken)).status, 200);
});

test("the session routes need a live session, not just a well-signed token", { skip: SKIP }, async (t) => {
  const server = await serverWithAccounts(t);
  const laptop = await device(server, ADA, "Laptop/1.0");
  const phone = await device(server, ADA, "Phone/1.0");
  await server.logout(phone.refreshToken);

  // The phone's access token still verifies, but its session has ended.
  const listing = await server.authed("GET", "/api/auth/sessions", phone.accessToken);
  const ending = await server.authed("DELETE", `/api/auth/sessions/${laptop.sessionId}`, phone.accessToken);
  const everywhere = await server.authed("POST", "/api/auth/sessions/revoke-others", phone.accessToken, {});
  const anonymous = await server.authed("GET", "/api/auth/sessions", undefined);

  for (const response of [listing, ending, everywhere, anonymous]) {
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate") ?? "", /^Bearer realm="flowboard"/);
  }
  // The laptop survived the refused attempt.
  assert.equal((await server.refresh(laptop.refreshToken)).status, 200);
});

test("the session routes are behind the CSRF check like the rest of auth", { skip: SKIP }, async (t) => {
  const server = await serverWithAccounts(t);
  const laptop = await device(server, ADA, "Laptop/1.0");
  const phone = await device(server, ADA, "Phone/1.0");

  const forged = await fetch(`${server.baseUrl}/api/auth/sessions/${laptop.sessionId}`, {
    method: "DELETE",
    headers: { origin: "https://evil.example", authorization: `Bearer ${phone.accessToken}` },
  });

  assert.equal(forged.status, 403);
  assert.equal((await server.refresh(laptop.refreshToken)).status, 200);
});
