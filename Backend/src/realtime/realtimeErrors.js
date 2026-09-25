/**
 * What the realtime gateway answers when it refuses something (Phase D).
 *
 * The same idea as the HTTP error catalogues: a code the client acts on, and a
 * message written for a person. Acknowledgements are `{ ok: false, code,
 * error }`; a refused connection is an Error whose `data` carries the code,
 * which Socket.IO delivers to the client's `connect_error`.
 *
 * Diagnostics stay in the server log. Nothing here says more than the client
 * needs to decide what to do next.
 */

const REALTIME_ERRORS = Object.freeze({
  // Handshake
  ORIGIN_NOT_ALLOWED: "This connection didn't come from FlowBoard.",
  AUTH_REQUIRED: "Sign in to collaborate.",
  SESSION_ENDED: "Your session has ended. Sign in again.",

  // Boards
  BOARD_NOT_FOUND: "That board doesn't exist, or you don't have access to it.",
  EMAIL_NOT_VERIFIED: "Confirm your email address to collaborate.",
  EDIT_FORBIDDEN: "You can view this board but not change it.",
  NOT_JOINED: "Open the board before sending changes to it.",
  INVALID_PAYLOAD: "That message wasn't understood.",

  RATE_LIMITED: "Slow down a little; too much is being sent at once.",
  UNAVAILABLE: "The board server couldn't check your access just now. Try again.",
});

/** An acknowledgement refusing something. */
function refusal(code, reason) {
  const message = REALTIME_ERRORS[code] ?? REALTIME_ERRORS.INVALID_PAYLOAD;
  return reason ? { ok: false, code, error: message, reason } : { ok: false, code, error: message };
}

/** A handshake refusal: Socket.IO sends `message` and `data` to the client. */
function connectionRefusal(code) {
  const error = new Error(REALTIME_ERRORS[code] ?? REALTIME_ERRORS.AUTH_REQUIRED);
  error.data = { code };
  return error;
}

module.exports = {
  REALTIME_ERRORS,
  connectionRefusal,
  refusal,
};
