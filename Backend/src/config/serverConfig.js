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

/**
 * Refresh, sign-out and "who am I" requests per client per minute (7.3).
 *
 * Generous, because none costs a password hash and several tabs share one
 * client: each refreshes every quarter hour and on every reload. The point is a
 * ceiling on abuse, not a brake on use.
 */
const DEFAULT_AUTH_SESSION_RATE_LIMIT_PER_MINUTE = 60;

/**
 * How long a browser should refuse to reach this API over plain HTTP.
 *
 * 180 days. Zero omits the header entirely, for a deployment that is not
 * behind TLS yet. The header is ignored over HTTP regardless, so it is safe
 * in development.
 */
const DEFAULT_HSTS_MAX_AGE_SECONDS = 15_552_000;

/**
 * Access tokens, per docs/decisions/0002 and 0005.
 *
 * Fifteen minutes is how long a stolen token stays useful and how long a
 * "sign out everywhere" takes to reach every device, so it is kept short and
 * bounded: a value outside the range falls back rather than quietly making
 * revocation take a day.
 */
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 900;
const MIN_ACCESS_TOKEN_TTL_SECONDS = 60;
const MAX_ACCESS_TOKEN_TTL_SECONDS = 3_600;
const ACCESS_TOKEN_ISSUER = "flowboard";
const ACCESS_TOKEN_AUDIENCE = "flowboard-api";

/**
 * Refresh tokens and the sessions they belong to (E-13).
 *
 * Idle: a token not exchanged within 14 days is dead, so a device left alone
 * for two weeks signs in again. Absolute: however active, a session ends after
 * 30 days, because rotation extends a token and never the session.
 */
const DEFAULT_REFRESH_IDLE_TTL_SECONDS = 14 * 24 * 60 * 60;
const MIN_REFRESH_IDLE_TTL_SECONDS = 60 * 60;
const MAX_REFRESH_IDLE_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * How long a refresh token that has just been exchanged may be presented again
 * without being taken as stolen (chunk 2.4). Two tabs refreshing at once, and a
 * retry after a response lost on a bad network, both look like reuse to the
 * server. Kept short: within it, a thief with a copy gets a token too.
 */
const DEFAULT_REFRESH_REUSE_GRACE_SECONDS = 20;
const MAX_REFRESH_REUSE_GRACE_SECONDS = 60;
const MIN_SESSION_TTL_SECONDS = 60 * 60;
const MAX_SESSION_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * The refresh cookie is sent to the auth routes and nowhere else: not to the AI
 * endpoint, not to anything added later. Anything that is not /api/auth never
 * sees it, and so can never be a way to use it.
 */
const REFRESH_COOKIE_PATH = "/api/auth";
const REFRESH_COOKIE_SAME_SITE_VALUES = new Set(["strict", "lax", "none"]);

/**
 * The shared secret Vercel's rewrite adds to every /api/auth request (7.1).
 * 43 characters is 32 random bytes as base64url, the same strength as a
 * signing key.
 */
const MIN_EDGE_SECRET_LENGTH = 43;

