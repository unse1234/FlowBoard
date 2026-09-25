const { renderEmail } = require("./layout");

/**
 * "Confirm your email address", sent after signup and on request (Phase A).
 *
 * The link carries the only copy of the token outside the database, where it
 * is stored hashed. It opens the web app, which sends the token to the API:
 * visiting the link does nothing by itself, so a mail scanner that fetches
 * every link cannot verify an address on the owner's behalf.
 *
 * @param {{ displayName: string, url: string, expiresInHours: number }} details
 */
function verificationEmail({ displayName, url, expiresInHours }) {
  return {
    subject: "Confirm your email address for FlowBoard",
    ...renderEmail({
      heading: "Confirm your email address",
      paragraphs: [
        `Hi ${displayName},`,
        "Confirm this address to start collaborating on FlowBoard: inviting people to your boards and joining theirs.",
      ],
      action: { label: "Confirm email address", url },
      footer: [
        `This link works once and expires in ${expiresInHours} hours.`,
        "If you didn't create a FlowBoard account, you can ignore this email.",
      ],
    }),
  };
}

module.exports = {
  verificationEmail,
};
