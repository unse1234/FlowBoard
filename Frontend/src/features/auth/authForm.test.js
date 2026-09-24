import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_MODES,
  fieldForErrorCode,
  messageForCode,
  passwordLengthHint,
  validateAuthForm,
} from "./authForm.js";

const { SIGN_IN, SIGN_UP } = AUTH_MODES;
const VALID = Object.freeze({
  email: "ada@example.com",
  password: "a-perfectly-fine-passphrase",
  displayName: "Ada Lovelace",
});

test("a complete form has no errors in either mode", () => {
  assert.deepEqual(validateAuthForm(VALID, SIGN_UP), {});
  assert.deepEqual(validateAuthForm(VALID, SIGN_IN), {});
});

test("email is required, bounded and roughly shaped", () => {
  const code = (email) => validateAuthForm({ ...VALID, email }, SIGN_IN).email;

  assert.equal(code(""), "EMAIL_REQUIRED");
  assert.equal(code("   "), "EMAIL_REQUIRED");
  assert.equal(code("ada"), "EMAIL_INVALID");
  assert.equal(code("ada@localhost"), "EMAIL_INVALID");
  assert.equal(code("ada @example.com"), "EMAIL_INVALID");
  assert.equal(code(`${"a".repeat(250)}@b.co`), "EMAIL_TOO_LONG");
  // Surrounding space is the server's to trim, not a reason to refuse.
  assert.equal(code("  ada@example.com  "), undefined);
  // Anything subtler is the server's call.
  assert.equal(code("ПОЧТА@пример.рф"), undefined);
});

test("the email limit is measured exactly as the server measures it", () => {
  const code = (email) => validateAuthForm({ ...VALID, email }, SIGN_IN).email;
  const domain = "@example.com";

  // 254 UTF-16 units after trimming is the limit, whatever the bytes.
  assert.equal(code(`${"e".repeat(254 - domain.length)}${domain}`), undefined);
  assert.equal(code(`${"e".repeat(255 - domain.length)}${domain}`), "EMAIL_TOO_LONG");
  // Never stricter than the server: multi-byte letters count once here, and
  // the server's own byte limits on each part decide the rest.
  assert.equal(code(`${"é".repeat(200)}${domain}`), undefined);
  // NFC first: a decomposed é is two units until it is composed.
  assert.equal(code(`${"é".repeat(200)}${domain}`), undefined);
});

test("sign-up enforces the password length, counted in code points", () => {
  const code = (password) => validateAuthForm({ ...VALID, password }, SIGN_UP).password;

  assert.equal(code(""), "PASSWORD_REQUIRED");
  assert.equal(code("a".repeat(11)), "PASSWORD_TOO_SHORT");
  assert.equal(code("a".repeat(12)), undefined);
  assert.equal(code("a".repeat(128)), undefined);
  assert.equal(code("a".repeat(129)), "PASSWORD_TOO_LONG");
  // Twelve emoji are twelve characters, though twenty-four UTF-16 units.
  assert.equal(code("🔑".repeat(12)), undefined);
  assert.equal(code("🔑".repeat(11)), "PASSWORD_TOO_SHORT");
});

test("sign-in applies no password policy, only presence", () => {
  const code = (password) => validateAuthForm({ ...VALID, password }, SIGN_IN).password;

  assert.equal(code(""), "PASSWORD_REQUIRED");
  // An old, short password must still reach the server.
  assert.equal(code("short"), undefined);
  assert.equal(code("a".repeat(500)), undefined);
});

test("sign-up needs a display name, trimmed and bounded; sign-in ignores it", () => {
  const code = (displayName) => validateAuthForm({ ...VALID, displayName }, SIGN_UP).displayName;

  assert.equal(code(""), "DISPLAY_NAME_REQUIRED");
  assert.equal(code("   "), "DISPLAY_NAME_REQUIRED");
  assert.equal(code("a".repeat(80)), undefined);
  assert.equal(code("a".repeat(81)), "DISPLAY_NAME_TOO_LONG");
  assert.equal(code(`  ${"a".repeat(80)}  `), undefined);

  assert.equal(validateAuthForm({ ...VALID, displayName: "" }, SIGN_IN).displayName, undefined);
});

test("server errors land on the field they are about", () => {
  assert.equal(fieldForErrorCode("EMAIL_INVALID"), "email");
  assert.equal(fieldForErrorCode("PASSWORD_TOO_SHORT"), "password");
  assert.equal(fieldForErrorCode("DISPLAY_NAME_TOO_LONG"), "displayName");
  // About the whole attempt, not one field. Pointing at the password would
  // hint that the address was right.
  assert.equal(fieldForErrorCode("INVALID_CREDENTIALS"), null);
  assert.equal(fieldForErrorCode("TOO_MANY_ATTEMPTS"), null);
  assert.equal(fieldForErrorCode("NETWORK"), null);
});

test("every code the form can produce has a message", () => {
  const produced = new Set();
  const samples = [
    { email: "", password: "", displayName: "" },
    { email: "x", password: "short", displayName: "a".repeat(81) },
    { email: `${"a".repeat(260)}@b.co`, password: "a".repeat(200), displayName: "ok" },
  ];
  for (const values of samples) {
    for (const mode of [SIGN_IN, SIGN_UP]) {
      for (const errorCode of Object.values(validateAuthForm(values, mode))) produced.add(errorCode);
    }
  }

  assert.ok(produced.size >= 7);
  for (const errorCode of produced) assert.ok(messageForCode(errorCode), errorCode);
});

test("the password hint counts down to the minimum, then goes quiet", () => {
  assert.equal(passwordLengthHint(""), "12 more characters");
  assert.equal(passwordLengthHint("a".repeat(11)), "1 more character");
  assert.equal(passwordLengthHint("a".repeat(12)), null);
});
