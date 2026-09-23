const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EMAIL_REASONS,
  MAX_EMAIL_LENGTH,
  normalizeEmailAddress,
  parseEmailAddress,
} = require("./emailAddress");

/**
 * Invisible characters are built from code points rather than written as escape
 * sequences. An escape sequence in a source file is easy to turn into the
 * character itself while editing, and the file is then silently wrong — which
 * happened once while writing this module.
 */
const chr = (codePoint) => String.fromCodePoint(codePoint);
const ZERO_WIDTH_SPACE = chr(0x200b);
const RIGHT_TO_LEFT_OVERRIDE = chr(0x202e);
const BYTE_ORDER_MARK = chr(0xfeff);

const expectValid = (input, emailNormalized) => {
  const result = parseEmailAddress(input);
  assert.equal(result.valid, true, `expected ${JSON.stringify(input)} to be valid`);
  if (emailNormalized !== undefined) assert.equal(result.emailNormalized, emailNormalized);

  return result;
};

const expectInvalid = (input, reason) => {
  const result = parseEmailAddress(input);
  assert.equal(result.valid, false, `expected ${JSON.stringify(input)} to be rejected`);
  if (reason !== undefined) assert.equal(result.reason, reason);
};

test("accepts ordinary addresses", () => {
  expectValid("ada@example.com", "ada@example.com");
  expectValid("ada.lovelace@example.com");
  expectValid("ada+flowboard@example.com");
  expectValid("ada_lovelace@example.co.uk");
  expectValid("ada-lovelace@mail.example.museum");
  expectValid("a@b.co");
  // RFC 5322 allows these in a local part, and some real systems use them.
  expectValid("ada!#$%&'*+/=?^_`{|}~@example.com");
});

test("keeps the address as typed and normalises separately", () => {
  const result = expectValid("  Ada.Lovelace@Example.COM  ");

  // The stored `email` addresses mail and is shown back to the person; only
  // surrounding whitespace is removed.
  assert.equal(result.email, "Ada.Lovelace@Example.COM");
  assert.equal(result.emailNormalized, "ada.lovelace@example.com");
});

test("normalisation is lowercase and nothing else", () => {
  // Dots and +tags are one provider's conventions, not standards. Stripping
  // them would merge a.b@company.com with ab@company.com, which on most mail
  // servers are different people.
  expectValid("A.D.A+Tag@Example.COM", "a.d.a+tag@example.com");
  expectValid("ADA+MARKETING@EXAMPLE.COM", "ada+marketing@example.com");
});

test("visually identical addresses normalise to the same value", () => {
  // "é" as one code point, and as "e" plus a combining accent. Without NFC
  // these become two accounts that nobody can tell apart.
  const composed = `caf${chr(0xe9)}@example.com`;
  const decomposed = `cafe${chr(0x301)}@example.com`;

  assert.notEqual(composed, decomposed);
  assert.equal(normalizeEmailAddress(composed), normalizeEmailAddress(decomposed));
});

test("accepts internationalised addresses", () => {
  // Rejecting these would lock out users whose name does not fit in ASCII.
  expectValid("ada@exämple.de", "ada@exämple.de");
  expectValid("пользователь@example.ru", "пользователь@example.ru");
  expectValid("ΑΘΗΝΑ@example.com", "αθηνα@example.com");
  expectValid("用户@例子.中国");
});

test("rejects anything that is not a usable string", () => {
  for (const absent of [null, undefined, 42, {}, [], true]) {
    expectInvalid(absent, EMAIL_REASONS.REQUIRED);
  }

  expectInvalid("", EMAIL_REASONS.REQUIRED);
  expectInvalid("     ", EMAIL_REASONS.REQUIRED);
});

