/**
 * Sends one email through Resend's HTTP API (AUTH_DECISIONS.md E-19).
 *
 * Plain `fetch` rather than Resend's SDK: the whole integration is one POST,
 * and the project prefers the platform to a dependency for that (rule 50), as
 * with Turnstile in `auth/botCheck.js`.
 *
 * **Retries reuse the idempotency key.** A request that timed out may still
 * have been delivered, so it is retried under the same `Idempotency-Key`, and
 * Resend answers a repeat with the original result instead of sending twice.
 * Only failures that can clear on their own are retried: the network, a 5xx,
 * Resend's per-second limit, and a request still in flight under the same key.
 * A quota, a bad key or a rejected payload will fail the same way every time.
 *
 * Nothing sent or received is logged beyond Resend's error type and status.
 * The body carries a token and the API key is in a header.
 */

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;
/** Waits before the second and third attempts. */
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([500, 2_000]);
/** Resend's limit on an idempotency key. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

/** Resend error types that a later attempt can succeed past. */
const RETRYABLE_TYPES = new Set(["rate_limit_exceeded", "concurrent_idempotent_requests"]);

class EmailDeliveryError extends Error {
  /**
   * @param {string} message  diagnostic, for the log only
   * @param {{ status?: number | null, type?: string | null, retryable?: boolean }} [details]
   */
  constructor(message, { status = null, type = null, retryable = false } = {}) {
    super(message);
    this.name = "EmailDeliveryError";
    this.status = status;
    this.type = type;
    this.retryable = retryable;
  }
}

/**
 * @param {Object} options
 * @param {string} options.apiKey  RESEND_API_KEY
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs]  per attempt
 * @param {readonly number[]} [options.retryDelaysMs]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 */
function createResendTransport({
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("The Resend transport needs an API key. Set RESEND_API_KEY.");
  }

  async function attempt(body, idempotencyKey) {
    let response;
    try {
      response = await fetchImpl(RESEND_EMAILS_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new EmailDeliveryError(`Resend unreachable: ${error?.name ?? "error"}`, { retryable: true });
    }

    const payload = await response.json().catch(() => null);

    if (response.ok && typeof payload?.id === "string") return { id: payload.id };

    const type = typeof payload?.name === "string" ? payload.name : null;
    throw new EmailDeliveryError(`Resend answered ${response.status}${type ? ` (${type})` : ""}`, {
      status: response.status,
      type,
      retryable: response.status >= 500 || RETRYABLE_TYPES.has(type),
    });
  }

  return {
    name: "resend",

    /**
     * @param {{ from: string, to: string, subject: string, html: string, text: string,
     *   idempotencyKey: string, tags?: { name: string, value: string }[] }} message
     * @returns {Promise<{ id: string }>} Resend's id for the email
     */
    async send({ from, to, subject, html, text, idempotencyKey, tags = [] }) {
      if (
        typeof idempotencyKey !== "string" ||
        idempotencyKey.length === 0 ||
        idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
      ) {
        throw new TypeError("Every email needs an idempotency key of 1-256 characters.");
      }

      const body = { from, to: [to], subject, html, text, tags };

      for (let index = 0; ; index += 1) {
        try {
          return await attempt(body, idempotencyKey);
        } catch (error) {
          if (!error.retryable || index >= retryDelaysMs.length) throw error;
          await sleep(retryDelaysMs[index]);
        }
      }
    },
  };
}

module.exports = {
  EmailDeliveryError,
  RESEND_EMAILS_URL,
  createResendTransport,
};
