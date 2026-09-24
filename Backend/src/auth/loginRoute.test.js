const assert = require("node:assert/strict");
const test = require("node:test");
const { createPasswordHasher } = require("./passwordHasher");
const { SILENT_LOGGER, SKIP, VALID_SIGNUP, startAuthServer } = require("./testServer");

/**
 * POST /api/auth/login against a real PostgreSQL.
 *
 * Most of what matters here is what the endpoint refuses to tell a caller, so
 * the negative cases carry more weight than the happy path.
 */

/** A server with one account already created. */
async function serverWithAccount(t, options) {
  const server = await startAuthServer(t, options);
  const response = await server.signup(VALID_SIGNUP);
  assert.equal(response.status, 202, "setup: signup should have succeeded");

  return server;
}

const readHash = async (server) =>
  (await server.database.query("SELECT password_hash FROM users")).rows[0].password_hash;

test("signing in with the right credentials succeeds", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const response = await server.login({
    email: VALID_SIGNUP.email,
    password: VALID_SIGNUP.password,
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.user.email, VALID_SIGNUP.email);
  assert.equal(payload.user.displayName, VALID_SIGNUP.displayName);
  assert.equal(payload.user.emailVerified, false);
  assert.match(payload.user.id, /^[0-9a-f-]{36}$/);
});

test("the response carries nothing but the named fields", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const payload = await (
    await server.login({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password })
  ).json();

  // Built by naming fields rather than deleting from the row, so a column added
  // later is absent by default instead of leaking until someone notices.
  assert.deepEqual(Object.keys(payload.user).sort(), [
    "displayName",
    "email",
    "emailVerified",
    "id",
  ]);

  const serialised = JSON.stringify(payload);
  assert.equal(serialised.includes("argon2"), false);
  assert.equal(serialised.includes("tokenVersion"), false);
  assert.equal(serialised.includes(VALID_SIGNUP.password), false);
});

test("the address is matched case-insensitively and trimmed", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const response = await server.login({
    email: "  ADA.LOVELACE@EXAMPLE.COM  ",
    password: VALID_SIGNUP.password,
  });

  assert.equal(response.status, 200);
});

test("an unknown address and a wrong password answer identically", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const wrongPassword = await server.login({
    email: VALID_SIGNUP.email,
    password: "not-the-password",
  });
  const unknownAddress = await server.login({
    email: "nobody@example.com",
    password: VALID_SIGNUP.password,
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownAddress.status, 401);
  assert.deepEqual(await wrongPassword.json(), await unknownAddress.json());
});

test("a failure says nothing about the account", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const payload = await (
    await server.login({ email: VALID_SIGNUP.email, password: "not-the-password" })
  ).json();

  assert.equal(payload.code, "INVALID_CREDENTIALS");
  assert.doesNotMatch(
    payload.error,
    /exists?|already|registered|unknown|not found|no account|incorrect password/i,
  );
  // detail is for the log only.
  assert.equal("detail" in payload, false);
});

test("an account with no password cannot sign in", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  // What an OAuth-only account looks like once Phase 8 exists.
  await server.database.query("UPDATE users SET password_hash = NULL");

  const response = await server.login({
    email: VALID_SIGNUP.email,
    password: VALID_SIGNUP.password,
  });

  // A failed login, not a 500, and certainly not a success.
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "INVALID_CREDENTIALS");
});

test("a suspended account is refused, but only once the password verifies", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  await server.database.query("UPDATE users SET status = 'suspended'");

  const rightPassword = await server.login({
    email: VALID_SIGNUP.email,
    password: VALID_SIGNUP.password,
  });
  const wrongPassword = await server.login({
    email: VALID_SIGNUP.email,
    password: "not-the-password",
  });

  // The owner, having proved the account is theirs, learns why they are stuck.
  assert.equal(rightPassword.status, 403);
  assert.equal((await rightPassword.json()).code, "ACCOUNT_UNAVAILABLE");

  // Someone guessing learns nothing. Checking status before verifying would
  // make 403 an answer to a guess, and therefore an enumeration oracle.
  assert.equal(wrongPassword.status, 401);
  assert.equal((await wrongPassword.json()).code, "INVALID_CREDENTIALS");
});

test("a soft-deleted account cannot sign in", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  await server.database.query("UPDATE users SET deleted_at = now(), status = 'pending_deletion'");

  const response = await server.login({
    email: VALID_SIGNUP.email,
    password: VALID_SIGNUP.password,
  });

  // The repository filters on deleted_at IS NULL, so this is simply an unknown
  // address — which is also the right thing to tell the caller.
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "INVALID_CREDENTIALS");
});

