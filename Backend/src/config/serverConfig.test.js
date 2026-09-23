const assert = require("node:assert/strict");
const test = require("node:test");
const { getServerConfig } = require("./serverConfig");

test("reads AI settings from the environment with safe defaults", () => {
  assert.deepEqual(getServerConfig({}).ai, {
    geminiApiKey: null,
    geminiModel: "gemini-3.6-flash",
    rateLimitPerMinute: 10,
  });

  assert.deepEqual(
    getServerConfig({
      GEMINI_API_KEY: "  key  ",
      GEMINI_MODEL: "gemini-2.5-pro",
      AI_RATE_LIMIT_PER_MINUTE: "0",
    }).ai,
    { geminiApiKey: "key", geminiModel: "gemini-2.5-pro", rateLimitPerMinute: 0 },
  );

  assert.equal(getServerConfig({ GEMINI_API_KEY: "   " }).ai.geminiApiKey, null);
  assert.equal(getServerConfig({ AI_RATE_LIMIT_PER_MINUTE: "lots" }).ai.rateLimitPerMinute, 10);
});

test("matches configured origins however they are written", () => {
  assert.deepEqual(
    getServerConfig({ CLIENT_ORIGIN: "https://a.example/, http://localhost:5173" }).clientOrigin,
    ["https://a.example", "http://localhost:5173"],
  );
  assert.ok(getServerConfig({}).clientOrigin.every((origin) => !origin.endsWith("/")));
});

test("reads database settings from the environment with safe defaults", () => {
  assert.deepEqual(getServerConfig({}).database, {
    connectionString: null,
    poolMax: 10,
    idleTimeoutMs: 30_000,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 10_000,
    ssl: false,
    applicationName: "flowboard",
  });

  const configured = getServerConfig({
    DATABASE_URL: "  postgres://localhost/flowboard  ",
    DATABASE_POOL_MAX: "25",
    DATABASE_STATEMENT_TIMEOUT_MS: "3000",
    DATABASE_APPLICATION_NAME: "flowboard-worker",
  }).database;

  assert.equal(configured.connectionString, "postgres://localhost/flowboard");
  assert.equal(configured.poolMax, 25);
  assert.equal(configured.statementTimeoutMs, 3000);
  assert.equal(configured.applicationName, "flowboard-worker");
});

test("a pool of zero falls back rather than making the server unable to query", () => {
  assert.equal(getServerConfig({ DATABASE_POOL_MAX: "0" }).database.poolMax, 10);
  assert.equal(getServerConfig({ DATABASE_POOL_MAX: "-4" }).database.poolMax, 10);
  assert.equal(getServerConfig({ DATABASE_POOL_MAX: "many" }).database.poolMax, 10);
});

test("TLS to the database is off unless asked for, and skipping verification must be named", () => {
  assert.equal(getServerConfig({}).database.ssl, false);
  assert.equal(getServerConfig({ DATABASE_SSL: "disable" }).database.ssl, false);
  // A typo must never silently downgrade to an unverified connection.
  assert.equal(getServerConfig({ DATABASE_SSL: "yes please" }).database.ssl, false);

  assert.deepEqual(getServerConfig({ DATABASE_SSL: "require" }).database.ssl, {
    rejectUnauthorized: true,
  });
  assert.deepEqual(getServerConfig({ DATABASE_SSL: "NO-VERIFY" }).database.ssl, {
    rejectUnauthorized: false,
  });
});
