const assert = require("node:assert/strict");
const test = require("node:test");
const { FORGOT_PASSWORD_MESSAGE } = require("./emailRoutes");
const { hashOpaqueToken } = require("./opaqueTokens");
const { BASE_CONFIG, SKIP, VALID_SIGNUP, readSetCookie, startAuthServer } = require("./testServer");

/**
 * Phase A against a real PostgreSQL: signup's emails, verification, resend,
 * forgot-password and reset. Mail goes to an in-memory mailbox, read after
 * `drainEmail()` because every send happens in the background.
 */

const COOKIE = BASE_CONFIG.auth.cookie.name;
const ADA = Object.freeze({ ...VALID_SIGNUP });
const ADA_ADDRESS = "Ada.Lovelace@Example.com";
const NEW_PASSWORD = "a-brand-new-passphrase";

async function mailTo(server, address) {
  await server.drainEmail();
  return server.mailbox.to(address);
}

async function lastTokenTo(server, address) {
  const messages = await mailTo(server, address);
  return server.mailbox.tokenFrom(messages.at(-1));
}

async function signIn(server, account = ADA) {
  const response = await server.login({ email: account.email, password: account.password });
  assert.equal(response.status, 200, "setup: sign in");
  const body = await response.json();
  return { accessToken: body.accessToken, refreshToken: readSetCookie(response, COOKIE).value };
}

const verify = (server, token, headers) => server.post("/api/auth/verify-email", { token }, headers);
const forgot = (server, email) => server.post("/api/auth/forgot-password", { email });
const reset = (server, token, password = NEW_PASSWORD) =>
  server.post("/api/auth/reset-password", { token, password });
const resend = (server, accessToken) => server.authed("POST", "/api/auth/resend-verification", accessToken, {});

async function isVerified(server, accessToken) {
  const body = await (await server.me(accessToken)).json();
  return body.user.emailVerified;
}

async function expireTokens(server, purpose) {
  await server.database.query(
    `UPDATE account_tokens
     SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
     WHERE purpose = $1`,
    [purpose],
  );
}

// --- Signup --------------------------------------------------------------

test("signing up sends a verification link, and stores only its hash", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);

  assert.equal((await server.signup(ADA)).status, 202);
  const messages = await mailTo(server, ADA_ADDRESS);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].subject, "Confirm your email address for FlowBoard");
  const token = server.mailbox.tokenFrom(messages[0]);
  assert.ok(messages[0].text.includes(`http://localhost:5173/verify-email?token=${token}`));

  const { rows } = await server.database.query("SELECT * FROM account_tokens");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].purpose, "verify_email");
  assert.deepEqual(rows[0].token_hash, hashOpaqueToken(token));
  assert.ok(!JSON.stringify(rows).includes(token), "the raw token is nowhere in the row");
  const hours = (rows[0].expires_at - rows[0].created_at) / 3_600_000;
  assert.equal(hours, 24);
});

test("signing up again with a taken address answers the same and mails the owner instead", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);

  const first = await server.signup(ADA);
  await server.drainEmail();
  const second = await server.signup({ ...ADA, password: "a-different-passphrase", displayName: "Mallory" });

  assert.equal(second.status, first.status);
  assert.deepEqual(await second.json(), await first.json());

  const messages = await mailTo(server, ADA_ADDRESS);
  assert.deepEqual(
    messages.map((message) => message.subject),
    ["Confirm your email address for FlowBoard", "You already have a FlowBoard account"],
  );
  // Addressed to the real owner by their own name, and carrying no token.
  assert.ok(messages[1].text.includes("Hi Ada Lovelace,"));
  assert.equal(server.mailbox.tokenFrom(messages[1]), null);
});

test("with email off, signup still creates the account", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t, { emailTransport: null });

  assert.equal((await server.signup(ADA)).status, 202);
  await server.drainEmail();

  assert.equal(await server.countUsers(), 1);
  assert.equal((await server.database.query("SELECT count(*)::int AS n FROM account_tokens")).rows[0].n, 0);
});

// --- Verification --------------------------------------------------------

test("the emailed link verifies the address, once", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  const token = await lastTokenTo(server, ADA_ADDRESS);
  const { accessToken } = await signIn(server);
  assert.equal(await isVerified(server, accessToken), false);

  const first = await verify(server, token);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true });
  assert.equal(await isVerified(server, accessToken), true);

  const again = await verify(server, token);
  assert.equal(again.status, 400);
  assert.equal((await again.json()).code, "TOKEN_INVALID");
});

