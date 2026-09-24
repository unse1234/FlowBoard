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

const key = (bytes = 32, fill = 7) => Buffer.alloc(bytes, fill).toString("base64url");

test("access-token signing keys are absent unless configured, never defaulted", () => {
  assert.equal(getServerConfig({}).auth.accessToken.keys, null);
  assert.equal(getServerConfig({ AUTH_ACCESS_TOKEN_KEYS: "   " }).auth.accessToken.keys, null);
});

test("reads signing keys in order, so the first signs and the rest only verify", () => {
  const { keys } = getServerConfig({
    AUTH_ACCESS_TOKEN_KEYS: ` 2026-09:${key(32, 1)} , 2026-06:${key(48, 2)} `,
  }).auth.accessToken;

  assert.deepEqual(
    keys.map((entry) => entry.id),
    ["2026-09", "2026-06"],
  );
  assert.ok(keys[0].secret.equals(Buffer.alloc(32, 1)));
  assert.ok(keys[1].secret.equals(Buffer.alloc(48, 2)));
});

test("a malformed signing key stops startup instead of falling back", () => {
  const cases = [
    ["no separator", key()],
    ["empty id", `:${key()}`],
    ["id with a space", `my key:${key()}`],
    ["secret too short", `k1:${key(31)}`],
    ["standard base64, not base64url", `k1:${Buffer.alloc(32, 251).toString("base64")}`],
    ["empty entry", `k1:${key()},`],
    ["duplicate id", `k1:${key(32, 1)},k1:${key(32, 2)}`],
  ];

  for (const [label, value] of cases) {
    assert.throws(
      () => getServerConfig({ AUTH_ACCESS_TOKEN_KEYS: value }),
      /AUTH_ACCESS_TOKEN_KEYS/,
      label,
    );
  }
});

test("a signing-key error never repeats the secret", () => {
  const secret = key(16, 9);

  assert.throws(
    () => getServerConfig({ AUTH_ACCESS_TOKEN_KEYS: `k1:${secret}` }),
    (error) => !error.message.includes(secret),
  );
});

test("access tokens live fifteen minutes, and an out-of-range lifetime falls back", () => {
  const { accessToken } = getServerConfig({}).auth;

  assert.equal(accessToken.ttlSeconds, 900);
  assert.equal(accessToken.issuer, "flowboard");
  assert.equal(accessToken.audience, "flowboard-api");

  assert.equal(
    getServerConfig({ AUTH_ACCESS_TOKEN_TTL_SECONDS: "300" }).auth.accessToken.ttlSeconds,
    300,
  );
  // A day-long token would make "sign out everywhere" take a day.
  for (const bad of ["86400", "59", "0", "soon"]) {
    assert.equal(
      getServerConfig({ AUTH_ACCESS_TOKEN_TTL_SECONDS: bad }).auth.accessToken.ttlSeconds,
      900,
      bad,
    );
  }
});

test("refresh tokens idle out after 14 days, sessions after 30, and nonsense falls back", () => {
  assert.deepEqual(getServerConfig({}).auth.refreshToken, {
    idleTtlSeconds: 1_209_600,
    sessionTtlSeconds: 2_592_000,
    reuseGraceSeconds: 20,
  });

  assert.deepEqual(
    getServerConfig({
      AUTH_REFRESH_IDLE_TTL_SECONDS: "86400",
      AUTH_SESSION_TTL_SECONDS: "604800",
      AUTH_REFRESH_REUSE_GRACE_SECONDS: "0",
    }).auth.refreshToken,
    { idleTtlSeconds: 86_400, sessionTtlSeconds: 604_800, reuseGraceSeconds: 0 },
  );

  // Under an hour would sign people out constantly; over the ceiling would
  // make a stolen cookie good for years.
  for (const bad of ["60", "999999999", "a week"]) {
    assert.deepEqual(
      getServerConfig({ AUTH_REFRESH_IDLE_TTL_SECONDS: bad, AUTH_SESSION_TTL_SECONDS: bad }).auth
        .refreshToken,
      { idleTtlSeconds: 1_209_600, sessionTtlSeconds: 2_592_000, reuseGraceSeconds: 20 },
      bad,
    );
  }

  // A long grace window is a long window for a thief's copy to work unnoticed.
  assert.equal(
    getServerConfig({ AUTH_REFRESH_REUSE_GRACE_SECONDS: "3600" }).auth.refreshToken.reuseGraceSeconds,
    20,
  );
});

