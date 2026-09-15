const { ApiError, GoogleGenAI } = require("@google/genai");
const { AiError } = require("../aiErrors");

// Generations under load have been measured at 15-25 s; this leaves room for
// that plus the one retry below.
const REQUEST_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 800;

const GENERATION_CONFIG = Object.freeze({
  responseMimeType: "application/json",
  // The same request should draw much the same diagram.
  temperature: 0.2,
  maxOutputTokens: 8192,
  // Describing a diagram is structured extraction, not reasoning. Skipping
  // thinking keeps a generation to a few seconds.
  thinkingConfig: { thinkingBudget: 0 },
});

const BLOCKED_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
]);

const API_KEY_PATTERN = /AIza[0-9A-Za-z_-]{20,}/g;

/**
 * The Gemini provider.
 *
 * Everything specific to Google's SDK lives in this file. The rest of the
 * backend reaches a provider through `generateJson` and only ever sees
 * AiErrors, so another provider can sit beside this one without its callers
 * changing.
 *
 * @param {{ geminiApiKey: string | null, geminiModel: string }} config
 * @param {Object} [options]
 * @param {(options: { apiKey: string }) => object} [options.createClient]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.retryDelayMs]
 */
function createGeminiProvider(
  { geminiApiKey, geminiModel },
  {
    createClient = (options) => new GoogleGenAI(options),
    timeoutMs = REQUEST_TIMEOUT_MS,
    retryDelayMs = RETRY_DELAY_MS,
  } = {},
) {
  let client = null;

  return {
    name: "gemini",
    model: geminiModel,

    /**
     * @param {{ systemInstruction: string, prompt: string, schema: object, signal?: AbortSignal }} request
     * @returns {Promise<{ text: string, usage: object | null }>}
     */
    async generateJson({ systemInstruction, prompt, schema, signal }) {
      if (!geminiApiKey) {
        throw new AiError("AI_NOT_CONFIGURED", { detail: "GEMINI_API_KEY is not set." });
      }

      client ??= createClient({ apiKey: geminiApiKey });

      const timeout = AbortSignal.timeout(timeoutMs);
      const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const request = {
        model: geminiModel,
        contents: prompt,
        config: {
          ...GENERATION_CONFIG,
          systemInstruction,
          responseJsonSchema: schema,
          abortSignal,
        },
      };

      let response;
      try {
        response = await generateWithRetry(client, request, { signal: abortSignal, retryDelayMs });
      } catch (error) {
        throw toAiError(error, {
          cancelled: Boolean(signal?.aborted),
          timedOut: timeout.aborted,
          timeoutMs,
        });
      }

      return readJsonText(response);
    },
  };
}

/**
 * Gemini answers 500 or 503 while a model is briefly overloaded, and a second
 * attempt a moment later usually succeeds. So one retry, inside the same
 * timeout — rate limits and rejected requests are never retried.
 */
async function generateWithRetry(client, request, { signal, retryDelayMs }) {
  try {
    return await client.models.generateContent(request);
  } catch (error) {
    if (!isTransient(error) || signal.aborted) throw error;

    await wait(retryDelayMs, signal);
    return client.models.generateContent(request);
  }
}

function isTransient(error) {
  const status = Number(error?.status);
  return status === 500 || status === 503;
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);

    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function readJsonText(response) {
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new AiError("AI_BLOCKED", { detail: `Prompt blocked (${blockReason}).` });
  }

  const finishReason = response?.candidates?.[0]?.finishReason;
  if (BLOCKED_FINISH_REASONS.has(finishReason)) {
    throw new AiError("AI_BLOCKED", { detail: `Response stopped (${finishReason}).` });
  }
  if (finishReason === "MAX_TOKENS") {
    throw new AiError("AI_INVALID_RESPONSE", {
      detail: "Response was cut off at the output token limit.",
    });
  }

  const text = response?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new AiError("AI_INVALID_RESPONSE", {
      detail: `Response had no text (finishReason: ${finishReason ?? "none"}).`,
    });
  }

  return { text, usage: response.usageMetadata ?? null };
}

function toAiError(error, { cancelled, timedOut, timeoutMs }) {
  if (cancelled) return new AiError("REQUEST_CANCELLED", { cause: error });

  if (timedOut || error?.name === "AbortError" || error?.name === "TimeoutError") {
    return new AiError("AI_TIMEOUT", { detail: `No response within ${timeoutMs} ms.`, cause: error });
  }

  const detail = describe(error);
  const status = Number(error?.status);

  // No HTTP status means the request never completed: DNS, a reset, no network.
  if (!(error instanceof ApiError) && !Number.isInteger(status)) {
    return new AiError("AI_UNAVAILABLE", { detail, cause: error });
  }

  if (status === 429) {
    // A daily quota does not clear in the few seconds Gemini's retry hint
    // suggests, so it is reported as used up, with no retry delay.
    if (/PerDay/i.test(String(error.message))) {
      return new AiError("AI_QUOTA_EXHAUSTED", { detail, cause: error });
    }

    return new AiError("AI_RATE_LIMITED", {
      detail,
      retryAfterSeconds: readRetryDelay(error.message),
      cause: error,
    });
  }

  if (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    (status === 400 && /api key/i.test(String(error.message)))
  ) {
    return new AiError("AI_MISCONFIGURED", { detail, cause: error });
  }

  if (status >= 500) return new AiError("AI_UNAVAILABLE", { detail, cause: error });

  return new AiError("AI_REQUEST_FAILED", { detail, cause: error });
}

/** A loggable summary of a provider error, with anything shaped like a key removed. */
function describe(error) {
  const status = error?.status ? `${error.status} ` : "";
  const message = String(error?.message ?? error).replace(API_KEY_PATTERN, "[redacted]");

  return `${status}${message}`.slice(0, 500);
}

/** Gemini's 429 body carries a RetryInfo delay such as "37s". */
function readRetryDelay(message) {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(String(message ?? ""));

  return match ? Math.max(1, Math.ceil(Number(match[1]))) : undefined;
}

module.exports = {
  createGeminiProvider,
};