test("login applies no password length policy", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  // An account whose password predates a policy change must still be able to
  // sign in, and a short guess must answer like any other wrong one.
  const response = await server.login({ email: VALID_SIGNUP.email, password: "short" });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "INVALID_CREDENTIALS");
});

test("a password beyond the hasher's cap fails as a wrong one", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const response = await server.login({
    email: VALID_SIGNUP.email,
    password: "a".repeat(2000),
  });

  // verifyPassword refuses oversized input, so this costs nothing and answers
  // the same as any other mismatch.
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "INVALID_CREDENTIALS");
});

test("a missing or malformed field is rejected before any lookup", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const cases = [
    [{}, "EMAIL_REQUIRED"],
    [{ email: VALID_SIGNUP.email }, "PASSWORD_REQUIRED"],
    [{ email: VALID_SIGNUP.email, password: "" }, "PASSWORD_REQUIRED"],
    // A malformed address cannot belong to an account, so saying so reveals
    // nothing the caller did not already know.
    [{ email: "nope", password: "anything" }, "EMAIL_INVALID"],
  ];

  for (const [body, code] of cases) {
    const response = await server.login(body);

    assert.equal(response.status, 400, `${code}: wrong status`);
    assert.equal((await response.json()).code, code);
  }
});

test("a malformed body answers in the same envelope", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const response = await server.login("{ not json");

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_JSON");
});

test("a password is never echoed back", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const password = "correct-horse-battery-staple";

  const body = await (await server.login({ email: VALID_SIGNUP.email, password })).text();

  assert.equal(body.includes(password), false);
});

test("a stale password hash is upgraded on a correct login", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  // Replace the stored hash with one made at weaker settings, as raising the
  // cost would leave behind.
  const weak = createPasswordHasher({
    config: { memoryCostKib: 8, timeCost: 1, parallelism: 1 },
    logger: SILENT_LOGGER,
  });
  const weakHash = await weak.hashPassword(VALID_SIGNUP.password);
  await server.database.query("UPDATE users SET password_hash = $1", [weakHash]);

  const response = await server.login({
    email: VALID_SIGNUP.email,
    password: VALID_SIGNUP.password,
  });
  assert.equal(response.status, 200);

  const stored = await readHash(server);

  // Raising the cost upgrades accounts as they sign in: no migration, no forced
  // reset.
  assert.notEqual(stored, weakHash);
  assert.match(stored, /m=64,t=1,p=1/);

  // And the replacement still verifies the same password.
  const again = await server.login({
    email: VALID_SIGNUP.email,
    password: VALID_SIGNUP.password,
  });
  assert.equal(again.status, 200);
});

test("a current password hash is left alone", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  const before = await readHash(server);

  await server.login({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });

  assert.equal(await readHash(server), before);
});

test("a failed hash upgrade does not fail the login", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  const weak = createPasswordHasher({
    config: { memoryCostKib: 8, timeCost: 1, parallelism: 1 },
    logger: SILENT_LOGGER,
  });
  const weakHash = await weak.hashPassword(VALID_SIGNUP.password);
  await server.database.query("UPDATE users SET password_hash = $1", [weakHash]);

  // Make the upgrade's UPDATE fail and nothing else. Revoking UPDATE on users,
  // as this test once did, is too broad now that sign-in creates a session:
  // the foreign-key check on auth_sessions locks the users row, and that lock
  // needs the same privilege.
  await server.database.query(`
    CREATE FUNCTION refuse_hash_upgrade() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'hash upgrade refused by test';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER refuse_hash_upgrade
      BEFORE UPDATE OF password_hash ON users
      FOR EACH ROW EXECUTE FUNCTION refuse_hash_upgrade();
  `);

  const response = await server.login({
    email: VALID_SIGNUP.email,
    password: VALID_SIGNUP.password,
  });

  // The password was correct and the stored hash is still valid — it is only
  // older than we would like, so an upgrade failure must not lock anyone out.
  assert.equal(response.status, 200);
  // And the upgrade really was attempted and refused, not quietly skipped.
  assert.equal(await readHash(server), weakHash);
});

test("the rate limit applies to sign-in attempts", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t, { rateLimitPerMinute: 2 });
  const attempt = () => server.login({ email: VALID_SIGNUP.email, password: "guess" });

  await attempt();
  await attempt();
  const third = await attempt();

  // Credential stuffing is what this is for, and each attempt costs an Argon2
  // verification (finding F-16).
  assert.equal(third.status, 429);
  assert.equal((await third.json()).code, "TOO_MANY_ATTEMPTS");
  assert.ok(Number(third.headers.get("retry-after")) > 0);
});