test("the refresh cookie is secure, strict and scoped to the auth routes by default", () => {
  assert.deepEqual(getServerConfig({}).auth.cookie, {
    name: "__Secure-flowboard_refresh",
    secure: true,
    sameSite: "strict",
    path: "/api/auth",
  });
});

test("only an explicit false turns Secure off, and the prefix goes with it", () => {
  assert.deepEqual(getServerConfig({ AUTH_COOKIE_SECURE: "false" }).auth.cookie, {
    name: "flowboard_refresh",
    secure: false,
    sameSite: "strict",
    path: "/api/auth",
  });

  // A typo must not produce an insecure cookie.
  for (const typo of ["flase", "0", "no", "off", ""]) {
    assert.equal(getServerConfig({ AUTH_COOKIE_SECURE: typo }).auth.cookie.secure, true, typo);
  }
});

test("SameSite can be relaxed by name, and a typo keeps it strict", () => {
  assert.equal(getServerConfig({ AUTH_COOKIE_SAME_SITE: "Lax" }).auth.cookie.sameSite, "lax");
  assert.equal(getServerConfig({ AUTH_COOKIE_SAME_SITE: "none" }).auth.cookie.sameSite, "none");
  assert.equal(getServerConfig({ AUTH_COOKIE_SAME_SITE: "loose" }).auth.cookie.sameSite, "strict");
});

test("SameSite=None without Secure stops startup, since browsers would drop the cookie", () => {
  assert.throws(
    () => getServerConfig({ AUTH_COOKIE_SAME_SITE: "none", AUTH_COOKIE_SECURE: "false" }),
    /AUTH_COOKIE_SAME_SITE=none/,
  );
});

test("the edge secret is absent unless configured, and a weak one stops startup", () => {
  assert.equal(getServerConfig({}).auth.edgeSecret, null);
  assert.equal(getServerConfig({ AUTH_PROXY_SECRET: "  " }).auth.edgeSecret, null);

  const strong = Buffer.alloc(32, 5).toString("base64url");
  assert.equal(getServerConfig({ AUTH_PROXY_SECRET: ` ${strong} ` }).auth.edgeSecret, strong);

  for (const weak of ["short", strong.slice(1), `${strong.slice(0, -1)}+`, "a".repeat(42)]) {
    assert.throws(() => getServerConfig({ AUTH_PROXY_SECRET: weak }), /AUTH_PROXY_SECRET/, weak);
  }
});

test("refresh, sign-out and me get a generous allowance of their own", () => {
  const { auth } = getServerConfig({});

  assert.equal(auth.sessionRateLimitPerMinute, 60);
  // Several tabs refresh routinely; it must be far looser than sign-in's.
  assert.ok(auth.sessionRateLimitPerMinute >= auth.rateLimitPerMinute * 10);
  assert.equal(getServerConfig({ AUTH_SESSION_RATE_LIMIT_PER_MINUTE: "0" }).auth.sessionRateLimitPerMinute, 0);
  assert.equal(getServerConfig({ AUTH_SESSION_RATE_LIMIT_PER_MINUTE: "lots" }).auth.sessionRateLimitPerMinute, 60);
});

test("sign-in backoff starts after five failures, and zero turns it off", () => {
  assert.equal(getServerConfig({}).auth.loginBackoffThreshold, 5);
  assert.equal(getServerConfig({ AUTH_LOGIN_BACKOFF_THRESHOLD: "10" }).auth.loginBackoffThreshold, 10);
  assert.equal(getServerConfig({ AUTH_LOGIN_BACKOFF_THRESHOLD: "0" }).auth.loginBackoffThreshold, 0);
  assert.equal(getServerConfig({ AUTH_LOGIN_BACKOFF_THRESHOLD: "never" }).auth.loginBackoffThreshold, 5);
});

test("Turnstile is off unless its secret key is set", () => {
  assert.equal(getServerConfig({}).auth.turnstileSecretKey, null);
  assert.equal(getServerConfig({ TURNSTILE_SECRET_KEY: "  " }).auth.turnstileSecretKey, null);
  assert.equal(getServerConfig({ TURNSTILE_SECRET_KEY: " 0x4AAA-secret " }).auth.turnstileSecretKey, "0x4AAA-secret");
});
