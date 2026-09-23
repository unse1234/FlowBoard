const assert = require("node:assert/strict");
const test = require("node:test");
const { AuthError, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } = require("./authErrors");
const { parseSignupRequest } = require("./signupRequest");

const VALID = Object.freeze({
  email: "Ada.Lovelace@Example.COM",
  password: "a-perfectly-fine-passphrase",
  displayName: "Ada Lovelace",
});

const expectCode = (body, code) => {
  try {
    parseSignupRequest(body);
    assert.fail(`expected ${code} for ${JSON.stringify(body)}`);
  } catch (error) {
    assert.ok(error instanceof AuthError, "expected an AuthError");
    assert.equal(error.code, code);
  }
};

test("accepts a valid signup and returns both email forms", () => {
  const parsed = parseSignupRequest(VALID);

  assert.equal(parsed.email, "Ada.Lovelace@Example.COM");
  assert.equal(parsed.emailNormalized, "ada.lovelace@example.com");
  assert.equal(parsed.displayName, "Ada Lovelace");
  assert.equal(parsed.password, VALID.password);
});

test("rejects a missing body without throwing a TypeError", () => {
  // The route passes request.body, which is undefined if nothing was sent.
  expectCode(undefined, "EMAIL_REQUIRED");
  expectCode({}, "EMAIL_REQUIRED");
});

test("the email is validated by the same rules as everywhere else", () => {
  expectCode({ ...VALID, email: "not-an-address" }, "EMAIL_INVALID");
  expectCode({ ...VALID, email: "ada@localhost" }, "EMAIL_INVALID");
  expectCode({ ...VALID, email: "" }, "EMAIL_REQUIRED");
  expectCode({ ...VALID, email: `${"a".repeat(65)}@example.com` }, "EMAIL_TOO_LONG");
  // A newline would be SMTP header injection once Phase 4 sends mail.
  expectCode({ ...VALID, email: "ada@example.com\nBcc: x@y.com" }, "EMAIL_INVALID");
});

test("enforces the password length policy", () => {
  expectCode({ ...VALID, password: undefined }, "PASSWORD_REQUIRED");
  expectCode({ ...VALID, password: "" }, "PASSWORD_REQUIRED");
  expectCode({ ...VALID, password: 12345678901234 }, "PASSWORD_REQUIRED");

  expectCode({ ...VALID, password: "a".repeat(MIN_PASSWORD_LENGTH - 1) }, "PASSWORD_TOO_SHORT");
  assert.doesNotThrow(() =>
    parseSignupRequest({ ...VALID, password: "a".repeat(MIN_PASSWORD_LENGTH) }),
  );

  assert.doesNotThrow(() =>
    parseSignupRequest({ ...VALID, password: "a".repeat(MAX_PASSWORD_LENGTH) }),
  );
  expectCode({ ...VALID, password: "a".repeat(MAX_PASSWORD_LENGTH + 1) }, "PASSWORD_TOO_LONG");
});

test("password length counts code points, so an emoji costs one", () => {
  // "🔑".length is 2 in UTF-16; counting that way would reject a passphrase
  // that is long enough by any reasonable reading.
  const emojiPassword = "🔑".repeat(MIN_PASSWORD_LENGTH);

  assert.equal(emojiPassword.length, MIN_PASSWORD_LENGTH * 2);
  assert.doesNotThrow(() => parseSignupRequest({ ...VALID, password: emojiPassword }));
});

test("the password is taken exactly as given", () => {
  // Trimming would mean the password the person typed is not the one stored,
  // and they could never sign in again with it.
  const padded = "  spaces matter here  ";

  assert.equal(parseSignupRequest({ ...VALID, password: padded }).password, padded);
});

test("a password is never echoed in an error", () => {
  // Comfortably under the minimum, so this is certain to be rejected.
  const tooShort = "hunter2";
  assert.ok(tooShort.length < MIN_PASSWORD_LENGTH);

  try {
    parseSignupRequest({ ...VALID, password: tooShort });
    assert.fail("expected a rejection");
  } catch (error) {
    // The detail records only the length, because it goes to the log.
    assert.equal(error.code, "PASSWORD_TOO_SHORT");
    assert.equal(JSON.stringify(error.toResponseBody()).includes(tooShort), false);
    assert.equal(String(error.detail ?? "").includes(tooShort), false);
  }
});

test("requires a display name and trims it", () => {
  expectCode({ ...VALID, displayName: undefined }, "DISPLAY_NAME_REQUIRED");
  expectCode({ ...VALID, displayName: "" }, "DISPLAY_NAME_REQUIRED");
  expectCode({ ...VALID, displayName: "    " }, "DISPLAY_NAME_REQUIRED");
  expectCode({ ...VALID, displayName: 42 }, "DISPLAY_NAME_REQUIRED");

  // The schema's CHECK rejects a blank name, so trimming has to happen before
  // the insert rather than becoming a constraint violation.
  assert.equal(parseSignupRequest({ ...VALID, displayName: "  Ada  " }).displayName, "Ada");
});

test("rejects a display name that could misrepresent itself", () => {
  const chr = (codePoint) => String.fromCodePoint(codePoint);

  // A name appears in the people list and beside a live cursor. A bidi override
  // makes rendered text read differently from what it contains.
  expectCode({ ...VALID, displayName: `Ada${chr(0x202e)}` }, "DISPLAY_NAME_REQUIRED");
  expectCode({ ...VALID, displayName: `Ada${chr(0x200b)}Lovelace` }, "DISPLAY_NAME_REQUIRED");
  expectCode({ ...VALID, displayName: "Ada\nLovelace" }, "DISPLAY_NAME_REQUIRED");
});

test("rejects a display name that is too long", () => {
  expectCode({ ...VALID, displayName: "a".repeat(81) }, "DISPLAY_NAME_TOO_LONG");
  assert.doesNotThrow(() => parseSignupRequest({ ...VALID, displayName: "a".repeat(80) }));
});

test("a display name is normalised so one name is one stored value", () => {
  const composed = `Ren${String.fromCodePoint(0xe9)}`;
  const decomposed = `Ren${"e"}${String.fromCodePoint(0x301)}`;

  assert.notEqual(composed, decomposed);
  assert.equal(
    parseSignupRequest({ ...VALID, displayName: composed }).displayName,
    parseSignupRequest({ ...VALID, displayName: decomposed }).displayName,
  );
});

test("the email is checked before the password", () => {
  // Both are wrong. Reporting the first field in form order is what a person
  // expects, and it keeps the response independent of the password.
  expectCode({ email: "nope", password: "x", displayName: "" }, "EMAIL_INVALID");
});
