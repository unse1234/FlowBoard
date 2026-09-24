const { getServerConfig, loadLocalEnvFile } = require("../config/serverConfig");
const { createDatabase } = require("../db/createDatabase");
const { runMigrations } = require("../db/migrate");
const { createApp } = require("../server");

/**
 * A running FlowBoard server with an empty database, for auth route tests.
 *
 * Not a `.test.js` file, so the runner does not try to execute it.
 *
 * Every caller resets the schema of one shared database, which is why the
 * backend suite runs with `--test-concurrency=1` (see package.json). Running
 * test files in parallel makes them drop the schema under each other.
 */

loadLocalEnvFile();

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();

/** Falsy when a database is configured, otherwise the reason tests are skipped. */
const SKIP = TEST_DATABASE_URL ? false : "set TEST_DATABASE_URL to run auth route tests";

const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

/** Argon2 at its cheapest: these tests exercise routes, not the hash. */
const TEST_ARGON2 = Object.freeze({ memoryCostKib: 64, timeCost: 1, parallelism: 1 });

/**
 * Derived from the real configuration rather than written out, so that adding a
 * section to serverConfig cannot leave this fixture stale. Hand-built copies
 * drifted three times while Step 1 was being built, each time surfacing as a
 * TypeError deep inside createApp rather than as anything informative.
 */
const DEFAULTS = getServerConfig({});
const BASE_CONFIG = Object.freeze({
  ...DEFAULTS,
  port: 0,
  clientOrigin: ["http://localhost:5173"],
  ai: { ...DEFAULTS.ai, geminiModel: "gemini-test", rateLimitPerMinute: 0 },
  database: {
    ...DEFAULTS.database,
    connectionString: TEST_DATABASE_URL,
    poolMax: 4,
    statementTimeoutMs: 15_000,
  },
  auth: { ...DEFAULTS.auth, rateLimitPerMinute: 0, argon2: TEST_ARGON2 },
});

/** A signup body that passes every rule, for tests to vary one field of. */
const VALID_SIGNUP = Object.freeze({
  email: "Ada.Lovelace@Example.com",
  password: "a-perfectly-fine-passphrase",
  displayName: "Ada Lovelace",
});

/**
 * Start a server against a freshly migrated database.
 *
 * @param {import("node:test").TestContext} t
 * @param {{ rateLimitPerMinute?: number }} [options]
 */
async function startAuthServer(t, { rateLimitPerMinute = 0 } = {}) {
  const config = {
    ...BASE_CONFIG,
    auth: { ...BASE_CONFIG.auth, rateLimitPerMinute },
  };
  const database = createDatabase({ config: config.database, logger: SILENT_LOGGER });

  await database.query("DROP SCHEMA public CASCADE");
  await database.query("CREATE SCHEMA public");
  await runMigrations({ database, logger: SILENT_LOGGER });

  const { httpServer, io } = createApp(config, {
    database,
    diagramService: { async generateDiagram() {} },
    logger: SILENT_LOGGER,
  });

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    httpServer.closeAllConnections();
    await new Promise((resolve) => io.close(() => resolve()));
    await database.close();
  });

  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  const post = (path, body) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  return {
    baseUrl,
    database,
    httpServer,
    io,
    config,
    signup: (body) => post("/api/auth/signup", body),
    login: (body) => post("/api/auth/login", body),
    countUsers: async () =>
      (await database.query("SELECT count(*)::int AS count FROM users")).rows[0].count,
  };
}

module.exports = {
  BASE_CONFIG,
  SILENT_LOGGER,
  SKIP,
  TEST_ARGON2,
  VALID_SIGNUP,
  startAuthServer,
};
