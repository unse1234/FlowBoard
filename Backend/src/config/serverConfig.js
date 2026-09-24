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

/**
 * Argon2id cost, per docs/decisions/0004-password-hashing.md.
 *
 * OWASP's 2024 baseline. Raising it strengthens stored passwords and lowers how
 * many logins an instance can serve per second, so it is tuned against real
 * hardware rather than guessed. A hash records the parameters it was made with,
 * so a change upgrades existing accounts on their next login.
 */
const DEFAULT_ARGON2_MEMORY_KIB = 19_456;
const DEFAULT_ARGON2_TIME_COST = 2;
const DEFAULT_ARGON2_PARALLELISM = 1;

/**
 * Signup and sign-in attempts per client per minute.
 *
 * Lower than the AI limit because each attempt costs an Argon2 hash, and a
 * burst of them can occupy the libuv threadpool and delay unrelated work on the
 * instance (finding F-16). Interim: the counters are per-process, so the real
 * limit across N instances is N times this. Phase 7 replaces it with a shared
 * one.
 */
const DEFAULT_AUTH_RATE_LIMIT_PER_MINUTE = 5;

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
    auth: {
      rateLimitPerMinute: readNonNegativeInteger(
        env.AUTH_RATE_LIMIT_PER_MINUTE,
        DEFAULT_AUTH_RATE_LIMIT_PER_MINUTE,
      ),
      argon2: {
        memoryCostKib: readPositiveInteger(
          env.AUTH_ARGON2_MEMORY_KIB,
          DEFAULT_ARGON2_MEMORY_KIB,
        ),
        timeCost: readPositiveInteger(env.AUTH_ARGON2_TIME_COST, DEFAULT_ARGON2_TIME_COST),
        parallelism: readPositiveInteger(
          env.AUTH_ARGON2_PARALLELISM,
          DEFAULT_ARGON2_PARALLELISM,
        ),
      },
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
