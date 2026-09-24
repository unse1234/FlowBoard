const {
  AuthError,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  authErrorForEmailReason,
} = require("./authErrors");
const { parseEmailAddress } = require("./emailAddress");

/**
 * Check and normalise a signup request.
 *
 * The same shape as Backend/src/ai/diagramRequest.js: throws an AuthError the
 * route can answer with directly, so no route has to word its own messages.
 *
 * @param {{ email?: unknown, password?: unknown, displayName?: unknown }} [body]
 * @returns {{ email: string, emailNormalized: string, password: string, displayName: string }}
 * @throws {AuthError}
 */
function parseSignupRequest({ email, password, displayName } = {}) {
  const parsedEmail = parseEmailAddress(email);
  if (!parsedEmail.valid) throw authErrorForEmailReason(parsedEmail.reason);

  return {
    email: parsedEmail.email,
    emailNormalized: parsedEmail.emailNormalized,
    password: parsePassword(password),
    displayName: parseDisplayName(displayName),
  };
}

/**
 * A password is taken exactly as given.
 *
 * Deliberately not trimmed: a leading or trailing space is a character the
 * person chose, and silently removing it means the password they typed is not
 * the password that was stored.
 */
function parsePassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new AuthError("PASSWORD_REQUIRED");
  }

  // Counted in code points, so an emoji costs one rather than two.
  const length = Array.from(password).length;

  if (length < MIN_PASSWORD_LENGTH) {
    throw new AuthError("PASSWORD_TOO_SHORT", { detail: `length ${length}` });
  }
  if (length > MAX_PASSWORD_LENGTH) {
    throw new AuthError("PASSWORD_TOO_LONG", { detail: `length ${length}` });
  }

  return password;
}

/**
 * A display name is shown to other people in the board, so it is trimmed and
 * checked for characters that would let it misrepresent itself.
 */
function parseDisplayName(displayName) {
  if (typeof displayName !== "string") throw new AuthError("DISPLAY_NAME_REQUIRED");

  // NFC for the same reason as an address: two spellings of the same name
  // should not be two different stored values.
  const name = displayName.normalize("NFC").trim();

  if (name.length === 0) throw new AuthError("DISPLAY_NAME_REQUIRED");

  if (Array.from(name).length > MAX_DISPLAY_NAME_LENGTH) {
    throw new AuthError("DISPLAY_NAME_TOO_LONG");
  }

  if (containsCodePointIn(name, UNSAFE_NAME_CODE_POINTS)) {
    throw new AuthError("DISPLAY_NAME_REQUIRED", { detail: "unsafe characters" });
  }

  return name;
}

/**
 * Control, zero-width and bidirectional-formatting characters.
 *
 * A display name appears in the people list and beside a live cursor. A
 * bidi override makes rendered text read differently from what it contains,
 * which is how a name impersonates another one.
 *
 * Written as numeric ranges rather than a regex literal, matching
 * Backend/src/ai/sanitize.js: an escape sequence for an invisible code point is
 * easy to turn into the character itself while editing, and the file is then
 * silently wrong.
 */
const UNSAFE_NAME_CODE_POINTS = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
];

function containsCodePointIn(text, ranges) {
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (ranges.some(([from, to]) => codePoint >= from && codePoint <= to)) return true;
  }

  return false;
}

module.exports = {
  parseSignupRequest,
};
