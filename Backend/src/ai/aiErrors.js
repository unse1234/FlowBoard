/**
 * Failures the AI endpoint can report.
 *
 * Each code has the HTTP status it answers with and a message written for the
 * person using FlowBoard. Anything diagnostic — provider errors, validation
 * reasons — goes in `detail`, which is logged on the server and never sent to a
 * client.
 */
const AI_ERRORS = Object.freeze({
  PROMPT_REQUIRED: { status: 400, message: "Describe the diagram you want to create." },
  PROMPT_TOO_LONG: {
    status: 400,
    message: "That description is too long. Shorten it and try again.",
  },
  INVALID_BOARD: { status: 400, message: "The board context couldn't be read." },
  INVALID_JSON: { status: 400, message: "The request body must be valid JSON." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "That request is too large." },
  RATE_LIMITED: {
    status: 429,
    message: "Too many diagram requests. Wait a minute and try again.",
  },
  REQUEST_CANCELLED: { status: 499, message: "The request was cancelled." },
  AI_NOT_CONFIGURED: {
    status: 503,
    message: "AI diagrams aren't set up on this server yet.",
  },
  AI_MISCONFIGURED: {
    status: 502,
    message: "The AI service rejected this server's configuration.",
  },
  AI_RATE_LIMITED: { status: 429, message: "The AI service is busy. Try again in a minute." },
  AI_QUOTA_EXHAUSTED: {
    status: 429,
    message: "FlowBoard's AI quota is used up for now. Try again later.",
  },
  AI_UNAVAILABLE: {
    status: 503,
    message: "The AI service is unavailable right now. Try again shortly.",
  },
  AI_TIMEOUT: {
    status: 504,
    message: "The AI took too long to respond. Try a simpler description.",
  },
  AI_REQUEST_FAILED: {
    status: 502,
    message: "The AI service couldn't handle this request. Try rephrasing it.",
  },
  AI_BLOCKED: {
    status: 422,
    message: "The AI declined this request. Try describing it differently.",
  },
  AI_INVALID_RESPONSE: {
    status: 502,
    message: "The AI returned a diagram FlowBoard couldn't use. Try again.",
  },
  AI_UNSUPPORTED_ELEMENT: {
    status: 502,
    message: "The AI used a shape FlowBoard can't draw. Try again.",
  },
  INTERNAL: { status: 500, message: "Something went wrong while generating the diagram." },
});

class AiError extends Error {
  constructor(code, { detail, retryAfterSeconds, cause } = {}) {
    const known = Object.hasOwn(AI_ERRORS, code);
    const definition = known ? AI_ERRORS[code] : AI_ERRORS.INTERNAL;

    super(definition.message, cause === undefined ? undefined : { cause });
    this.name = "AiError";
    this.code = known ? code : "INTERNAL";
    this.status = definition.status;
    this.detail = detail;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Anything thrown while generating, as an AiError; the unexpected becomes INTERNAL. */
function toAiError(error) {
  if (error instanceof AiError) return error;

  return new AiError("INTERNAL", {
    detail: error instanceof Error ? error.message : String(error),
    cause: error,
  });
}

module.exports = {
  AI_ERRORS,
  AiError,
  toAiError,
};
