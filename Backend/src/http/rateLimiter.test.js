const assert = require("node:assert/strict");
const test = require("node:test");
const { loadLocalEnvFile } = require("../config/serverConfig");
const { createDatabase } = require("../db/createDatabase");
const { runMigrations } = require("../db/migrate");
const { createPostgresRateLimiter } = require("./rateLimiter");

loadLocalEnvFile();

/**
 * The PostgreSQL rate limiter against a real server (chunk 7.2).
 *
 * The property that justifies it is correctness across instances, so several
 * tests use more than one limiter, each standing in for a separate process,
 * sharing one database.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const SKIP = TEST_DATABASE_URL ? false : "set TEST_DATABASE_URL to run rate limiter tests";
const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

async function freshDatabase(t) {
  const database = createDatabase({
    config: {
      connectionString: TEST_DATABASE_URL,
      poolMax: 8,
      idleTimeoutMs: 5_000,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 15_000,
      ssl: false,
      applicationName: "flowboard-test",
    },
    logger: SILENT_LOGGER,
  });
  t.after(() => database.close());

  await database.query("DROP SCHEMA public CASCADE");
  await database.query("CREATE SCHEMA public");
  await runMigrations({ database, logger: SILENT_LOGGER });
  return database;
}

const limiter = (database, overrides = {}) =>
  createPostgresRateLimiter({ database, name: "sign-in", limit: 3, logger: SILENT_LOGGER, ...overrides });

const rows = async (database) =>
  (await database.query("SELECT bucket, hits, window_start, expires_at FROM rate_limit_counters")).rows;

test("allows the limit, then refuses with a time to wait", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const signIn = limiter(database);

  const results = [];
  for (let attempt = 0; attempt < 4; attempt += 1) results.push(await signIn.consume("203.0.113.7"));

  assert.deepEqual(
    results.map((result) => result.allowed),
    [true, true, true, false],
  );
  assert.deepEqual(
    results.map((result) => result.remaining),
    [2, 1, 0, 0],
  );
  assert.ok(results[3].retryAfterSeconds >= 1 && results[3].retryAfterSeconds <= 60);
});

test("two instances sharing the database hold one limit between them", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  // Two processes. In memory, each would allow three: six in all.
  const instanceA = limiter(database);
  const instanceB = limiter(database);

  const outcomes = [];
  for (const instance of [instanceA, instanceB, instanceA, instanceB, instanceA, instanceB]) {
    outcomes.push((await instance.consume("203.0.113.7")).allowed);
  }

  assert.equal(outcomes.filter(Boolean).length, 3);
});

test("concurrent requests never overshoot the limit", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const instances = [limiter(database, { limit: 5 }), limiter(database, { limit: 5 })];

  const results = await Promise.all(
    Array.from({ length: 30 }, (_, index) => instances[index % 2].consume("203.0.113.7")),
  );

  assert.equal(results.filter((result) => result.allowed).length, 5);
  assert.equal((await rows(database))[0].hits, 30);
});

test("keys and limit names are counted apart", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const signIn = limiter(database, { limit: 1 });
  const refresh = limiter(database, { name: "refresh", limit: 1 });

  assert.equal((await signIn.consume("203.0.113.7")).allowed, true);
  assert.equal((await signIn.consume("203.0.113.8")).allowed, true);
  assert.equal((await refresh.consume("203.0.113.7")).allowed, true);
  assert.equal((await signIn.consume("203.0.113.7")).allowed, false);
});

test("a new window starts afresh", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const signIn = limiter(database, { limit: 1 });

  await signIn.consume("203.0.113.7");
  assert.equal((await signIn.consume("203.0.113.7")).allowed, false);

  // Move the full window a minute into the past, as time would.
  await database.query(
    `UPDATE rate_limit_counters
     SET window_start = window_start - interval '1 minute',
         expires_at = expires_at - interval '1 minute'`,
  );

  assert.equal((await signIn.consume("203.0.113.7")).allowed, true);
});

test("windows are aligned to the database clock, the same for every instance", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  await limiter(database, { windowSeconds: 60 }).consume("203.0.113.7");
  const [row] = await rows(database);

  assert.equal(row.window_start.getUTCSeconds(), 0);
  assert.equal(row.window_start.getUTCMilliseconds(), 0);
  assert.equal(row.expires_at - row.window_start, 60_000);
});

test("the table never holds an address in the clear", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  await limiter(database).consume("203.0.113.7");
  await limiter(database).consume("ada@example.com");

  for (const { bucket } of await rows(database)) {
    assert.match(bucket, /^sign-in:[0-9a-f]{64}$/);
    assert.equal(bucket.includes("203.0.113.7"), false);
    assert.equal(bucket.includes("ada"), false);
  }
});

test("expired rows are swept as it goes, keeping the table bounded", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const signIn = limiter(database, { sweepEvery: 3 });

  await signIn.consume("198.51.100.1");
  await signIn.consume("198.51.100.2");
  await database.query(
    `UPDATE rate_limit_counters
     SET window_start = window_start - interval '1 hour',
         expires_at = expires_at - interval '1 hour'`,
  );

  // The third request triggers a sweep, which removes the two stale rows.
  await signIn.consume("198.51.100.3");
  await new Promise((resolve) => setTimeout(resolve, 100));

  const remaining = await rows(database);
  assert.equal(remaining.length, 1);
  assert.ok(remaining[0].expires_at > new Date());
});

test("a failed sweep never fails the request that triggered it", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const warnings = [];
  const flaky = {
    query: (text, values) =>
      text.includes("DELETE FROM rate_limit_counters")
        ? Promise.reject(new Error("canceling statement due to lock timeout"))
        : database.query(text, values),
  };
  const signIn = createPostgresRateLimiter({
    database: flaky,
    name: "sign-in",
    limit: 3,
    sweepEvery: 1,
    logger: { warn: (...args) => warnings.push(args) },
  });

  const result = await signIn.consume("203.0.113.7");
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(result.allowed, true);
  assert.equal(warnings.length, 1);
});

test("a misconfigured limiter refuses to exist", () => {
  const database = { query: async () => ({ rows: [] }) };

  assert.throws(() => createPostgresRateLimiter({ database, name: "Sign In", limit: 3 }), TypeError);
  assert.throws(() => createPostgresRateLimiter({ database, name: "sign-in", limit: 0 }), TypeError);
  assert.throws(() => createPostgresRateLimiter({ database, name: "sign-in", limit: 3, windowSeconds: 0 }), TypeError);
});
