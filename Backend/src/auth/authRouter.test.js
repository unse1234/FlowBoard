const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../server");
const {
  BASE_CONFIG: CONFIG,
  SILENT_LOGGER,
  SKIP,
  VALID_SIGNUP: VALID,
  startAuthServer: startServer,
} = require("./testServer");

/**
 * POST /api/auth/signup against a real PostgreSQL.
 *
 * The behaviour that matters most — that a taken address is indistinguishable
 * from a free one — depends on a real unique index, so a fake database would
 * prove nothing. The shared harness lives in testServer.js because the login
 * tests and, later, the token tests need the same one.
 */

const countUsers = async (database) =>
  (await database.query("SELECT count(*)::int AS count FROM users")).rows[0].count;

test("signup creates an account", { skip: SKIP }, async (t) => {
  const { database, signup } = await startServer(t);

  const response = await signup(VALID);

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });

  const { rows } = await database.query(
    "SELECT email, email_normalized, display_name, password_hash, token_version FROM users",
  );
  assert.equal(rows.length, 1);
  // Stored as typed, matched on normalised.
  assert.equal(rows[0].email, "Ada.Lovelace@Example.com");
  assert.equal(rows[0].email_normalized, "ada.lovelace@example.com");
  assert.equal(rows[0].display_name, "Ada Lovelace");
  assert.equal(rows[0].token_version, 0);
  // Hashed, never stored in the clear.
  assert.match(rows[0].password_hash, /^\$argon2id\$/);
  assert.equal(rows[0].password_hash.includes(VALID.password), false);
});

test("signing up twice is indistinguishable from signing up once", { skip: SKIP }, async (t) => {
  const { database, signup } = await startServer(t);

  const first = await signup(VALID);
  const second = await signup({ ...VALID, password: "a-completely-different-one" });

  // The whole of E-12: an attacker must not be able to tell that the address
  // was taken, from the status or from the body.
  assert.equal(first.status, second.status);
  assert.deepEqual(await first.json(), await second.json());
  // And no second account, nor an overwritten password.
  assert.equal(await countUsers(database), 1);
});

test("a taken address is not revealed by differing case", { skip: SKIP }, async (t) => {
  const { database, signup } = await startServer(t);

  await signup(VALID);
  const again = await signup({ ...VALID, email: "ADA.LOVELACE@EXAMPLE.COM" });

  assert.equal(again.status, 202);
  assert.equal(await countUsers(database), 1);
});

test("the second signup does not overwrite the first password", { skip: SKIP }, async (t) => {
  const { database, signup } = await startServer(t);

  await signup(VALID);
  const before = (await database.query("SELECT password_hash FROM users")).rows[0].password_hash;

  await signup({ ...VALID, password: "an-attackers-chosen-password" });
  const after = (await database.query("SELECT password_hash FROM users")).rows[0].password_hash;

  // Otherwise signup would be an account takeover for any known address.
  assert.equal(before, after);
});

test("concurrent signups for one address create one account", { skip: SKIP }, async (t) => {
  const { database, signup } = await startServer(t);

  const responses = await Promise.all(Array.from({ length: 5 }, () => signup(VALID)));

  // The insert decides, so the race cannot surface as an error on four of them.
  for (const response of responses) assert.equal(response.status, 202);
  assert.equal(await countUsers(database), 1);
});

test("signup rejects invalid input with a user-safe message", { skip: SKIP }, async (t) => {
  const { database, signup } = await startServer(t);

  const cases = [
    [{ ...VALID, email: "nope" }, 400, "EMAIL_INVALID"],
    [{ ...VALID, email: "" }, 400, "EMAIL_REQUIRED"],
    [{ ...VALID, password: "short" }, 400, "PASSWORD_TOO_SHORT"],
    [{ ...VALID, password: "" }, 400, "PASSWORD_REQUIRED"],
    [{ ...VALID, displayName: "  " }, 400, "DISPLAY_NAME_REQUIRED"],
    [{}, 400, "EMAIL_REQUIRED"],
  ];

  for (const [body, status, code] of cases) {
    const response = await signup(body);
    const payload = await response.json();

    assert.equal(response.status, status, `${code}: wrong status`);
    assert.equal(payload.code, code);
    assert.equal(payload.ok, false);
    assert.ok(payload.error.length > 0, "an error needs a message for the user");
    // detail is for the log only.
    assert.equal("detail" in payload, false);
  }

  assert.equal(await countUsers(database), 0);
});

test("a malformed body answers in the same envelope", { skip: SKIP }, async (t) => {
  const { signup } = await startServer(t);

  const response = await signup("{ not json");
  const payload = await response.json();

  // Without the error handler Express would answer with an HTML error page.
  assert.equal(response.status, 400);
  assert.equal(payload.code, "INVALID_JSON");
  assert.equal(payload.ok, false);
});

test("a password is never echoed back", { skip: SKIP }, async (t) => {
  const { signup } = await startServer(t);

  const password = "correct-horse-battery-staple";
  const body = await (await signup({ ...VALID, password })).text();

  assert.equal(body.includes(password), false);
});

test("the rate limit applies and says when to retry", { skip: SKIP }, async (t) => {
  const { signup } = await startServer(t, { rateLimitPerMinute: 2 });

  const first = await signup({ ...VALID, email: "one@example.com" });
  const second = await signup({ ...VALID, email: "two@example.com" });
  const third = await signup({ ...VALID, email: "three@example.com" });

  assert.equal(first.status, 202);
  assert.equal(second.status, 202);

  // Each attempt costs an Argon2 hash, so an unlimited endpoint is a way to
  // occupy the threadpool (finding F-16).
  assert.equal(third.status, 429);
  assert.equal((await third.json()).code, "TOO_MANY_ATTEMPTS");
  assert.ok(Number(third.headers.get("retry-after")) > 0);
});

test("auth routes are absent when no database is configured", { skip: SKIP }, async (t) => {
  const { httpServer, io } = createApp(
    { ...CONFIG, database: { ...CONFIG.database, connectionString: null } },
    { database: null, diagramService: { async generateDiagram() {} }, logger: SILENT_LOGGER },
  );

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    httpServer.closeAllConnections();
    return new Promise((resolve) => io.close(() => resolve()));
  });

  const response = await fetch(
    `http://127.0.0.1:${httpServer.address().port}/api/auth/signup`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID),
    },
  );

  // A 404 is clearer than a handler failing inside on a database it does not
  // have.
  assert.equal(response.status, 404);
});
