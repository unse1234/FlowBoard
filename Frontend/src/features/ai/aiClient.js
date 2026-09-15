import { getRealtimeUrl } from "../realtime/config/realtimeConfig.js";

/** Mirrors MAX_PROMPT_LENGTH in Backend/src/ai/diagramRequest.js; diagramContract.test.js checks. */
export const AI_PROMPT_MAX_LENGTH = 2000;

/** A little beyond the server's own limit on one generation, including its retry. */
const REQUEST_TIMEOUT_MS = 75_000;

const CLIENT_MESSAGES = Object.freeze({
  NETWORK: "Can't reach the FlowBoard server. Check your connection and try again.",
  TIMEOUT: "The AI took too long to respond. Try again.",
  CANCELLED: "Generation cancelled.",
  BAD_RESPONSE: "The server sent an unexpected response. Try again.",
});

export class AiRequestError extends Error {
  /**
   * @param {string} code - the server's error code, or NETWORK, TIMEOUT, CANCELLED, HTTP_<status>
   * @param {string} message - safe to show a user
   */
  constructor(code, message) {
    super(message);
    this.name = "AiRequestError";
    this.code = code;
  }
}

/**
 * Ask FlowBoard's server to generate a diagram.
 *
 * The browser never talks to an AI provider: the server holds the API key and
 * validates what the model returns before any of it comes back here.
 *
 * @param {Object} request
 * @param {string} request.prompt
 * @param {Object[]} [request.board] - compact context from buildBoardContext
 * @param {AbortSignal} [request.signal]
 * @param {typeof fetch} [request.fetchImpl]
 * @param {string} [request.baseUrl]
 * @param {number} [request.timeoutMs]
 * @returns {Promise<Object>} the validated diagram
 * @throws {AiRequestError}
 */
export async function requestDiagram({
  prompt,
  board,
  signal,
  fetchImpl = globalThis.fetch,
  baseUrl = getRealtimeUrl(),
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => controller.abort();

  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });

  const interrupted = () => {
    if (timedOut) return new AiRequestError("TIMEOUT", CLIENT_MESSAGES.TIMEOUT);
    if (signal?.aborted) return new AiRequestError("CANCELLED", CLIENT_MESSAGES.CANCELLED);
    return null;
  };

  try {
    let response;
    try {
      response = await fetchImpl(`${String(baseUrl).replace(/\/+$/, "")}/api/ai/generate-diagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(board?.length ? { prompt, board } : { prompt }),
        signal: controller.signal,
      });
    } catch {
      throw interrupted() ?? new AiRequestError("NETWORK", CLIENT_MESSAGES.NETWORK);
    }

    const body = await response.json().catch(() => null);
    const stopped = interrupted();
    if (stopped) throw stopped;

    if (response.ok && body?.ok === true && body.diagram) return body.diagram;

    throw new AiRequestError(
      typeof body?.code === "string" ? body.code : `HTTP_${response.status}`,
      typeof body?.error === "string" && body.error ? body.error : CLIENT_MESSAGES.BAD_RESPONSE,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
