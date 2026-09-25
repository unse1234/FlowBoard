const { renderEmail } = require("./layout");

/**
 * "Reset your password", sent when someone asks for it and the address has an
 * account. Nothing is sent otherwise, and the request is answered the same
 * either way, so this email is the only place the truth appears.
 *
 * @param {{ displayName: string, url: string, expiresInMinutes: number }} details
 */
function passwordResetEmail({ displayName, url, expiresInMinutes }) {
  return {
    subject: "Reset your FlowBoard password",
    ...renderEmail({
      heading: "Reset your password",
      paragraphs: [
        `Hi ${displayName},`,
        "Someone asked to reset the password for your FlowBoard account. If it was you, choose a new one here. " +
          "Every device signed in to your account will be signed out.",
      ],
      action: { label: "Choose a new password", url },
      footer: [
        `This link works once and expires in ${expiresInMinutes} minutes.`,
        "If you didn't ask for this, you can ignore this email. Your password hasn't changed.",
      ],
    }),
  };
}

module.exports = {
  passwordResetEmail,
};
