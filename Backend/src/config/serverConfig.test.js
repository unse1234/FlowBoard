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

test("reads Argon2 cost from the environment with OWASP defaults", () => {
  assert.deepEqual(getServerConfig({}).auth.argon2, {
    memoryCostKib: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  assert.deepEqual(
    getServerConfig({
      AUTH_ARGON2_MEMORY_KIB: "47104",
      AUTH_ARGON2_TIME_COST: "1",
      AUTH_ARGON2_PARALLELISM: "2",
    }).auth.argon2,
    { memoryCostKib: 47_104, timeCost: 1, parallelism: 2 },
  );
});

test("nonsense Argon2 cost falls back rather than weakening hashing", () => {
  // A zero or negative cost would be rejected by the library at the first
  // login; a typo must not silently produce a cheaper hash either.
  for (const bad of ["0", "-1", "cheap", ""]) {
    assert.deepEqual(
      getServerConfig({
        AUTH_ARGON2_MEMORY_KIB: bad,
        AUTH_ARGON2_TIME_COST: bad,
        AUTH_ARGON2_PARALLELISM: bad,
      }).auth.argon2,
      { memoryCostKib: 19_456, timeCost: 2, parallelism: 1 },
    );
  }
});

test("reads the auth rate limit, defaulting lower than the AI limit", () => {
  const { auth, ai } = getServerConfig({});

  assert.equal(auth.rateLimitPerMinute, 5);
  // Each auth attempt costs an Argon2 hash, so it must not be looser than the
  // AI endpoint's limit.
  assert.ok(auth.rateLimitPerMinute <= ai.rateLimitPerMinute);

  assert.equal(getServerConfig({ AUTH_RATE_LIMIT_PER_MINUTE: "20" }).auth.rateLimitPerMinute, 20);
  // Zero is a deliberate "off", as it is for the AI limiter.
  assert.equal(getServerConfig({ AUTH_RATE_LIMIT_PER_MINUTE: "0" }).auth.rateLimitPerMinute, 0);
  assert.equal(getServerConfig({ AUTH_RATE_LIMIT_PER_MINUTE: "lots" }).auth.rateLimitPerMinute, 5);
});

test("reads the HSTS age, and zero means omit the header", () => {
  assert.deepEqual(getServerConfig({}).security, { hstsMaxAgeSeconds: 15_552_000 });

  assert.equal(
    getServerConfig({ SECURITY_HSTS_MAX_AGE_SECONDS: "60" }).security.hstsMaxAgeSeconds,
    60,
  );
  // Zero is a deliberate off for a deployment not behind TLS yet.
  assert.equal(
    getServerConfig({ SECURITY_HSTS_MAX_AGE_SECONDS: "0" }).security.hstsMaxAgeSeconds,
    0,
  );
  // A typo must not quietly disable it.
  assert.equal(
    getServerConfig({ SECURITY_HSTS_MAX_AGE_SECONDS: "forever" }).security.hstsMaxAgeSeconds,
    15_552_000,
  );
});
