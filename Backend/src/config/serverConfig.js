const path = require("node:path");

const DEFAULT_PORT = 3001;
const DEFAULT_CLIENT_ORIGINS = ["http://localhost:5173", "https://flow-board-beige.vercel.app/"];
// gemini-2.5-flash is closed to new API keys; this is the Flash model Google
// directs them to. Override with GEMINI_MODEL.
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
const DEFAULT_AI_RATE_LIMIT_PER_MINUTE = 10;
const LOCAL_ENV_FILE = path.join(__dirname, "..", "..", ".env");

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

module.exports = {
  getServerConfig,
  loadLocalEnvFile,
};
