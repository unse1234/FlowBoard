/**
 * Failures the board and invitation API can report (spec Phase C).
 *
 * The same shape as `ai/aiErrors.js` and `auth/authErrors.js`: a code, the
 * status it answers with, a message written for the person using FlowBoard,
 * and `detail` for the log that `toResponseBody` can never send.
 *
 * One rule is encoded in the catalogue rather than left to each route: a
 * board someone cannot open answers BOARD_NOT_FOUND, exactly like a board that
 * does not exist. A different answer would let anyone holding a board id learn
 * that it is real. BOARD_FORBIDDEN is only for people already on the board,
 * who know it exists.
 */

const MAX_BOARD_TITLE_LENGTH = 120;

/** Abuse limits, not product tiers. Named here so the messages quote them. */
const BOARD_LIMITS = Object.freeze({
  OWNED_BOARDS: 100,
  MEMBERS_PER_BOARD: 50,
  LIVE_INVITES_PER_BOARD: 20,
});

const BOARD_ERRORS = Object.freeze({
  BOARD_NOT_FOUND: {
    status: 404,
    message: "That board doesn't exist, or you don't have access to it.",
  },
  BOARD_FORBIDDEN: { status: 403, message: "Only this board's owner can do that." },
  EDIT_FORBIDDEN: { status: 403, message: "You can view this board but not change it." },

  // E-20: collaboration needs a confirmed address; working alone does not.
  EMAIL_NOT_VERIFIED: {
    status: 403,
    message: "Confirm your email address to collaborate. Check your inbox for the link.",
  },

  // One answer for an invitation that is unknown, expired, used up or
  // withdrawn: the next step is the same in every case.
  INVITE_INVALID: {
    status: 410,
    message: "This invitation has expired, has been used, or was withdrawn. Ask the board's owner for a new one.",
  },

  MEMBER_NOT_FOUND: { status: 404, message: "That person isn't on this board." },
  TRANSFER_TARGET_INVALID: {
    status: 400,
    message: "You can only hand a board to someone who is already on it.",
  },

  BOARD_TITLE_REQUIRED: { status: 400, message: "Give the board a name." },
  BOARD_TITLE_TOO_LONG: { status: 400, message: `Use at most ${MAX_BOARD_TITLE_LENGTH} characters.` },
  ROLE_INVALID: { status: 400, message: "Choose editor or viewer." },
  INVITE_OPTIONS_INVALID: {
    status: 400,
    message: "An invitation lasts 1 to 30 days and can be used 1 to 50 times.",
  },

  BOARD_LIMIT_REACHED: {
    status: 409,
    message: `You own ${BOARD_LIMITS.OWNED_BOARDS} boards, the most you can have. Delete one first.`,
  },
  MEMBER_LIMIT_REACHED: {
    status: 409,
    message: `This board already has ${BOARD_LIMITS.MEMBERS_PER_BOARD} people on it, the most it can hold.`,
  },
  INVITE_LIMIT_REACHED: {
    status: 409,
    message: `This board has ${BOARD_LIMITS.LIVE_INVITES_PER_BOARD} open invitations. Withdraw one first.`,
  },

  TOO_MANY_ATTEMPTS: { status: 429, message: "Too many requests. Wait a moment and try again." },
  INVALID_JSON: { status: 400, message: "The request body must be valid JSON." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "That request is too large." },
  INTERNAL: { status: 500, message: "Something went wrong. Try again." },
});

class BoardError extends Error {
  constructor(code, { detail, retryAfterSeconds, cause } = {}) {
    const known = Object.hasOwn(BOARD_ERRORS, code);
    const definition = known ? BOARD_ERRORS[code] : BOARD_ERRORS.INTERNAL;

    super(definition.message, cause === undefined ? undefined : { cause });
    this.name = "BoardError";
    this.code = known ? code : "INTERNAL";
    this.status = definition.status;
    this.detail = detail;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** The only way to serialise one: `detail` and `cause` never leave the server. */
  toResponseBody() {
    return { ok: false, code: this.code, error: this.message };
  }
}

/**
 * Anything thrown by a board route, as something with a safe response body.
 * AuthErrors from the shared session check pass through unchanged.
 */
function toApiError(error) {
  if (error instanceof BoardError) return error;
  if (error?.name === "AuthError" && typeof error.toResponseBody === "function") return error;

  return new BoardError("INTERNAL", {
    detail: error instanceof Error ? error.message : String(error),
    cause: error,
  });
}

module.exports = {
  BOARD_ERRORS,
  BOARD_LIMITS,
  BoardError,
  MAX_BOARD_TITLE_LENGTH,
  toApiError,
};