test("rejects a malformed structure", () => {
  expectInvalid("ada", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("@example.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@@example.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@ex@ample.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid(".ada@example.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada.@example.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada..lovelace@example.com", EMAIL_REASONS.INVALID_FORMAT);
});

test("rejects a domain that cannot receive internet mail", () => {
  // A bare hostname is a typo in this context, not an address.
  expectInvalid("ada@localhost", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@example", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@example..com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@.example.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@example.com.", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@-example.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@example-.com", EMAIL_REASONS.INVALID_FORMAT);
  // Shaped like an IP address.
  expectInvalid("ada@192.0.2.1", EMAIL_REASONS.INVALID_FORMAT);
});

test("rejects whitespace inside the address", () => {
  expectInvalid("ada lovelace@example.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@exa mple.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada\t@example.com", EMAIL_REASONS.INVALID_FORMAT);
});

test("whitespace around the address is trimmed, not rejected", () => {
  // Pasting an address commonly brings a space, tab or newline with it, and
  // that is the person's tool rather than their mistake.
  expectValid("  ada@example.com  ", "ada@example.com");
  expectValid("\tada@example.com\n", "ada@example.com");
});

test("rejects a newline, which would be SMTP header injection", () => {
  // Phase 4 puts a stored address into a mail header. A newline there lets the
  // rest of the header block be rewritten.
  expectInvalid("ada@example.com\nBcc: victim@example.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid("ada@example.com\r\nBcc: victim@example.com", EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid(`ada${chr(0x00)}@example.com`, EMAIL_REASONS.INVALID_FORMAT);
});

test("rejects invisible characters inside the address", () => {
  // Two addresses that look identical but are not would be two accounts, and a
  // bidi override makes rendered text read differently from what it contains.
  expectInvalid(`ada${ZERO_WIDTH_SPACE}@example.com`, EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid(`ada${RIGHT_TO_LEFT_OVERRIDE}@example.com`, EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid(`ada${BYTE_ORDER_MARK}@example.com`, EMAIL_REASONS.INVALID_FORMAT);
  expectInvalid(`ada@example${ZERO_WIDTH_SPACE}.com`, EMAIL_REASONS.INVALID_FORMAT);
});

test("a leading byte-order mark is trimmed rather than rejected", () => {
  // JavaScript counts U+FEFF as whitespace, so trim() removes it. A BOM at the
  // front of a pasted address is an encoding artifact, and dropping it is the
  // same courtesy as trimming a space — unlike one in the middle, above.
  expectValid(`${BYTE_ORDER_MARK}ada@example.com`, "ada@example.com");
});

test("refuses the exotic-but-legal forms by name", () => {
  // Both are valid per RFC and effectively unused, and each is a known source
  // of parser disagreement. Refused rather than half-supported.
  expectInvalid('"ada lovelace"@example.com', EMAIL_REASONS.UNSUPPORTED);
  expectInvalid("ada@[192.0.2.1]", EMAIL_REASONS.UNSUPPORTED);
  expectInvalid("ada@[IPv6:2001:db8::1]", EMAIL_REASONS.UNSUPPORTED);
});

test("enforces the length limits", () => {
  const local64 = "a".repeat(64);
  expectValid(`${local64}@example.com`);
  expectInvalid(`${"a".repeat(65)}@example.com`, EMAIL_REASONS.LOCAL_PART_TOO_LONG);

  // A DNS label stops at 63 characters.
  expectValid(`ada@${"a".repeat(63)}.com`);
  expectInvalid(`ada@${"a".repeat(64)}.com`, EMAIL_REASONS.INVALID_FORMAT);

  const tooLong = `${"a".repeat(64)}@${"b".repeat(100)}.${"c".repeat(100)}.com`;
  assert.ok(tooLong.length > MAX_EMAIL_LENGTH);
  expectInvalid(tooLong, EMAIL_REASONS.TOO_LONG);
});

test("length limits count bytes, not characters", () => {
  // Two bytes each in UTF-8, so half as many fit in a 64-octet local part.
  expectValid(`${"é".repeat(32)}@example.com`);
  expectInvalid(`${"é".repeat(33)}@example.com`, EMAIL_REASONS.LOCAL_PART_TOO_LONG);
});

test("normalizeEmailAddress returns null rather than throwing", () => {
  assert.equal(normalizeEmailAddress("ADA@EXAMPLE.COM"), "ada@example.com");
  assert.equal(normalizeEmailAddress("not an address"), null);
  assert.equal(normalizeEmailAddress(null), null);
});

test("normalisation is idempotent", () => {
  // The value is written on signup and recomputed on every login; the two must
  // never differ, or a user could stop matching their own row.
  for (const input of ["ADA@EXAMPLE.COM", "Ada+Tag@Exämple.DE", "ΑΘΗΝΑ@example.com"]) {
    const once = normalizeEmailAddress(input);
    assert.equal(normalizeEmailAddress(once), once, `not idempotent for ${input}`);
  }
});

test("a normalised address is already lowercase", () => {
  // The database enforces this with a CHECK constraint, so a mismatch here
  // would become a failed insert at signup rather than a validation error.
  for (const input of ["ADA@EXAMPLE.COM", "Ada+Tag@Exämple.DE", "ΑΘΗΝΑ@example.com"]) {
    const normalized = normalizeEmailAddress(input);
    assert.equal(normalized, normalized.toLowerCase());
  }
});
