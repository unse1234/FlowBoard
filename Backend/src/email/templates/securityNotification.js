const { renderEmail } = require("./layout");

/**
 * Notices about something that already happened to an account.
 *
 * None carries a token or a link that does anything by itself. A notice that
 * could act would turn a forwarded or intercepted email into access.
 */

const NOT_YOU = "If this wasn't you, reset your password straight away from the FlowBoard sign-in screen.";

/**
 * Someone tried to sign up with an address that already has an account. The
 * signup was answered as if it succeeded, so no one else learns the account
 * exists (AUTH_DECISIONS.md E-12); this tells the one person entitled to know.
 *
 * @param {{ displayName: string, signInUrl: string }} details
 */
function accountExistsEmail({ displayName, signInUrl }) {
  return {
    subject: "You already have a FlowBoard account",
    ...renderEmail({
      heading: "You already have an account",
      paragraphs: [
        `Hi ${displayName},`,
        "Someone just tried to create a FlowBoard account with this email address, but you already have one. " +
          "Sign in instead. If you've forgotten your password, choose \"Forgot password?\" on the sign-in screen.",
      ],
      action: { label: "Open FlowBoard", url: signInUrl },
      footer: ["If this wasn't you, you don't need to do anything. Your account hasn't changed."],
    }),
  };
}

/**
 * @param {{ displayName: string, reset: boolean }} details
 *   `reset` when it was changed through a reset link rather than in settings
 */
function passwordChangedEmail({ displayName, reset }) {
  return {
    subject: "Your FlowBoard password was changed",
    ...renderEmail({
      heading: "Your password was changed",
      paragraphs: [
        `Hi ${displayName},`,
        reset
          ? "The password for your FlowBoard account was reset, and every device that was signed in has been signed out."
          : "The password for your FlowBoard account was changed, and every other device that was signed in has been signed out.",
      ],
      footer: [NOT_YOU],
    }),
  };
}

/** @param {{ displayName: string }} details */
function passwordSetEmail({ displayName }) {
  return {
    subject: "A password was added to your FlowBoard account",
    ...renderEmail({
      heading: "You can now sign in with a password",
      paragraphs: [
        `Hi ${displayName},`,
        "A password was added to your FlowBoard account. You can sign in with it as well as with your connected accounts.",
      ],
      footer: [NOT_YOU],
    }),
  };
}

/** @param {{ displayName: string }} details */
function accountDeletedEmail({ displayName }) {
  return {
    subject: "Your FlowBoard account was deleted",
    ...renderEmail({
      heading: "Your account was deleted",
      paragraphs: [
        `Hi ${displayName},`,
        "Your FlowBoard account and your private boards have been permanently deleted, and every device was signed out. " +
          "Boards you handed over to someone else stay with them.",
        "This can't be undone. You're welcome to create a new account at any time.",
      ],
      footer: ["If you didn't delete your account, contact FlowBoard support."],
    }),
  };
}

/** @param {{ displayName: string, provider: string }} details */
function identityLinkedEmail({ displayName, provider }) {
  return {
    subject: `${provider} was connected to your FlowBoard account`,
    ...renderEmail({
      heading: `${provider} is now connected`,
      paragraphs: [
        `Hi ${displayName},`,
        `You can now sign in to FlowBoard with ${provider}. You can disconnect it at any time from Account settings.`,
      ],
      footer: [NOT_YOU],
    }),
  };
}

/** @param {{ displayName: string, provider: string }} details */
function identityUnlinkedEmail({ displayName, provider }) {
  return {
    subject: `${provider} was disconnected from your FlowBoard account`,
    ...renderEmail({
      heading: `${provider} was disconnected`,
      paragraphs: [`Hi ${displayName},`, `You can no longer sign in to FlowBoard with ${provider}.`],
      footer: [NOT_YOU],
    }),
  };
}

module.exports = {
  accountDeletedEmail,
  accountExistsEmail,
  identityLinkedEmail,
  identityUnlinkedEmail,
  passwordChangedEmail,
  passwordSetEmail,
};
