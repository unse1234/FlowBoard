const { ACCOUNT_TOKEN, createAccountTokenRepository } = require("./accountTokenRepository");
const { generateOpaqueToken } = require("./opaqueTokens");

/**
 * The emails that carry a token, each issued and sent as one step, and the
 * per-address cap on everything sent to one address (Phase A).
 *
 * Issuing a token replaces the account's previous one of that kind
 * (`account_tokens` holds one per purpose), so only the newest link works.
 *
 * The cap is keyed on the address as submitted, registered or not, so hitting
 * it says nothing about whether an account exists. It stops someone using
 * FlowBoard to flood an inbox, through signup, resend or forgot-password.
 *
 * @param {Object} options
 * @param {{ query: Function }} options.database
 * @param {ReturnType<typeof import("../email/emailService").createEmailService>} options.emailService
 * @param {{ name: string, consume(key: string): Promise<{ allowed: boolean, retryAfterSeconds: number }> } | null} options.addressLimiter
 * @param {Pick<Console, "info" | "warn">} options.logger
 */
function createAccountEmails({ database, emailService, addressLimiter, logger }) {
  const tokens = createAccountTokenRepository({ database });

  function skipped(kind, userId) {
    logger.warn?.("[email] Not sent: email is not configured.", { kind, userId });
    return { sent: false };
  }

  return {
    enabled: emailService.enabled,

    /**
     * Count one email to this address. Past the cap, the caller sends
     * nothing: silently where the request must not reveal an account,
     * with a 429 where the account owner asked.
     *
     * @param {string} emailNormalized
     * @returns {Promise<{ allowed: boolean, retryAfterSeconds: number }>}
     */
    async countAddress(emailNormalized) {
      if (!addressLimiter) return { allowed: true, retryAfterSeconds: 0 };
      return addressLimiter.consume(emailNormalized);
    },

    /** @param {{ id: string, email: string, emailNormalized: string, displayName: string }} user */
    async sendVerification(user) {
      if (!emailService.enabled) return skipped("verify-email", user.id);

      const token = generateOpaqueToken();
      await tokens.issue({
        userId: user.id,
        kind: ACCOUNT_TOKEN.VERIFY_EMAIL,
        tokenHash: token.hash,
        emailNormalized: user.emailNormalized,
      });
      return emailService.sendVerificationEmail({
        user,
        token: token.token,
        expiresInHours: ACCOUNT_TOKEN.VERIFY_EMAIL.ttlSeconds / 3600,
      });
    },

    /** @param {{ id: string, email: string, emailNormalized: string, displayName: string }} user */
    async sendPasswordReset(user) {
      if (!emailService.enabled) return skipped("reset-password", user.id);

      const token = generateOpaqueToken();
      await tokens.issue({
        userId: user.id,
        kind: ACCOUNT_TOKEN.RESET_PASSWORD,
        tokenHash: token.hash,
        emailNormalized: user.emailNormalized,
      });
      return emailService.sendPasswordResetEmail({
        user,
        token: token.token,
        expiresInMinutes: ACCOUNT_TOKEN.RESET_PASSWORD.ttlSeconds / 60,
      });
    },

    /** E-12: someone signed up with this account's address. */
    async sendAccountExists(user) {
      if (!emailService.enabled) return skipped("account-exists", user.id);
      return emailService.sendAccountExistsNotice({ user });
    },
  };
}

module.exports = {
  createAccountEmails,
};
