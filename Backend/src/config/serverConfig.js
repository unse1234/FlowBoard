const path = require("node:path");

const DEFAULT_PORT = 3001;
const DEFAULT_CLIENT_ORIGINS = ["http://localhost:5173", "https://flow-board-beige.vercel.app/"];
// gemini-2.5-flash is closed to new API keys; this is the Flash model Google
// directs them to. Override with GEMINI_MODEL.
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
const DEFAULT_AI_RATE_LIMIT_PER_MINUTE = 10;
const LOCAL_ENV_FILE = path.join(__dirname, "..", "..", ".env");

/**
 * Connections this instance may hold.
 *
 * A cluster-wide budget: this multiplied by the number of instances must stay
 * inside the database server's max_connections. Ten is deliberately modest so
 * that scaling out does not exhaust connections before a pooler is in place.
 */
const DEFAULT_DATABASE_POOL_MAX = 10;
const DEFAULT_DATABASE_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_DATABASE_STATEMENT_TIMEOUT_MS = 10_000;
const DEFAULT_DATABASE_APPLICATION_NAME = "flowboard";

function getServerConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? DEFAULT_PORT),
    clientOrigin: (env.CLIENT_ORIGIN
      ? env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
      : DEFAULT_CLIENT_ORIGINS
    ).map(normalizeOrigin),
    // Server-side only. Nothing here is ever sent to a client.
    ai: {
      geminiApiKey: env.GEMINI_API_KEY?.trim() || null,
      geminiModel: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
      rateLimitPerMinute: readNonNegativeInteger(
        env.AI_RATE_LIMIT_PER_MINUTE,
        DEFAULT_AI_RATE_LIMIT_PER_MINUTE,
      ),
    },
    // Server-side only. The connection string carries credentials and must
    // never be logged or returned in a response.
    database: {
      connectionString: env.DATABASE_URL?.trim() || null,
      poolMax: readPositiveInteger(env.DATABASE_POOL_MAX, DEFAULT_DATABASE_POOL_MAX),
      idleTimeoutMs: readNonNegativeInteger(
        env.DATABASE_IDLE_TIMEOUT_MS,
        DEFAULT_DATABASE_IDLE_TIMEOUT_MS,
      ),
      connectionTimeoutMs: readNonNegativeInteger(
        env.DATABASE_CONNECTION_TIMEOUT_MS,
        DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS,
      ),
      statementTimeoutMs: readNonNegativeInteger(
        env.DATABASE_STATEMENT_TIMEOUT_MS,
        DEFAULT_DATABASE_STATEMENT_TIMEOUT_MS,
      ),
      ssl: readDatabaseSsl(env.DATABASE_SSL),
      applicationName:
        env.DATABASE_APPLICATION_NAME?.trim() || DEFAULT_DATABASE_APPLICATION_NAME,
    },
  };
}

/**
 * How to negotiate TLS with the database.
 *
 * `require` verifies the server certificate. `no-verify` encrypts without
 * verifying, which some managed providers need because they present a
 * self-signed certificate — it is weaker, so it has to be asked for by name
 * rather than being what a typo produces.
 */
function readDatabaseSsl(value) {
  const mode = value?.trim().toLowerCase();

  if (mode === "require") return { rejectUnauthorized: true };
  if (mode === "no-verify") return { rejectUnauthorized: false };

  return false;
}

/**
 * Load Backend/.env into process.env for local development.
 *
 * Variables already set in the environment win, so a host's own configuration
 * is never overridden by a stray file, and a missing file is normal in
 * production.
 */
function loadLocalEnvFile(filePath = LOCAL_ENV_FILE) {
  if (typeof process.loadEnvFile !== "function") return false;

  try {
    process.loadEnvFile(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

/** Browsers send Origin without a trailing slash, so a configured one would never match. */
function normalizeOrigin(origin) {
  return origin.replace(/\/+$/, "");
}

function readNonNegativeInteger(value, fallback) {
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Like readNonNegativeInteger, for settings where zero is not a usable value. */
function readPositiveInteger(value, fallback) {
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  getServerConfig,
  loadLocalEnvFile,
};
