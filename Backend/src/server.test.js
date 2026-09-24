const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const test = require("node:test");
const { getServerConfig } = require("./config/serverConfig");
const { createApp, createShutdownHandler } = require("./server");

const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

/**
 * Derived from the real configuration rather than written out, so that adding a
 * section to serverConfig cannot leave this fixture stale. Hand-built copies
 * drifted three times while Step 1 was being built, each time surfacing as a
 * TypeError deep inside createApp rather than as anything informative.
 */
const DEFAULTS = getServerConfig({});
const CONFIG = {
  ...DEFAULTS,
  port: 0,
  clientOrigin: ["http://localhost:5173"],
  ai: { ...DEFAULTS.ai, geminiModel: "gemini-test", rateLimitPerMinute: 0 },
  // Cheap Argon2: these tests never hash anything.
  auth: {
    ...DEFAULTS.auth,
    rateLimitPerMinute: 0,
    argon2: { memoryCostKib: 64, timeCost: 1, parallelism: 1 },
    accessToken: { ...DEFAULTS.auth.accessToken, keys: [{ id: "test", secret: randomBytes(32) }] },
  },
};

async function startServer(t, { database } = {}) {
  const { httpServer, io } = createApp(CONFIG, {
    database,
    diagramService: { async generateDiagram() {} },
    logger: SILENT_LOGGER,
  });

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    httpServer.closeAllConnections();
    return new Promise((resolve) => io.close(() => resolve()));
  });

  return `http://127.0.0.1:${httpServer.address().port}`;
}

test("liveness answers while a dependency is down", async (t) => {
  const baseUrl = await startServer(t, {
    database: {
      async ping() {
        throw new Error("ECONNREFUSED");
      },
    },
  });

  const response = await fetch(`${baseUrl}/health`);

  // Liveness must not fail on a dependency outage, or an orchestrator would
  // restart a process that is working perfectly well.
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "flowboard-realtime" });
});

test("readiness reports ok once the database answers", async (t) => {
  let pings = 0;
  const baseUrl = await startServer(t, {
    database: {
      async ping() {
        pings += 1;
      },
    },
  });

  const response = await fetch(`${baseUrl}/ready`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, checks: { database: "ok" } });
  assert.equal(pings, 1);
});

test("readiness answers 503 while the database is unreachable", async (t) => {
  const baseUrl = await startServer(t, {
    database: {
      async ping() {
        throw new Error("ECONNREFUSED");
      },
    },
  });

  const response = await fetch(`${baseUrl}/ready`);

  // 503 takes this instance out of the load balancer without killing it, so it
  // rejoins on its own once the database comes back.
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, checks: { database: "unavailable" } });
});