test("an expired verification link is refused", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  const token = await lastTokenTo(server, ADA_ADDRESS);
  await expireTokens(server, "verify_email");

  const response = await verify(server, token);

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "TOKEN_INVALID");
  const { accessToken } = await signIn(server);
  assert.equal(await isVerified(server, accessToken), false);
});

test("resending replaces the link: the old one stops working, the new one works", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  const oldToken = await lastTokenTo(server, ADA_ADDRESS);
  const { accessToken } = await signIn(server);

  const response = await resend(server, accessToken);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, alreadyVerified: false });
  const newToken = await lastTokenTo(server, ADA_ADDRESS);
  assert.notEqual(newToken, oldToken);

  assert.equal((await (await verify(server, oldToken)).json()).code, "TOKEN_INVALID");
  assert.equal((await verify(server, newToken)).status, 200);
});

test("anything that is not a live verification token gets one answer", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await server.drainEmail();
  await forgot(server, ADA.email);
  const resetToken = await lastTokenTo(server, ADA_ADDRESS);

  const cases = [
    ["missing", undefined],
    ["not a string", 42],
    ["malformed", "not-a-token"],
    ["well formed, unknown", "A".repeat(43)],
    ["a reset token", resetToken],
  ];
  for (const [label, token] of cases) {
    const response = await verify(server, token);
    assert.equal(response.status, 400, label);
    assert.deepEqual(await response.json(), {
      ok: false,
      code: "TOKEN_INVALID",
      error: "This link has expired or has already been used. Ask for a new one.",
    }, label);
  }
});

test("a link sent to an address the account no longer has proves nothing", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  const token = await lastTokenTo(server, ADA_ADDRESS);
  await server.database.query(
    "UPDATE users SET email = 'ada@elsewhere.test', email_normalized = 'ada@elsewhere.test'",
  );

  const response = await verify(server, token);

  assert.equal((await response.json()).code, "TOKEN_INVALID");
  const { rows } = await server.database.query("SELECT email_verified_at FROM users");
  assert.equal(rows[0].email_verified_at, null);
});

test("verification needs a request from FlowBoard's own pages", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  const token = await lastTokenTo(server, ADA_ADDRESS);

  const forged = await verify(server, token, { origin: "https://evil.test" });

  assert.equal(forged.status, 403);
  assert.equal((await forged.json()).code, "ORIGIN_NOT_ALLOWED");
  // Refused before the token was touched, so the real link still works.
  assert.equal((await verify(server, token)).status, 200);
});

// --- Resend --------------------------------------------------------------

test("resend needs a signed-in account", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);

  const response = await resend(server, undefined);

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "AUTHENTICATION_REQUIRED");
});

test("resend for a verified address sends nothing and says so", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await verify(server, await lastTokenTo(server, ADA_ADDRESS));
  const { accessToken } = await signIn(server);

  const response = await resend(server, accessToken);

  assert.deepEqual(await response.json(), { ok: true, alreadyVerified: true });
  assert.equal((await mailTo(server, ADA_ADDRESS)).length, 1);
});

test("resend stops at the hourly cap for the address", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t, { auth: { emailsPerAddressPerHour: 2 } });
  await server.signup(ADA); // the first of the two
  await server.drainEmail();
  const { accessToken } = await signIn(server);

  assert.equal((await resend(server, accessToken)).status, 202);
  const capped = await resend(server, accessToken);

  assert.equal(capped.status, 429);
  assert.equal((await capped.json()).code, "TOO_MANY_ATTEMPTS");
  assert.ok(Number(capped.headers.get("retry-after")) > 0);
  assert.equal((await mailTo(server, ADA_ADDRESS)).length, 2);
});

test("with email off, resend says so rather than pretending", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t, { emailTransport: null });
  await server.signup(ADA);
  const { accessToken } = await signIn(server);

  const response = await resend(server, accessToken);

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "EMAIL_UNAVAILABLE");
});

// --- Forgot password -----------------------------------------------------

