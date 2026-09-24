const { randomUUID } = require("node:crypto");
const { AuthError } = require("./authErrors");

/**
 * Cloudflare Turnstile verification for signup (chunk 7.5, AUTH_DECISIONS.md
 * E-18).
 *
 * The browser solves a challenge (usually invisibly) and sends a token. Here
 * the token is checked with Cloudflare before any account work is done.
 * Following Cloudflare's server-side validation guide:
 * - tokens are single-use and live 300 seconds, so a replay fails;
 * - at most 2048 characters, so anything longer is refused unread;
 * - the `action` the widget declared must be the one this route expects, so
 *   a token solved elsewhere on the site cannot be spent here.
 *
 * **Fails closed.** If Cloudflare cannot be reached, signup is refused with a
 * message saying so, never waved through. An outage that let every bot in
 * would be worse than one that made people wait.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
const DEFAULT_TIMEOUT_MS = 5_000;

/** The action the signup widget declares (Frontend: TurnstileWidget). */
const SIGNUP_ACTION = "signup";

/**
 * @param {Object} options
 * @param {string} options.secretKey  TURNSTILE_SECRET_KEY
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs]
 * @param {Pick<Console, "warn" | "error">} [options.logger]
 */
function createTurnstileVerifier({
  secretKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = console,
}) {
  if (typeof secretKey !== "string" || secretKey === "") {
    throw new Error("Turnstile needs a secret key. Set TURNSTILE_SECRET_KEY.");
  }

  return {
    /**
     * Throws BOT_CHECK_FAILED for a token that does not pass, and
     * BOT_CHECK_UNAVAILABLE when Cloudflare cannot say either way.
     *
     * @param {unknown} token  from the request body
     * @param {{ remoteIp?: string | null, action?: string }} [context]
     */
    async verify(token, { remoteIp = null, action = SIGNUP_ACTION } = {}) {
      if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
        throw new AuthError("BOT_CHECK_FAILED", { detail: "missing or oversized token" });
      }

      const body = {
        secret: secretKey,
        response: token,
        // Lets Cloudflare recognise a retry of this same check.
        idempotency_key: randomUUID(),
      };
      if (remoteIp) body.remoteip = remoteIp;

      let result;
      try {
        const response = await fetchImpl(SITEVERIFY_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`siteverify answered ${response.status}`);
        result = await response.json();
      } catch (error) {
        // Never log the body: it carries the secret key.
        logger.error?.("[auth] Turnstile could not be reached.", { message: error?.message });
        throw new AuthError("BOT_CHECK_UNAVAILABLE", { detail: error?.message });
      }

      if (result?.success !== true) {
        throw new AuthError("BOT_CHECK_FAILED", {
          detail: `siteverify: ${Array.isArray(result?.["error-codes"]) ? result["error-codes"].join(",") : "no success"}`,
        });
      }

      // Cloudflare's test keys answer without an action, so only a present one
      // is compared. A real widget always sends the one it was rendered with.
      if (typeof result.action === "string" && result.action !== "" && result.action !== action) {
        throw new AuthError("BOT_CHECK_FAILED", { detail: `action ${result.action}, expected ${action}` });
      }
    },
  };
}

module.exports = {
  SIGNUP_ACTION,
  SITEVERIFY_URL,
  createTurnstileVerifier,
};
