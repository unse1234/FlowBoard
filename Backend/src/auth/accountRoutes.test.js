const assert = require("node:assert/strict");
const test = require("node:test");
const { BASE_CONFIG, SKIP, VALID_SIGNUP, readSetCookie, startAuthServer } = require("./testServer");
const { createUserRepository } = require("./userRepository");

/**
 * Account settings (spec Phase B): the display name, and changing or setting
 * a password. Against a real PostgreSQL.
 */

const COOKIE = BASE_CONFIG.auth.cookie.name;
const ADA = Object.freeze({ ...VALID_SIGNUP });
const NEW_PASSWORD = "a-brand-new-passphrase";

async function signIn(server, password = ADA.password) {
  const response = await server.login({ email: ADA.email, password });
  assert.equal(response.status, 200, "setup: sign in");
  const body = await response.json();
  return { accessToken: body.accessToken, refreshToken: readSetCookie(response, COOKIE).value };
}

async function serverWithAda(t, options) {
  const server = await startAuthServer(t, options);
  assert.equal((await server.signup(ADA)).status, 202, "setup: signup");
  await server.drainEmail();
  return server;
}

const rename = (server, accessToken, displayName) =>
  server.authed("PATCH", "/api/auth/me", accessToken, { displayName });
const changePassword = (server, accessToken, body) => server.authed("POST", "/api/auth/password", accessToken, body);

// --- Display name --------------------------------------------------------

test("the display name changes, trimmed, and nothing else does", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t);
  const { accessToken } = await signIn(server);

  const response = await rename(server, accessToken, "  Augusta Ada King  ");

  assert.equal(response.status, 200);
  const { user } = await response.json();
  assert.equal(user.displayName, "Augusta Ada King");
  assert.equal(user.email, ADA.email);
  const me = await (await server.me(accessToken)).json();
  assert.equal(me.user.displayName, "Augusta Ada King");
  // The same session keeps working: a name grants nothing to revoke.
  assert.equal((await server.me(accessToken)).status, 200);
});

test("a name follows the signup rules", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t);
  const { accessToken } = await signIn(server);

  for (const [name, code] of [
    ["   ", "DISPLAY_NAME_REQUIRED"],
    ["x".repeat(81), "DISPLAY_NAME_TOO_LONG"],
    [`Ada${String.fromCodePoint(0x202e)}ecalevoL`, "DISPLAY_NAME_REQUIRED"],
    [42, "DISPLAY_NAME_REQUIRED"],
  ]) {
    const response = await rename(server, accessToken, name);
    assert.equal(response.status, 400, String(name));
    assert.equal((await response.json()).code, code, String(name));
  }
});

test("renaming needs a live session", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t);
  const { accessToken, refreshToken } = await signIn(server);
  await server.logout(refreshToken);

  assert.equal((await rename(server, undefined, "Nobody")).status, 401);
  assert.equal((await rename(server, accessToken, "After sign-out")).status, 401);
});

// --- Changing a password -------------------------------------------------

test("changing the password needs the current one, and says which part is wrong", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t);
  const { accessToken } = await signIn(server);

  const missing = await changePassword(server, accessToken, { newPassword: NEW_PASSWORD });
  assert.equal((await missing.json()).code, "CURRENT_PASSWORD_REQUIRED");

  const wrong = await changePassword(server, accessToken, { currentPassword: "not-my-password", newPassword: NEW_PASSWORD });
  assert.equal(wrong.status, 400);
  assert.equal((await wrong.json()).code, "CURRENT_PASSWORD_INCORRECT");

  const weak = await changePassword(server, accessToken, { currentPassword: ADA.password, newPassword: "short" });
  assert.equal((await weak.json()).code, "PASSWORD_TOO_SHORT");

  // None of those changed anything.
  assert.equal((await server.login({ email: ADA.email, password: ADA.password })).status, 200);
});

test("a change ends every session and hands this device a new one", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t);
  const phone = await signIn(server);
  const laptop = await signIn(server);
  const events = [];
  server.accountEvents.subscribe((event) => events.push(event));

  const response = await changePassword(server, laptop.accessToken, {
    currentPassword: ADA.password,
    newPassword: NEW_PASSWORD,
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  const cookie = readSetCookie(response, COOKIE);
  assert.ok(cookie?.value, "a new refresh cookie");

  // Every earlier session is over, this device's old one included.
  for (const device of [phone, laptop]) {
    assert.equal((await (await server.refresh(device.refreshToken)).json()).code, "SESSION_INVALID");
    assert.equal((await server.me(device.accessToken)).status, 401);
  }
  // The new one works, with the new password.
  assert.equal((await server.me(body.accessToken)).status, 200);
  assert.equal((await server.refresh(cookie.value)).status, 200);
  assert.equal((await server.login({ email: ADA.email, password: ADA.password })).status, 401);
  assert.equal((await server.login({ email: ADA.email, password: NEW_PASSWORD })).status, 200);

  const ended = events.find((event) => event.type === "sessions-ended");
  assert.equal(ended.sessionIds.length, 2);
  const { rows } = await server.database.query(
    "SELECT count(*)::int AS n FROM auth_sessions WHERE revoked_reason = 'password_changed'",
  );
  assert.equal(rows[0].n, 2);

  await server.drainEmail();
  assert.equal(server.mailbox.sent.at(-1).subject, "Your FlowBoard password was changed");
});