test("readiness fails closed when no database is configured", async (t) => {
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/ready`);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, checks: { database: "not_configured" } });
});

test("a readiness failure never leaks the connection string", async (t) => {
  const baseUrl = await startServer(t, {
    database: {
      async ping() {
        throw new Error("connect ECONNREFUSED postgres://user:hunter2@db.internal:5432/flowboard");
      },
    },
  });

  const body = await (await fetch(`${baseUrl}/ready`)).text();

  // The driver puts the DSN in its error messages; credentials must not travel
  // out to whatever is polling this endpoint.
  assert.equal(body.includes("hunter2"), false);
  assert.equal(body.includes("db.internal"), false);
});

function createDrainRecorder({ databaseFails = false } = {}) {
  const order = [];

  return {
    order,
    io: { close: (done) => { order.push("io"); done(); } },
    httpServer: { close: (done) => { order.push("http"); done(); } },
    database: {
      async close() {
        order.push("database");
        if (databaseFails) throw new Error("pool already gone");
      },
    },
  };
}

test("shutdown drains sockets, then HTTP, then the pool", async () => {
  const { order, io, httpServer, database } = createDrainRecorder();
  const codes = [];

  const shutdown = createShutdownHandler({
    httpServer,
    io,
    database,
    logger: SILENT_LOGGER,
    exit: (code) => codes.push(code),
  });

  await shutdown("SIGTERM");

  // Order matters: a request still finishing must not lose its database
  // connection underneath it.
  assert.deepEqual(order, ["io", "http", "database"]);
  assert.deepEqual(codes, [0]);
});

test("a second signal does not start a second drain", async () => {
  const { order, io, httpServer, database } = createDrainRecorder();
  const codes = [];

  const shutdown = createShutdownHandler({
    httpServer,
    io,
    database,
    logger: SILENT_LOGGER,
    exit: (code) => codes.push(code),
  });

  await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);

  assert.deepEqual(order, ["io", "http", "database"]);
  assert.deepEqual(codes, [0]);
});

test("a failed drain exits non-zero", async () => {
  const { io, httpServer, database } = createDrainRecorder({ databaseFails: true });
  const codes = [];

  const shutdown = createShutdownHandler({
    httpServer,
    io,
    database,
    logger: SILENT_LOGGER,
    exit: (code) => codes.push(code),
  });

  await shutdown("SIGTERM");

  assert.deepEqual(codes, [1]);
});

test("a drain that hangs is cut off by the grace period", async () => {
  const codes = [];
  const shutdown = createShutdownHandler({
    // Never calls its callback, standing in for a connection that will not close.
    io: { close: () => {} },
    httpServer: { close: (done) => done() },
    database: null,
    logger: SILENT_LOGGER,
    graceMs: 20,
    exit: (code) => codes.push(code),
  });

  shutdown("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 60));

  // An orchestrator is waiting; a process that never exits gets killed anyway,
  // so it exits itself and reports that it was not clean.
  assert.deepEqual(codes, [1]);
});

test("shutdown works without a database", async () => {
  const codes = [];
  const shutdown = createShutdownHandler({
    io: { close: (done) => done() },
    httpServer: { close: (done) => done() },
    database: null,
    logger: SILENT_LOGGER,
    exit: (code) => codes.push(code),
  });

  await shutdown("SIGTERM");

  assert.deepEqual(codes, [0]);
});

test("every response carries the security headers", async (t) => {
  const baseUrl = await startServer(t);

  // A 200, a 503 and a 404: the failure paths are where headers are easiest to
  // lose, because they are produced by handlers nobody looks at twice.
  for (const path of ["/health", "/ready", "/nothing-here"]) {
    const response = await fetch(`${baseUrl}${path}`);

    assert.equal(
      response.headers.get("x-content-type-options"),
      "nosniff",
      `${path} is missing nosniff`,
    );
    assert.equal(response.headers.get("x-frame-options"), "DENY", `${path} is framable`);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
    assert.match(
      response.headers.get("strict-transport-security"),
      /^max-age=\d+; includeSubDomains$/,
    );
  }
});

test("the server does not announce which framework it runs", async (t) => {
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/health`);

  // Express sets this by default. It tells an attacker which advisories to look
  // up and helps nobody else.
  assert.equal(response.headers.get("x-powered-by"), null);
});

test("security headers survive an error response", async (t) => {
  const baseUrl = await startServer(t);

  // Malformed JSON, so the body parser rejects it before any route runs.
  const response = await fetch(`${baseUrl}/api/ai/generate-diagram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ not json",
  });

  assert.ok(response.status >= 400);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
});

test("the headers do not interfere with CORS", async (t) => {
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/health`, {
    headers: { Origin: "http://localhost:5173" },
  });

  // The web app is on another origin, so breaking this would break the product.
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://localhost:5173",
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("with a database but no signing key the server refuses to start", () => {
  const withoutKeys = {
    ...CONFIG,
    auth: { ...CONFIG.auth, accessToken: { ...CONFIG.auth.accessToken, keys: null } },
  };

  // Otherwise it would serve sign-in routes that can never sign anyone in,
  // behind a readiness check that reports all is well.
  assert.throws(
    () => createApp(withoutKeys, { database: { async ping() {} }, logger: SILENT_LOGGER }),
    /AUTH_ACCESS_TOKEN_KEYS/,
  );
});

test("only the auth routes let a trusted page send credentials", async (t) => {
  const baseUrl = await startServer(t, { database: { async ping() {} } });

  const preflight = (path, origin) =>
    fetch(`${baseUrl}${path}`, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

  const auth = await preflight("/api/auth/login", "http://localhost:5173");
  const ai = await preflight("/api/ai/generate-diagram", "http://localhost:5173");
  const stranger = await preflight("/api/auth/login", "https://evil.example");

  assert.equal(auth.headers.get("access-control-allow-credentials"), "true");
  assert.equal(auth.headers.get("access-control-allow-origin"), "http://localhost:5173");
  // Nothing outside /api/auth reads the cookie, so nothing else may ask for it.
  assert.equal(ai.headers.get("access-control-allow-credentials"), null);
  // An origin not on the list is never granted anything.
  assert.equal(stranger.headers.get("access-control-allow-origin"), null);
});