test("forgot-password answers the same whether or not the address has an account", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await server.drainEmail();

  const registered = await forgot(server, ADA.email);
  const unknown = await forgot(server, "nobody@example.com");

  assert.equal(registered.status, 202);
  assert.equal(unknown.status, registered.status);
  const body = await registered.json();
  assert.deepEqual(body, { ok: true, message: FORGOT_PASSWORD_MESSAGE });
  assert.deepEqual(await unknown.json(), body);

  const messages = await mailTo(server, ADA_ADDRESS);
  assert.equal(messages.at(-1).subject, "Reset your FlowBoard password");
  assert.equal((await mailTo(server, "nobody@example.com")).length, 0);
});

test("a reset link is stored hashed and lives thirty minutes", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await forgot(server, ADA.email);
  const token = await lastTokenTo(server, ADA_ADDRESS);

  const { rows } = await server.database.query(
    "SELECT token_hash, created_at, expires_at FROM account_tokens WHERE purpose = 'reset_password'",
  );

  assert.deepEqual(rows[0].token_hash, hashOpaqueToken(token));
  assert.equal((rows[0].expires_at - rows[0].created_at) / 60_000, 30);
});

test("the per-address cap stops the mail but not the answer", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t, { auth: { emailsPerAddressPerHour: 1 } });
  await server.signup(ADA); // spends the one email
  await server.drainEmail();

  const response = await forgot(server, ADA.email);

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, message: FORGOT_PASSWORD_MESSAGE });
  assert.equal((await mailTo(server, ADA_ADDRESS)).length, 1);
});

test("an account with no password gets a reset link only at a verified address", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await server.drainEmail();
  await server.database.query("UPDATE users SET password_hash = NULL, email_verified_at = NULL");

  await forgot(server, ADA.email);
  assert.equal((await mailTo(server, ADA_ADDRESS)).length, 1, "unverified: nothing sent");

  await server.database.query("UPDATE users SET email_verified_at = now()");
  await forgot(server, ADA.email);
  assert.equal((await mailTo(server, ADA_ADDRESS)).at(-1).subject, "Reset your FlowBoard password");
});

test("forgot-password checks the address like signup does", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);

  const response = await forgot(server, "not an address");

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "EMAIL_INVALID");
});

test("with email off, forgot-password says so for every address alike", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t, { emailTransport: null });
  await server.signup(ADA);

  const registered = await forgot(server, ADA.email);
  const unknown = await forgot(server, "nobody@example.com");

  assert.equal(registered.status, 503);
  assert.deepEqual(await registered.json(), await unknown.json());
});

// --- Reset ---------------------------------------------------------------

test("a reset changes the password, ends every session, and tells the owner", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await server.drainEmail();
  const laptop = await signIn(server);
  const phone = await signIn(server);
  const ended = [];
  server.accountEvents.subscribe((event) => ended.push(event));

  await forgot(server, ADA.email);
  const response = await reset(server, await lastTokenTo(server, ADA_ADDRESS));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  // The old password is gone and the new one works.
  assert.equal((await server.login({ email: ADA.email, password: ADA.password })).status, 401);
  assert.equal((await server.login({ email: ADA.email, password: NEW_PASSWORD })).status, 200);

  // Every session from before is over: refresh cookies and access tokens alike.
  for (const device of [laptop, phone]) {
    assert.equal((await (await server.refresh(device.refreshToken)).json()).code, "SESSION_INVALID");
    assert.equal((await server.me(device.accessToken)).status, 401);
  }
  const { rows } = await server.database.query(
    "SELECT DISTINCT revoked_reason FROM auth_sessions WHERE id <> (SELECT id FROM auth_sessions ORDER BY created_at DESC LIMIT 1)",
  );
  assert.deepEqual(rows, [{ revoked_reason: "password_reset" }]);

  const sessionsEnded = ended.find((event) => event.type === "sessions-ended");
  assert.equal(sessionsEnded.sessionIds.length, 2);

  const messages = await mailTo(server, ADA_ADDRESS);
  assert.equal(messages.at(-1).subject, "Your FlowBoard password was changed");
});

test("using a reset link proves the address", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  const verifyToken = await lastTokenTo(server, ADA_ADDRESS);
  await forgot(server, ADA.email);

  await reset(server, await lastTokenTo(server, ADA_ADDRESS));

  const { accessToken } = await signIn(server, { ...ADA, password: NEW_PASSWORD });
  assert.equal(await isVerified(server, accessToken), true);
  // The now-pointless verification link was withdrawn with it.
  assert.equal((await (await verify(server, verifyToken)).json()).code, "TOKEN_INVALID");
});

