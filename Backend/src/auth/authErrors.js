const { EMAIL_REASONS } = require("./emailAddress");

/**
 * Failures the authentication endpoints can report.
 *
 * The same shape as Backend/src/ai/aiErrors.js: each code carries the HTTP
 * status it answers with and a message written for the person using FlowBoard.
 * Anything diagnostic goes in `detail`, which is logged and never sent.
 *
 * Two rules are encoded here rather than left to each route, because they are
 * easy to break by accident and the breakage is invisible in testing:
 *
 * 1. A failed credential check always answers INVALID_CREDENTIALS, whether the
 *    address is unknown, the password is wrong, or the account has no password
 *    at all. Anything else lets a caller discover which addresses are
 *    registered by reading status codes.
 *
 * 2. `detail` never reaches a client. `toResponseBody` is the only way to build
 *    a response body, so a route cannot spread the error object by mistake.
 */

/**
 * Password length policy, in code points.
 *
 * Stated here because this module owns the wording that tells a user the
 * requirement, and two sources for the number would eventually disagree. If a
 * password policy module appears later, these move there and this imports them.
 *
 * Distinct from `MAX_PASSWORD_BYTES` in passwordHasher.js, which is a
 * denial-of-service guard measured in bytes rather than a rule for users.
 */
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

const MAX_DISPLAY_NAME_LENGTH = 80;

const AUTH_ERRORS = Object.freeze({
  EMAIL_REQUIRED: { status: 400, message: "Enter your email address." },
  EMAIL_INVALID: { status: 400, message: "That email address doesn't look right." },
  EMAIL_TOO_LONG: { status: 400, message: "That email address is too long." },

  PASSWORD_REQUIRED: { status: 400, message: "Enter a password." },
  PASSWORD_TOO_SHORT: {
    status: 400,
    message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  },
  PASSWORD_TOO_LONG: {
    status: 400,
    message: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
  },

  DISPLAY_NAME_REQUIRED: { status: 400, message: "Enter a name to display." },
  DISPLAY_NAME_TOO_LONG: {
    status: 400,
    message: `Use at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
  },

  // Unreachable from signup, which answers identically whether or not the
  // address is taken (AUTH_DECISIONS.md E-12), and unreachable from a login.
  // Kept for an authenticated flow that may legitimately report it, such as
  // changing your own address in Phase 6.
  EMAIL_ALREADY_REGISTERED: {
    status: 409,
    message: "That email address is already registered.",
  },

  // The single answer to every failed credential check. Deliberately says
  // nothing about which half was wrong.
  INVALID_CREDENTIALS: {
    status: 401,
    message: "That email address and password don't match.",
  },

  // Reachable only *after* a password has been verified. Answering it before
  // that would tell an unauthenticated caller that the account exists, which is
  // why it is deliberately absent from CREDENTIAL_CHECK_CODES below. Vague
  // between suspended and pending-deletion on purpose: the person who owns the
  // account already knows which, and nobody else needs to.
  ACCOUNT_UNAVAILABLE: {
    status: 403,
    message: "This account isn't available. Contact support if you think that's wrong.",
  },

  TOO_MANY_ATTEMPTS: {
    status: 429,
    message: "Too many attempts. Wait a moment and try again.",
  },

  INVALID_JSON: { status: 400, message: "The request body must be valid JSON." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "That request is too large." },

  INTERNAL: { status: 500, message: "Something went wrong. Try again." },
});

/**
 * Codes a *failed* credential check may answer with.
 *
 * Anything outside this set would let a caller learn something about an account
 * by guessing at it. A test asserts none of these messages hints at whether an
 * address is registered.
 *
 * ACCOUNT_UNAVAILABLE is deliberately not here: it is reachable only once the
 * password has already verified, so it is answered to the account's owner
 * rather than to someone probing.
 */
const CREDENTIAL_CHECK_CODES = Object.freeze([
  "INVALID_CREDENTIALS",
  "TOO_MANY_ATTEMPTS",
  "INTERNAL",
]);

class AuthError extends Error {
  constructor(code, { detail, retryAfterSeconds, cause } = {}) {
    const known = Object.hasOwn(AUTH_ERRORS, code);
    const definition = known ? AUTH_ERRORS[code] : AUTH_ERRORS.INTERNAL;

    super(definition.message, cause === undefined ? undefined : { cause });
    this.name = "AuthError";
    this.code = known ? code : "INTERNAL";
    this.status = definition.status;
    this.detail = detail;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /**
   * The body a client receives.
   *
   * The only supported way to serialise one of these. `detail` and `cause`
   * carry diagnostics — a validation reason, a provider message, sometimes an
   * address — and must not leave the server, so they are absent by
   * construction rather than by each route remembering to omit them.
   */
  toResponseBody() {
    return { ok: false, code: this.code, error: this.message };
  }
}

/**
 * Anything thrown while authenticating, as an AuthError.
 *
 * An unexpected failure becomes INTERNAL, so a stack trace or a driver message
 * cannot escape through an error this module did not create.
 */
function toAuthError(error) {
  if (error instanceof AuthError) return error;

  return new AuthError("INTERNAL", {
    detail: error instanceof Error ? error.message : String(error),
    cause: error,
  });
}

/**
 * The AuthError for a reason code from `parseEmailAddress`.
 *
 * The structural reasons collapse into one user-facing answer: knowing that a
 * domain label was too long helps nobody, and the specific reason is kept in
 * `detail` for the log.
 *
 * @param {string} reason
 * @returns {AuthError}
 */
function authErrorForEmailReason(reason) {
  if (reason === EMAIL_REASONS.REQUIRED) return new AuthError("EMAIL_REQUIRED");

  if (
    reason === EMAIL_REASONS.TOO_LONG ||
    reason === EMAIL_REASONS.LOCAL_PART_TOO_LONG ||
    reason === EMAIL_REASONS.DOMAIN_TOO_LONG
  ) {
    return new AuthError("EMAIL_TOO_LONG", { detail: reason });
  }

  return new AuthError("EMAIL_INVALID", { detail: reason });
}

/**
 * The one failure a credential check reports.
 *
 * Call this for an unknown address, a wrong password and an account with no
 * password alike. The `detail` records which it actually was, for the log.
 *
 * @param {string} [detail]
 * @returns {AuthError}
 */
function invalidCredentials(detail) {
  return new AuthError("INVALID_CREDENTIALS", { detail });
}

module.exports = {
  AUTH_ERRORS,
  AuthError,
  CREDENTIAL_CHECK_CODES,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  authErrorForEmailReason,
  invalidCredentials,
  toAuthError,
};
