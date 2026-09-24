const assert = require("node:assert/strict");
const test = require("node:test");
const { EDGE_ADDRESS_HEADER, EDGE_SECRET_HEADER } = require("../http/edgeRequest");
const { SKIP, VALID_SIGNUP, startAuthServer } = require("./testServer");

/**
 * Per-address sign-in backoff (chunk 7.4), end to end against a real
 * PostgreSQL.
 *
 * The rule the whole design turns on: an address with no account is throttled
 * exactly like one with, so the throttle cannot be used to learn which
 * addresses are registered.
 */

const RIGHT = Object.freeze({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });
const WRONG = Object.freeze({ email: VALID_SIGNUP.email, password: "not-the-right-password" });
const UNKNOWN = Object.freeze({ email: "nobody-here@example.com", password: "not-the-right-password" });

async function serverWithAccount(t, options) {
  const server = await startAuthServer(t, options);
  assert.equal((await server.signup(VALID_SIGNUP)).status, 202, "setup: signup");
  return server;
}

async function failTimes(server, credentials, times) {
  for (let attempt = 0; attempt < times; attempt += 1) {
    assert.equal((await server.login(credentials)).status, 401, `failure ${attempt + 1}`);
  }
}

const throttleRows = async (server) =>
  (await server.database.query("SELECT account_key, failures, blocked_until FROM login_throttles")).rows;

/** Pretend the current wait has already passed. */
const expireWait = (server) =>
  server.database.query("UPDATE login_throttles SET blocked_until = now() - interval '1 second'");

test("four failures pass, and the fifth sets a one-minute wait", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  await failTimes(server, WRONG, 5);
  const blocked = await server.login(RIGHT);

  // Even the right password waits: nothing is checked until the wait ends.
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).code, "TOO_MANY_ATTEMPTS");
  const wait = Number(blocked.headers.get("retry-after"));
  assert.ok(wait > 50 && wait <= 60, `retry-after ${wait}`);
});

test("under the threshold, the right password works and clears the count", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  await failTimes(server, WRONG, 4);
  assert.equal((await server.login(RIGHT)).status, 200);
  assert.deepEqual(await throttleRows(server), []);

  // A fresh count: four more failures are still under the threshold.
  await failTimes(server, WRONG, 4);
  assert.equal((await server.login(RIGHT)).status, 200);
});

test("each failure past the threshold doubles the wait, up to fifteen minutes", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  await failTimes(server, WRONG, 5);

  const waits = [];
  for (let round = 0; round < 6; round += 1) {
    await expireWait(server);
    await server.login(WRONG);
    const response = await server.login(WRONG);
    assert.equal(response.status, 429);
    waits.push(Number(response.headers.get("retry-after")));
  }

  // 2, 4, 8, then capped at 15 minutes.
  const minutes = waits.map((seconds) => Math.round(seconds / 60));
  assert.deepEqual(minutes, [2, 4, 8, 15, 15, 15]);
});

test("once the wait has passed, the right password gets in and resets everything", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  await failTimes(server, WRONG, 5);

  await expireWait(server);
  assert.equal((await server.login(RIGHT)).status, 200);
  assert.deepEqual(await throttleRows(server), []);
});

test("an address with no account is throttled exactly like a registered one", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  await failTimes(server, WRONG, 5);
  await failTimes(server, UNKNOWN, 5);
  const registered = await server.login(WRONG);
  const unregistered = await server.login(UNKNOWN);

  // Same status, same body, same kind of wait: nothing to tell them apart.
  assert.equal(registered.status, unregistered.status);
  assert.deepEqual(await registered.json(), await unregistered.json());
  const waits = [registered, unregistered].map((response) => Number(response.headers.get("retry-after")));
  assert.ok(Math.abs(waits[0] - waits[1]) <= 2, `waits ${waits}`);
});

test("the backoff follows the address, whatever its case or spacing", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  await failTimes(server, { ...WRONG, email: "ADA.LOVELACE@example.com" }, 3);
  await failTimes(server, { ...WRONG, email: "  ada.lovelace@EXAMPLE.com " }, 2);

  assert.equal((await server.login(RIGHT)).status, 429);
  assert.equal((await throttleRows(server)).length, 1);
});

test("guesses spread over many addresses still meet the same backoff", { skip: SKIP }, async (t) => {
  const secret = "k3VQbq1Hk6yJ2mZ0x8wP4rT7uN5sL9cD2fG6hJ1aB3e";
  const server = await startAuthServer(t, { auth: { edgeSecret: secret } });
  const from = (address) => ({ [EDGE_SECRET_HEADER]: secret, [EDGE_ADDRESS_HEADER]: address });
  // Behind an edge, even setup has to come through it.
  assert.equal((await server.post("/api/auth/signup", VALID_SIGNUP, from("203.0.113.1"))).status, 202);

  // The attack the per-address limit cannot see: each guess from a new address.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await server.login(WRONG, from(`198.51.100.${attempt + 1}`))).status, 401);
  }

  assert.equal((await server.login(RIGHT, from("203.0.113.99"))).status, 429);
});

test("one address's backoff never touches another", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  await failTimes(server, UNKNOWN, 5);

  assert.equal((await server.login(RIGHT)).status, 200);
});

test("failures a day apart do not add up", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  await failTimes(server, WRONG, 4);

  await server.database.query("UPDATE login_throttles SET last_failure_at = now() - interval '25 hours'");
  await failTimes(server, WRONG, 1);

  // Counted from one again, not five, so no wait.
  assert.equal((await throttleRows(server))[0].failures, 1);
  assert.equal((await server.login(RIGHT)).status, 200);
});

test("the table never holds an address", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);
  await failTimes(server, WRONG, 1);

  const [row] = await throttleRows(server);

  assert.match(row.account_key, /^[0-9a-f]{64}$/);
  assert.equal(row.account_key.includes("ada"), false);
});

test("a malformed request is refused before it can count against anyone", { skip: SKIP }, async (t) => {
  const server = await serverWithAccount(t);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await server.login({ email: VALID_SIGNUP.email });
  }

  assert.deepEqual(await throttleRows(server), []);
  assert.equal((await server.login(RIGHT)).status, 200);
});