/** HMAC-SHA256 keys shorter than its output weaken it, per RFC 2104. */
const MIN_SIGNING_KEY_BYTES = 32;
const SIGNING_KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

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
    security: {
      hstsMaxAgeSeconds: readNonNegativeInteger(
        env.SECURITY_HSTS_MAX_AGE_SECONDS,
        DEFAULT_HSTS_MAX_AGE_SECONDS,
      ),
    },
    auth: {
      rateLimitPerMinute: readNonNegativeInteger(
        env.AUTH_RATE_LIMIT_PER_MINUTE,
        DEFAULT_AUTH_RATE_LIMIT_PER_MINUTE,
      ),
      sessionRateLimitPerMinute: readNonNegativeInteger(
        env.AUTH_SESSION_RATE_LIMIT_PER_MINUTE,
        DEFAULT_AUTH_SESSION_RATE_LIMIT_PER_MINUTE,
      ),
      accessToken: {
        // Server-side only. Never logged, never returned, never defaulted.
        keys: readSigningKeys(env.AUTH_ACCESS_TOKEN_KEYS),
        ttlSeconds: readIntegerInRange(
          env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
          DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
          MIN_ACCESS_TOKEN_TTL_SECONDS,
          MAX_ACCESS_TOKEN_TTL_SECONDS,
        ),
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
      },
      refreshToken: {
        idleTtlSeconds: readIntegerInRange(
          env.AUTH_REFRESH_IDLE_TTL_SECONDS,
          DEFAULT_REFRESH_IDLE_TTL_SECONDS,
          MIN_REFRESH_IDLE_TTL_SECONDS,
          MAX_REFRESH_IDLE_TTL_SECONDS,
        ),
        sessionTtlSeconds: readIntegerInRange(
          env.AUTH_SESSION_TTL_SECONDS,
          DEFAULT_SESSION_TTL_SECONDS,
          MIN_SESSION_TTL_SECONDS,
          MAX_SESSION_TTL_SECONDS,
        ),
        reuseGraceSeconds: readIntegerInRange(
          env.AUTH_REFRESH_REUSE_GRACE_SECONDS,
          DEFAULT_REFRESH_REUSE_GRACE_SECONDS,
          0,
          MAX_REFRESH_REUSE_GRACE_SECONDS,
        ),
      },
      cookie: readRefreshCookie(env),
      // Server-side only, like the signing keys. Null in development, where
      // there is no edge in front and the socket address is the client.
      edgeSecret: readEdgeSecret(env.AUTH_PROXY_SECRET),
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
 * The keys that sign and verify access tokens.
 *
 * `AUTH_ACCESS_TOKEN_KEYS` is a comma-separated list of `id:secret`, where the
 * secret is base64url and at least 32 bytes. The first key signs; every key
 * verifies. To rotate, put a new key first and keep the old one second until
 * the tokens it signed have expired, then remove it.
 *
 * Unset means null: the server then refuses to mount the auth routes rather
 * than issue tokens with some default. Set but malformed is an error at startup,
 * never a fallback: a secret quietly replaced by something else is the worst
 * outcome here. The messages name the entry, never the secret.
 *
 * @returns {{ id: string, secret: Buffer }[] | null}
 */
function readSigningKeys(value) {
  if (value === undefined || value.trim() === "") return null;

  const keys = value.split(",").map((entry, index) => {
    const position = `AUTH_ACCESS_TOKEN_KEYS entry ${index + 1}`;
    const separator = entry.indexOf(":");
    const id = separator === -1 ? "" : entry.slice(0, separator).trim();
    const encodedSecret = separator === -1 ? "" : entry.slice(separator + 1).trim();

    if (!SIGNING_KEY_ID_PATTERN.test(id)) {
      throw new Error(`${position} must be "id:secret", with an id of 1-32 letters, digits, "-" or "_".`);
    }

    const secret = BASE64URL_PATTERN.test(encodedSecret)
      ? Buffer.from(encodedSecret, "base64url")
      : null;

    if (!secret || secret.toString("base64url") !== encodedSecret) {
      throw new Error(`${position} (id "${id}") has a secret that is not base64url.`);
    }
    if (secret.length < MIN_SIGNING_KEY_BYTES) {
      throw new Error(
        `${position} (id "${id}") has a ${secret.length}-byte secret; use at least ${MIN_SIGNING_KEY_BYTES}.`,
      );
    }

    return { id, secret };
  });

  const ids = keys.map((key) => key.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`AUTH_ACCESS_TOKEN_KEYS lists the id "${duplicate}" twice.`);

  return keys;
}

/**
 * The secret that proves an /api/auth request came through FlowBoard's own
 * Vercel rewrite, which alone can vouch for the client's address (7.1).
 *
 * Unset means null, and requests are taken at face value, which is right for
 * development. Set but short or malformed stops startup: a guessable secret
 * would let anyone past the edge claim any address.
 */
function readEdgeSecret(value) {
  if (value === undefined || value.trim() === "") return null;

  const secret = value.trim();
  if (!BASE64URL_PATTERN.test(secret) || secret.length < MIN_EDGE_SECRET_LENGTH) {
    throw new Error(
      `AUTH_PROXY_SECRET must be at least ${MIN_EDGE_SECRET_LENGTH} base64url characters (32 random bytes).`,
    );
  }

  return secret;
}

/**
 * How the refresh cookie is set.
 *
 * Secure unless explicitly turned off, which only local development over
 * plain http should do. A typo leaves it on. A secure cookie takes the
 * `__Secure-` prefix, so a browser refuses it from anything but a secure
 * origin: plain-http traffic cannot plant or overwrite one.
 *
 * SameSite defaults to strict. `none` is only for a web app and API on
 * different sites, which several browsers block outright for cookies (see
 * AUTH_DECISIONS.md E-15). Browsers reject `none` without Secure, so that
 * combination stops startup rather than failing silently in the browser.
 */
function readRefreshCookie(env) {
  const secure = env.AUTH_COOKIE_SECURE?.trim().toLowerCase() !== "false";
  const requested = env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();
  const sameSite = REFRESH_COOKIE_SAME_SITE_VALUES.has(requested) ? requested : "strict";

  if (sameSite === "none" && !secure) {
    throw new Error(
      "AUTH_COOKIE_SAME_SITE=none needs AUTH_COOKIE_SECURE left on: browsers reject SameSite=None without Secure.",
    );
  }

  return {
    name: secure ? "__Secure-flowboard_refresh" : "flowboard_refresh",
    secure,
    sameSite,
    path: REFRESH_COOKIE_PATH,
  };
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

/** For settings where a value outside a range is a misconfiguration, not a choice. */
function readIntegerInRange(value, fallback, min, max) {
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

module.exports = {
  getServerConfig,
  loadLocalEnvFile,
};
