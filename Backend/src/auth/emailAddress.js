/**
 * Email address validation and normalisation.
 *
 * Produces the two values `users` stores: `email` as the person typed it, for
 * display and for addressing mail, and `email_normalized`, which every lookup
 * matches on and which the partial unique index enforces.
 *
 * Validation here is structural only. Whether an address can actually receive
 * mail is settled by sending to it (Phase 4 verification), never by a regex, so
 * this rejects the clearly impossible and accepts the plausible rather than
 * trying to implement RFC 5322.
 *
 * Returns a result rather than throwing, so it is usable from an HTTP route, a
 * socket handler or a script without any of them depending on an error type.
 */

/** Longest address that can actually be delivered (RFC 5321 path limit). */
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 255;
const MAX_DOMAIN_LABEL_LENGTH = 63;

/**
 * RFC 5322 atext, plus any non-ASCII character.
 *
 * Non-ASCII is allowed deliberately: an internationalised address belongs to a
 * real person, and rejecting it would lock out users whose name does not fit in
 * ASCII. See the note on homographs at the bottom of this file.
 */
const LOCAL_ATOM_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\u{80}-\u{10FFFF}-]+$/u;

/** A DNS label: alphanumeric or non-ASCII, hyphens inside only. */
const DOMAIN_LABEL_PATTERN =
  /^[A-Za-z0-9\u{80}-\u{10FFFF}](?:[A-Za-z0-9\u{80}-\u{10FFFF}-]*[A-Za-z0-9\u{80}-\u{10FFFF}])?$/u;

/**
 * Control characters, which must never survive into a stored address.
 *
 * A carriage return or newline in an address is SMTP header injection waiting
 * for Phase 4 to send mail with it.
 */
const CONTROL_CODE_POINTS = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
];

/** Zero-width and bidirectional-formatting characters. Invisible, so never legitimate here. */
const INVISIBLE_CODE_POINTS = [
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
];

const REASONS = Object.freeze({
  REQUIRED: "EMAIL_REQUIRED",
  TOO_LONG: "EMAIL_TOO_LONG",
  LOCAL_PART_TOO_LONG: "EMAIL_LOCAL_PART_TOO_LONG",
  DOMAIN_TOO_LONG: "EMAIL_DOMAIN_TOO_LONG",
  INVALID_FORMAT: "EMAIL_INVALID_FORMAT",
  UNSUPPORTED: "EMAIL_UNSUPPORTED",
});

/**
 * @param {unknown} value
 * @returns {{ valid: true, email: string, emailNormalized: string }
 *          | { valid: false, reason: string }}
 */
function parseEmailAddress(value) {
  if (typeof value !== "string") return invalid(REASONS.REQUIRED);

  // NFC before anything else. Two visually identical addresses can be
  // different sequences of code points — "é" is either U+00E9 or "e" followed
  // by a combining accent — and without this they would become two accounts
  // that nobody could tell apart.
  const email = value.normalize("NFC").trim();

  if (email.length === 0) return invalid(REASONS.REQUIRED);
  if (email.length > MAX_EMAIL_LENGTH) return invalid(REASONS.TOO_LONG);

  // Checked before the whitespace rule below, because a quoted local part
  // normally contains a space: reporting it as malformed would be misleading
  // when the form is recognised and simply not supported.
  //
  // A quoted local part ("odd name"@example.com) and a bracketed IP-literal
  // domain (user@[192.0.2.1]) are both legal and both effectively unused, and
  // each is a well-known source of parser disagreement. Refused by name rather
  // than half-supported.
  if (email.startsWith('"') || email.includes("[") || email.includes("]")) {
    return invalid(REASONS.UNSUPPORTED);
  }

  if (containsCodePointIn(email, CONTROL_CODE_POINTS)) return invalid(REASONS.INVALID_FORMAT);
  if (containsCodePointIn(email, INVISIBLE_CODE_POINTS)) return invalid(REASONS.INVALID_FORMAT);
  if (/\s/u.test(email)) return invalid(REASONS.INVALID_FORMAT);

  const parts = email.split("@");
  if (parts.length !== 2) return invalid(REASONS.INVALID_FORMAT);

  const [localPart, domain] = parts;

  // Counted in bytes: the RFC limits are octets, and a non-ASCII character
  // costs more than one.
  if (localPart.length === 0) return invalid(REASONS.INVALID_FORMAT);
  if (Buffer.byteLength(localPart, "utf8") > MAX_LOCAL_PART_LENGTH) {
    return invalid(REASONS.LOCAL_PART_TOO_LONG);
  }
  if (!isValidLocalPart(localPart)) return invalid(REASONS.INVALID_FORMAT);

  if (domain.length === 0) return invalid(REASONS.INVALID_FORMAT);
  if (Buffer.byteLength(domain, "utf8") > MAX_DOMAIN_LENGTH) {
    return invalid(REASONS.DOMAIN_TOO_LONG);
  }
  if (!isValidDomain(domain)) return invalid(REASONS.INVALID_FORMAT);

  return { valid: true, email, emailNormalized: normalize(email) };
}

