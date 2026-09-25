const { createHash, randomUUID } = require("node:crypto");
const { passwordResetEmail } = require("./templates/passwordReset");
const {
  accountDeletedEmail,
  accountExistsEmail,
  identityLinkedEmail,
  identityUnlinkedEmail,
  passwordChangedEmail,
  passwordSetEmail,
} = require("./templates/securityNotification");
const { verificationEmail } = require("./templates/verification");

/**
 * FlowBoard's transactional email, and the only way auth code sends any
 * (AUTH_DECISIONS.md E-19).
 *
 * Routes call a named method, never a provider: which service delivers the
 * mail is decided once, in server.js, by the transport passed in. Resend in
 * production (`resendTransport.js`), a mailbox in memory in tests.
 *
 * **Idempotency.** Every email carries an idempotency key, so a retry cannot
 * deliver it twice. A token email is keyed on its token, so each new link is a
 * new email. A notice about an event is keyed on the event where the caller
 * has one (a password change keys on the new `token_version`), so repeating the
 * same event sends nothing new.
 *
 * **Background delivery.** `inBackground` sends without holding up the
 * response, and that is not only for speed. Forgot-password emails an account
 * that exists and sends nothing for one that does not. Awaiting the send would
 * make the first answer slower, and the timing would reveal who has an account.
 * Failures are logged, and `drain()` lets shutdown and tests wait for what is
 * in flight.
 *
 * **Not configured** (no RESEND_API_KEY): every send is skipped with a warning
 * naming the kind of email, never its content. Accounts still work; nobody can
 * verify an address or reset a password until email is configured.
 *
 * Never logged: a recipient, a subject, a body or a token (rule 33).
 */

/**
 * @param {Object} options
 * @param {{ name: string, send(message: Object): Promise<{ id: string }> } | null} options.transport
 * @param {string | null} options.from  MAIL_FROM
 * @param {string | null} options.appUrl  APP_URL, the web app's origin
 * @param {Pick<Console, "info" | "warn" | "error">} [options.logger]
 */
function createEmailService({ transport, from, appUrl, logger = console }) {
  const enabled = Boolean(transport && from && appUrl);
  const pending = new Set();

  async function deliver(kind, userId, idempotencyKey, to, email) {
    if (!enabled) {
      logger.warn?.("[email] Not sent: email is not configured.", { kind, userId });
      return { sent: false };
    }

    const { id } = await transport.send({
      from,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey,
      tags: [{ name: "kind", value: kind }],
    });

    logger.info?.("[email] Sent.", { kind, userId, messageId: id });
    return { sent: true, messageId: id };
  }

  const link = (path, token) => `${appUrl}${path}?token=${encodeURIComponent(token)}`;

  return {
    enabled,

    /**
     * @param {{ user: { id: string, email: string, displayName: string }, token: string, expiresInHours: number }} details
     */
    sendVerificationEmail({ user, token, expiresInHours }) {
      return deliver(
        "verify-email",
        user.id,
        `verify-email:${tokenDigest(token)}`,
        user.email,
        verificationEmail({ displayName: user.displayName, url: link("/verify-email", token), expiresInHours }),
      );
    },

    /**
     * @param {{ user: { id: string, email: string, displayName: string }, token: string, expiresInMinutes: number }} details
     */
    sendPasswordResetEmail({ user, token, expiresInMinutes }) {
      return deliver(
        "reset-password",
        user.id,
        `reset-password:${tokenDigest(token)}`,
        user.email,
        passwordResetEmail({ displayName: user.displayName, url: link("/reset-password", token), expiresInMinutes }),
      );
    },

    /** E-12: a signup for an address that already has an account. */
    sendAccountExistsNotice({ user }) {
      return deliver(
        "account-exists",
        user.id,
        `account-exists:${randomUUID()}`,
        user.email,
        accountExistsEmail({ displayName: user.displayName, signInUrl: `${appUrl}/?auth=sign-in` }),
      );
    },

    /**
     * @param {{ user: Object, reset: boolean, tokenVersion: number }} details
     *   `tokenVersion` after the change: unique to it, so it is the event's key
     */
    sendPasswordChangedNotification({ user, reset, tokenVersion }) {
      return deliver(
        "password-changed",
        user.id,
        `password-changed:${user.id}:${tokenVersion}`,
        user.email,
        passwordChangedEmail({ displayName: user.displayName, reset }),
      );
    },

    /** @param {{ user: Object, tokenVersion: number }} details */
    sendPasswordSetNotification({ user, tokenVersion }) {
      return deliver(
        "password-set",
        user.id,
        `password-set:${user.id}:${tokenVersion}`,
        user.email,
        passwordSetEmail({ displayName: user.displayName }),
      );
    },

    /** An account is deleted once, so its id is the key. */
    sendAccountDeletedNotification({ user }) {
      return deliver(
        "account-deleted",
        user.id,
        `account-deleted:${user.id}`,
        user.email,
        accountDeletedEmail({ displayName: user.displayName }),
      );
    },

    /** @param {{ user: Object, provider: string, identityId: string }} details */
    sendIdentityLinkedNotification({ user, provider, identityId }) {
      return deliver(
        "identity-linked",
        user.id,
        `identity-linked:${identityId}`,
        user.email,
        identityLinkedEmail({ displayName: user.displayName, provider }),
      );
    },

    /** @param {{ user: Object, provider: string, identityId: string }} details */
    sendIdentityUnlinkedNotification({ user, provider, identityId }) {
      return deliver(
        "identity-unlinked",
        user.id,
        `identity-unlinked:${identityId}`,
        user.email,
        identityUnlinkedEmail({ displayName: user.displayName, provider }),
      );
    },

    /**
     * Send without holding up the caller. A failure is logged with the kind
     * of email and the error, and never thrown into the request that caused it.
     *
     * @param {string} kind  for the log line if it fails
     * @param {() => Promise<unknown>} send  one of the methods above
     */
    inBackground(kind, send) {
      const task = Promise.resolve()
        .then(send)
        .catch((error) => {
          logger.error?.("[email] Delivery failed.", {
            kind,
            message: error?.message,
            status: error?.status ?? null,
            type: error?.type ?? null,
          });
        })
        .finally(() => pending.delete(task));
      pending.add(task);
    },

    /** Resolves once everything sent in the background has settled. */
    async drain() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
  };
}

/**
 * A short digest of a token, for its email's idempotency key: stable across
 * retries of one email, different for every token, and not the token itself.
 */
function tokenDigest(token) {
  return createHash("sha256").update(token).digest("base64url").slice(0, 32);
}

module.exports = {
  createEmailService,
};
