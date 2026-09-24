const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp, createShutdownHandler } = require("./server");

const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

const CONFIG = {
  port: 0,
  clientOrigin: ["http://localhost:5173"],
  ai: { geminiApiKey: null, geminiModel: "gemini-test", rateLimitPerMinute: 0 },
  database: {
    connectionString: null,
    poolMax: 10,
    idleTimeoutMs: 30_000,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 10_000,
    ssl: false,
    applicationName: "flowboard-test",
  },
  // Needed because createApp mounts the auth routes whenever a database is
  // injected. Cheap Argon2 settings: these tests never hash anything.
  auth: {
    rateLimitPerMinute: 0,
    argon2: { memoryCostKib: 64, timeCost: 1, parallelism: 1 },
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