test("a reset link works once", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await forgot(server, ADA.email);
  const token = await lastTokenTo(server, ADA_ADDRESS);

  assert.equal((await reset(server, token)).status, 200);
  const again = await reset(server, token, "yet-another-passphrase");

  assert.equal(again.status, 400);
  assert.equal((await again.json()).code, "TOKEN_INVALID");
  assert.equal((await server.login({ email: ADA.email, password: NEW_PASSWORD })).status, 200);
});

test("a weak new password is refused without spending the link", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await forgot(server, ADA.email);
  const token = await lastTokenTo(server, ADA_ADDRESS);

  const weak = await reset(server, token, "short");

  assert.equal(weak.status, 400);
  assert.equal((await weak.json()).code, "PASSWORD_TOO_SHORT");
  assert.equal((await reset(server, token)).status, 200);
});

test("an expired or replaced reset link is refused", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await forgot(server, ADA.email);
  const first = await lastTokenTo(server, ADA_ADDRESS);
  await forgot(server, ADA.email);
  const second = await lastTokenTo(server, ADA_ADDRESS);

  assert.equal((await (await reset(server, first)).json()).code, "TOKEN_INVALID", "replaced");

  await expireTokens(server, "reset_password");
  assert.equal((await (await reset(server, second)).json()).code, "TOKEN_INVALID", "expired");
  assert.equal((await server.login({ email: ADA.email, password: ADA.password })).status, 200);
});

test("a verification token cannot reset a password", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);

  const response = await reset(server, await lastTokenTo(server, ADA_ADDRESS));

  assert.equal((await response.json()).code, "TOKEN_INVALID");
  assert.equal((await server.login({ email: ADA.email, password: ADA.password })).status, 200);
});

test("a reset clears the sign-in backoff someone built up on the address", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t, { auth: { loginBackoffThreshold: 2 } });
  await server.signup(ADA);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await server.login({ email: ADA.email, password: "wrong-wrong-wrong" });
  }
  assert.equal((await server.login({ email: ADA.email, password: ADA.password })).status, 429);

  await forgot(server, ADA.email);
  await reset(server, await lastTokenTo(server, ADA_ADDRESS));

  assert.equal((await server.login({ email: ADA.email, password: NEW_PASSWORD })).status, 200);
});

test("no token and no password reaches the log", { skip: SKIP }, async (t) => {
  const lines = [];
  const record = (...args) => lines.push(JSON.stringify(args));
  const server = await startAuthServer(t, { logger: { info: record, warn: record, error: record } });

  await server.signup(ADA);
  const verifyToken = await lastTokenTo(server, ADA_ADDRESS);
  await verify(server, verifyToken);
  await verify(server, verifyToken); // refused, and logged as such
  await forgot(server, ADA.email);
  const resetToken = await lastTokenTo(server, ADA_ADDRESS);
  await reset(server, resetToken, "short");
  await reset(server, resetToken);
  await server.drainEmail();

  const logged = lines.join("\n");
  assert.ok(lines.length > 5);
  for (const secret of [verifyToken, resetToken, ADA.password, NEW_PASSWORD, ADA.email, ADA_ADDRESS]) {
    assert.ok(!logged.includes(secret), `logged: ${secret}`);
  }
});

test("resend refuses an access token whose session has ended", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await server.drainEmail();
  const { accessToken, refreshToken } = await signIn(server);
  await server.logout(refreshToken);

  const response = await resend(server, accessToken);

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "AUTHENTICATION_REQUIRED");
  assert.equal((await mailTo(server, ADA_ADDRESS)).length, 1);
});

test("a reset link sent to an address the account no longer has is refused", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  await server.signup(ADA);
  await forgot(server, ADA.email);
  const token = await lastTokenTo(server, ADA_ADDRESS);
  await server.database.query(
    "UPDATE users SET email = 'ada@elsewhere.test', email_normalized = 'ada@elsewhere.test'",
  );

  const response = await reset(server, token);

  assert.equal((await response.json()).code, "TOKEN_INVALID");
  assert.equal((await server.login({ email: "ada@elsewhere.test", password: ADA.password })).status, 200);
});
