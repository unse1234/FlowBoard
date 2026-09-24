const assert = require("node:assert/strict");
const test = require("node:test");
const { EDGE_ADDRESS_HEADER, EDGE_SECRET_HEADER } = require("../http/edgeRequest");
const { SKIP, VALID_SIGNUP, readSetCookie, BASE_CONFIG, startAuthServer } = require("./testServer");

/**
 * /api/auth behind FlowBoard's edge, against a real PostgreSQL (chunk 7.1).
 *
 * In production every auth request arrives through Vercel, whose rewrite adds
 * a shared secret. These tests configure one and check both halves: a request
 * without it is refused, and one with it is attributed to the address Vercel
 * reported, for rate limits and for the session record alike.
 */

const SECRET = "k3VQbq1Hk6yJ2mZ0x8wP4rT7uN5sL9cD2fG6hJ1aB3e";
const CREDENTIALS = Object.freeze({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });
const COOKIE = BASE_CONFIG.auth.cookie.name;

const viaEdge = (address) => ({ [EDGE_SECRET_HEADER]: SECRET, [EDGE_ADDRESS_HEADER]: address });

async function edgeServer(t, { rateLimitPerMinute = 0 } = {}) {
  return startAuthServer(t, { rateLimitPerMinute, auth: { edgeSecret: SECRET } });
}

const count = async (server, table) =>
  (await server.database.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count;

test("a request that went around the edge is refused before anything happens", { skip: SKIP }, async (t) => {
  const server = await edgeServer(t);

  const signup = await server.post("/api/auth/signup", VALID_SIGNUP);
  const login = await server.login(CREDENTIALS);
  const wrongSecret = await server.login(CREDENTIALS, { [EDGE_SECRET_HEADER]: "guess" });

  for (const response of [signup, login, wrongSecret]) {
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ORIGIN_NOT_ALLOWED");
  }
  assert.equal(await count(server, "users"), 0);
  assert.equal(await count(server, "auth_sessions"), 0);
});

test("a request through the edge works, and its session records the real client", { skip: SKIP }, async (t) => {
  const server = await edgeServer(t);

  assert.equal((await server.post("/api/auth/signup", VALID_SIGNUP, viaEdge("198.51.100.23"))).status, 202);
  const login = await server.login(CREDENTIALS, viaEdge("198.51.100.23"));

  assert.equal(login.status, 200);
  const { rows } = await server.database.query("SELECT ip_address FROM auth_sessions");
  // Not the socket's 127.0.0.1: in production that is Render's proxy for everyone.
  assert.equal(rows[0].ip_address, "198.51.100.23");
});

test("rate limits count each client separately, not the proxy they share", { skip: SKIP }, async (t) => {
  const server = await edgeServer(t, { rateLimitPerMinute: 1 });

  // Every request below reaches the server from the same socket address, as
  // it would from Render's proxy. Only the edge's report tells them apart.
  const alice = await server.login(CREDENTIALS, viaEdge("198.51.100.1"));
  const bob = await server.login(CREDENTIALS, viaEdge("198.51.100.2"));
  const aliceAgain = await server.login(CREDENTIALS, viaEdge("198.51.100.1"));

  assert.notEqual(alice.status, 429);
  assert.notEqual(bob.status, 429);
  assert.equal(aliceAgain.status, 429);
});

test("an address forged in X-Forwarded-For earns no fresh allowance", { skip: SKIP }, async (t) => {
  const server = await edgeServer(t, { rateLimitPerMinute: 1 });

  const first = await server.login(CREDENTIALS, {
    ...viaEdge("198.51.100.1"),
    "x-forwarded-for": "6.6.6.1",
  });
  const second = await server.login(CREDENTIALS, {
    ...viaEdge("198.51.100.1"),
    "x-forwarded-for": "6.6.6.2",
  });

  assert.notEqual(first.status, 429);
  assert.equal(second.status, 429);
});

test("refresh, logout and me all sit behind the edge too", { skip: SKIP }, async (t) => {
  const server = await edgeServer(t);
  await server.post("/api/auth/signup", VALID_SIGNUP, viaEdge("198.51.100.23"));
  const login = await server.login(CREDENTIALS, viaEdge("198.51.100.23"));
  const token = readSetCookie(login, COOKIE).value;
  const { accessToken } = await login.json();

  assert.equal((await server.refresh(token)).status, 403);
  assert.equal((await server.logout(token)).status, 403);
  assert.equal((await server.me(accessToken)).status, 403);

  // And the session those refused requests carried is untouched.
  assert.equal((await server.refresh(token, viaEdge("198.51.100.23"))).status, 200);
});
