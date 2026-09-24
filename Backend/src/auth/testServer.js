const { randomBytes } = require("node:crypto");
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

/** A fresh signing key per run, so no test can depend on a known secret. */
const TEST_SIGNING_KEYS = Object.freeze([Object.freeze({ id: "test", secret: randomBytes(32) })]);

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
  auth: {
    ...DEFAULTS.auth,
    rateLimitPerMinute: 0,
    argon2: TEST_ARGON2,
    accessToken: { ...DEFAULTS.auth.accessToken, keys: TEST_SIGNING_KEYS },
  },
});

/**
 * One Set-Cookie header from a response, parsed, or null if absent.
 *
 * @returns {{ value: string, attributes: Record<string, string | true> } | null}
 */
function readSetCookie(response, name) {
  const header = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  if (!header) return null;

  const [pair, ...parts] = header.split(";").map((part) => part.trim());
  const attributes = {};
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator === -1) attributes[part.toLowerCase()] = true;
    else attributes[part.slice(0, separator).toLowerCase()] = part.slice(separator + 1);
  }

  return { value: pair.slice(name.length + 1), attributes };
}

/** The web app's origin, which every helper request claims unless told otherwise. */
const TRUSTED_ORIGIN = BASE_CONFIG.clientOrigin[0];

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
 * @param {{ rateLimitPerMinute?: number, sessionRateLimitPerMinute?: number, auth?: Object }} [options]
 *   Both limits default to off, so a test meets one only when it asks to.
 *   `auth` replaces whole sections of config.auth, such as `refreshToken`.
 */
async function startAuthServer(
  t,
  { rateLimitPerMinute = 0, sessionRateLimitPerMinute = 0, auth = {}, fetchImpl } = {},
) {
  const config = {
    ...BASE_CONFIG,
    auth: { ...BASE_CONFIG.auth, rateLimitPerMinute, sessionRateLimitPerMinute, ...auth },
  };
  const database = createDatabase({ config: config.database, logger: SILENT_LOGGER });

  await database.query("DROP SCHEMA public CASCADE");
  await database.query("CREATE SCHEMA public");
  await runMigrations({ database, logger: SILENT_LOGGER });

  const { httpServer, io } = createApp(config, {
    database,
    diagramService: { async generateDiagram() {} },
    logger: SILENT_LOGGER,
    // Outbound calls (Turnstile) go here in tests, never to the network.
    fetchImpl,
  });

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    httpServer.closeAllConnections();
    await new Promise((resolve) => io.close(() => resolve()));
    await database.close();
  });

  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  /**
   * POST as the FlowBoard web app would: JSON, from a trusted origin. A header
   * given as null is left out, so a test can send a request with no Origin.
   */
  const post = (path, body, headers = {}) => {
    const merged = { "content-type": "application/json", origin: TRUSTED_ORIGIN, ...headers };
    for (const [name, value] of Object.entries(merged)) if (value === null) delete merged[name];

    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: merged,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  };

  return {
    baseUrl,
    database,
    httpServer,
    io,
    config,
    post,
    signup: (body) => post("/api/auth/signup", body),
    login: (body, headers) => post("/api/auth/login", body, headers),
    /** Present a refresh token as the browser would: in the cookie. Null sends none. */
    refresh: (token, headers = {}) =>
      post("/api/auth/refresh", {}, {
        ...(token === null ? {} : { cookie: `${config.auth.cookie.name}=${token}` }),
        ...headers,
      }),
    /** GET /api/auth/me with a bearer token. Undefined sends no Authorization header. */
    me: (accessToken, headers = {}) =>
      fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
          ...headers,
        },
      }),
    logout: (token, headers = {}) =>
      post("/api/auth/logout", {}, {
        ...(token === null ? {} : { cookie: `${config.auth.cookie.name}=${token}` }),
        ...headers,
      }),
    countUsers: async () =>
      (await database.query("SELECT count(*)::int AS count FROM users")).rows[0].count,
  };
}

module.exports = {
  BASE_CONFIG,
  SILENT_LOGGER,
  SKIP,
  TEST_ARGON2,
  TEST_SIGNING_KEYS,
  TRUSTED_ORIGIN,
  VALID_SIGNUP,
  readSetCookie,
  startAuthServer,
};
