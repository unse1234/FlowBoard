/**
 * Sign-in and sign-up form rules, checked before a request is sent.
 *
 * The server is the authority and checks everything again. These exist so a
 * person hears "Use at least 12 characters" while typing, not after a round
 * trip. They use the server's own codes and wording (Backend/src/auth/
 * authErrors.js), so a message reads the same whichever side caught it, and a
 * server error lands on the same field a client one would. authContract.test.js
 * fails if the limits or the wording drift apart.
 */

/**
 * Mirrors MAX_EMAIL_LENGTH in Backend/src/auth/emailAddress.js, measured the
 * way the server measures the whole address: UTF-16 units after NFC and
 * trimming. A client check must never be stricter than the server's, or it
 * turns away an address the server would accept. The server's byte limits
 * on the local part and domain stay the server's to apply.
 */
export const MAX_EMAIL_LENGTH = 254;
/** Mirror Backend/src/auth/authErrors.js; counted in code points, as the server counts. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_DISPLAY_NAME_LENGTH = 80;

export const FORM_MESSAGES = Object.freeze({
  EMAIL_REQUIRED: "Enter your email address.",
  EMAIL_INVALID: "That email address doesn't look right.",
  EMAIL_TOO_LONG: "That email address is too long.",
  PASSWORD_REQUIRED: "Enter a password.",
  PASSWORD_TOO_SHORT: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  PASSWORD_TOO_LONG: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
  DISPLAY_NAME_REQUIRED: "Enter a name to display.",
  DISPLAY_NAME_TOO_LONG: `Use at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
});

export const AUTH_MODES = Object.freeze({ SIGN_IN: "sign-in", SIGN_UP: "sign-up" });

const codePoints = (text) => Array.from(text).length;

/**
 * Deliberately loose: one "@", something either side, and a dot in the
 * domain. Anything subtler, such as internationalised addresses, is left to
 * the server, whose rules are the ones that count.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {{ email: string, password: string, displayName?: string }} values
 * @param {typeof AUTH_MODES[keyof typeof AUTH_MODES]} mode
 * @returns {{ email?: string, password?: string, displayName?: string }} a code per invalid field
 */
export function validateAuthForm(values, mode) {
  const errors = {};

  const email = values.email.normalize("NFC").trim();
  if (email === "") errors.email = "EMAIL_REQUIRED";
  else if (email.length > MAX_EMAIL_LENGTH) errors.email = "EMAIL_TOO_LONG";
  else if (!EMAIL_SHAPE.test(email)) errors.email = "EMAIL_INVALID";

  // Sign-in applies no password policy, exactly like the server: an account
  // made under an older policy must still be able to sign in, and a length
  // hint there would be a small oracle of its own.
  if (values.password === "") errors.password = "PASSWORD_REQUIRED";
  else if (mode === AUTH_MODES.SIGN_UP) {
    const length = codePoints(values.password);
    if (length < MIN_PASSWORD_LENGTH) errors.password = "PASSWORD_TOO_SHORT";
    else if (length > MAX_PASSWORD_LENGTH) errors.password = "PASSWORD_TOO_LONG";
  }

  if (mode === AUTH_MODES.SIGN_UP) {
    const name = (values.displayName ?? "").normalize("NFC").trim();
    if (name === "") errors.displayName = "DISPLAY_NAME_REQUIRED";
    else if (codePoints(name) > MAX_DISPLAY_NAME_LENGTH) errors.displayName = "DISPLAY_NAME_TOO_LONG";
  }

  return errors;
}

/**
 * The field a server error belongs to, or null for one about the whole form.
 *
 * @param {string} code
 * @returns {"email" | "password" | "displayName" | null}
 */
export function fieldForErrorCode(code) {
  if (code.startsWith("EMAIL_")) return "email";
  if (code.startsWith("PASSWORD_")) return "password";
  if (code.startsWith("DISPLAY_NAME_")) return "displayName";
  return null;
}

/** What a field's code reads as. */
export function messageForCode(code) {
  return FORM_MESSAGES[code] ?? "";
}

/** How many more characters a new password needs, as words, or null once it has enough. */
export function passwordLengthHint(password) {
  const length = codePoints(password);
  return length >= MIN_PASSWORD_LENGTH
    ? null
    : `${MIN_PASSWORD_LENGTH - length} more character${MIN_PASSWORD_LENGTH - length === 1 ? "" : "s"}`;
}
