const { AuthError, authErrorForEmailReason } = require("./authErrors");
const { parseEmailAddress } = require("./emailAddress");

/**
 * Check and normalise a login request.
 *
 * Deliberately looser than `parseSignupRequest`: this applies **no password
 * policy**. An account created before a policy changed still has to be able to
 * sign in, and rejecting a short password here would also answer differently
 * from a wrong one, which is its own small oracle.
 *
 * The address is still validated, because a malformed one cannot belong to any
 * account and saying so reveals nothing — the caller already knows what they
 * typed.
 *
 * @param {{ email?: unknown, password?: unknown }} [body]
 * @returns {{ email: string, emailNormalized: string, password: string }}
 * @throws {AuthError}
 */
function parseLoginRequest({ email, password } = {}) {
  const parsedEmail = parseEmailAddress(email);
  if (!parsedEmail.valid) throw authErrorForEmailReason(parsedEmail.reason);

  if (typeof password !== "string" || password.length === 0) {
    throw new AuthError("PASSWORD_REQUIRED");
  }

  // No length check. A password longer than the hasher accepts simply fails to
  // verify, which is the same answer as a wrong one — exactly as it should be.
  return {
    email: parsedEmail.email,
    emailNormalized: parsedEmail.emailNormalized,
    password,
  };
}

module.exports = {
  parseLoginRequest,
};