/**
 * The value stored in `email_normalized`, or null if the address is unusable.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeEmailAddress(value) {
  const result = parseEmailAddress(value);

  return result.valid ? result.emailNormalized : null;
}

/**
 * Lowercase, and nothing else.
 *
 * The domain is case-insensitive by definition. A local part is technically
 * case-sensitive per RFC 5321, but no provider in practice treats it that way,
 * and honouring it would let Bob@example.com and bob@example.com become two
 * accounts — which reads as one account that intermittently rejects the right
 * password.
 *
 * Deliberately NOT done: stripping dots, or removing "+tag" suffixes. Those are
 * one provider's conventions, not standards. Applying them would merge
 * a.b@company.com with ab@company.com, which on most mail servers are different
 * people.
 *
 * NFC again afterwards, because case conversion can denormalise: uppercase
 * U+0130 lowercases to an "i" plus a combining dot.
 */
function normalize(email) {
  return email.toLowerCase().normalize("NFC");
}

function isValidLocalPart(localPart) {
  // Splitting on "." rejects a leading dot, a trailing dot and two in a row,
  // because each produces an empty atom.
  return localPart.split(".").every((atom) => atom.length > 0 && LOCAL_ATOM_PATTERN.test(atom));
}

function isValidDomain(domain) {
  const labels = domain.split(".");

  // A bare hostname cannot receive mail from the internet, so an address
  // without a dot is a typo rather than an address.
  if (labels.length < 2) return false;

  const wellFormed = labels.every(
    (label) =>
      label.length > 0 &&
      Buffer.byteLength(label, "utf8") <= MAX_DOMAIN_LABEL_LENGTH &&
      DOMAIN_LABEL_PATTERN.test(label),
  );
  if (!wellFormed) return false;

  // An all-numeric final label means something shaped like an IP address.
  return !/^\d+$/.test(labels.at(-1));
}

/**
 * Does this text contain any code point in the given ranges?
 *
 * The same shape as Backend/src/ai/sanitize.js, and for the same reason:
 * ranges of invisible code points are safer written as numbers than as
 * escape sequences inside a regex literal.
 */
function containsCodePointIn(text, ranges) {
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (ranges.some(([from, to]) => codePoint >= from && codePoint <= to)) return true;
  }

  return false;
}

function invalid(reason) {
  return { valid: false, reason };
}

/**
 * Known limitation: homographs.
 *
 * "аdmin@example.com" with a Cyrillic "а" normalises differently from the Latin
 * spelling, so the two are separate accounts. That is not an authentication
 * bypass — each account still has to verify its own address — but the two look
 * identical to a person reading a members list.
 *
 * It cannot be fixed here, because the address is genuinely valid. Mitigation
 * belongs at display time (marking mixed-script names) and is out of scope for
 * Step 1. Recorded so it is a known trade-off rather than an oversight.
 */

module.exports = {
  MAX_DOMAIN_LABEL_LENGTH,
  MAX_DOMAIN_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LOCAL_PART_LENGTH,
  EMAIL_REASONS: REASONS,
  normalizeEmailAddress,
  parseEmailAddress,
};