test("guessing the current password runs into the sign-in backoff", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t, { auth: { loginBackoffThreshold: 2 } });
  const { accessToken } = await signIn(server);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await changePassword(server, accessToken, { currentPassword: `guess-${attempt}-guess`, newPassword: NEW_PASSWORD });
  }
  const blocked = await changePassword(server, accessToken, { currentPassword: ADA.password, newPassword: NEW_PASSWORD });

  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).code, "TOO_MANY_ATTEMPTS");
});

test("a reset link sent before the change stops working", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t);
  const { accessToken } = await signIn(server);
  await server.post("/api/auth/forgot-password", { email: ADA.email });
  await server.drainEmail();
  const resetToken = server.mailbox.tokenFrom(server.mailbox.sent.at(-1));

  await changePassword(server, accessToken, { currentPassword: ADA.password, newPassword: NEW_PASSWORD });

  const late = await server.post("/api/auth/reset-password", { token: resetToken, password: "an-attacker-passphrase" });
  assert.equal((await late.json()).code, "TOKEN_INVALID");
});

// --- Setting a first password ---------------------------------------------

test("an account without a password must prove itself again before setting one", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t);
  const { accessToken } = await signIn(server);
  await server.database.query("UPDATE users SET password_hash = NULL");

  const refused = await changePassword(server, accessToken, { newPassword: NEW_PASSWORD });
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).code, "REAUTHENTICATION_REQUIRED");

  // A provider sign-in eleven minutes ago is too old.
  await server.database.query("UPDATE auth_sessions SET reauthenticated_at = now() - interval '11 minutes'");
  assert.equal((await (await changePassword(server, accessToken, { newPassword: NEW_PASSWORD })).json()).code,
    "REAUTHENTICATION_REQUIRED");

  await server.database.query("UPDATE auth_sessions SET reauthenticated_at = now()");
  const response = await changePassword(server, accessToken, { newPassword: NEW_PASSWORD });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.hasPassword, true);
  assert.equal((await server.login({ email: ADA.email, password: NEW_PASSWORD })).status, 200);
  await server.drainEmail();
  assert.equal(server.mailbox.sent.at(-1).subject, "A password was added to your FlowBoard account");
});

test("a password changed by someone else meanwhile is not overwritten", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t);
  const users = createUserRepository({ database: server.database });
  const account = (await server.database.query("SELECT id, password_hash FROM users")).rows[0];

  const stale = await users.replacePassword({ userId: account.id, passwordHash: "$argon2id$new", expectedHash: "$argon2id$old" });
  const current = await users.replacePassword({
    userId: account.id,
    passwordHash: account.password_hash,
    expectedHash: account.password_hash,
  });

  assert.equal(stale, null);
  assert.ok(current);
});

test("settings refuse a request from another site", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t);
  const { accessToken } = await signIn(server);

  const response = await fetch(`${server.baseUrl}/api/auth/password`, {
    method: "POST",
    headers: {
      origin: "https://evil.test",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ currentPassword: ADA.password, newPassword: NEW_PASSWORD }),
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ORIGIN_NOT_ALLOWED");
});

test("a change racing another change on the same account loses rather than overwrites", { skip: SKIP }, async (t) => {
  const server = await serverWithAda(t);
  const { accessToken } = await signIn(server);

  // Just before the route's update, another request changes the password.
  const transaction = server.database.transaction.bind(server.database);
  server.database.transaction = (work) =>
    transaction((tx) =>
      work({
        ...tx,
        query: async (text, values) => {
          if (/UPDATE users\s+SET password_hash = \$2/.test(text)) {
            await server.database.query("UPDATE users SET password_hash = 'changed-by-another-request'");
          }
          return tx.query(text, values);
        },
      }),
    );

  const response = await changePassword(server, accessToken, { currentPassword: ADA.password, newPassword: NEW_PASSWORD });

  assert.equal(response.status, 401);
  const { rows } = await server.database.query("SELECT password_hash FROM users");
  assert.equal(rows[0].password_hash, "changed-by-another-request");
});
