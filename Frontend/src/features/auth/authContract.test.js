import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  AUTH_MODES,
  FORM_MESSAGES,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateAuthForm,
} from "./authForm.js";

const require = createRequire(import.meta.url);
const backendErrors = require("../../../../Backend/src/auth/authErrors.js");
const backendEmail = require("../../../../Backend/src/auth/emailAddress.js");

/**
 * The sign-up rules live on both sides: the server enforces them, and the form
 * checks them first so a person hears about a short password while typing.
 * Drift would fail quietly. The form could pass a password the server then
 * rejects, or tell someone "at least 12" while the server wants 14. So this
 * fails loudly instead, as operationContract.test.js does for board
 * operations. It runs in the frontend suite only.
 */

test("frontend and backend agree on every limit", () => {
  assert.equal(MIN_PASSWORD_LENGTH, backendErrors.MIN_PASSWORD_LENGTH);
  assert.equal(MAX_PASSWORD_LENGTH, backendErrors.MAX_PASSWORD_LENGTH);
  assert.equal(MAX_DISPLAY_NAME_LENGTH, backendErrors.MAX_DISPLAY_NAME_LENGTH);
  assert.equal(MAX_EMAIL_LENGTH, backendEmail.MAX_EMAIL_LENGTH);
});

test("both sides draw the line on address length in the same place", () => {
  // Otherwise valid: a 64-byte local part and a domain of short labels, so
  // length is the only thing that can differ. 64 + 1 + 189 = 254 units.
  const domain = `${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`;
  const atLimit = `${"a".repeat(64)}@${domain}`;
  const overLimit = `${"a".repeat(64)}@${domain.replace("d.com", "dd.com")}`;

  assert.equal(atLimit.length, MAX_EMAIL_LENGTH);
  assert.equal(overLimit.length, MAX_EMAIL_LENGTH + 1);

  assert.equal(backendEmail.parseEmailAddress(atLimit).valid, true);
  assert.equal(validateAuthForm({ email: atLimit, password: "x" }, AUTH_MODES.SIGN_IN).email, undefined);

  assert.equal(backendEmail.parseEmailAddress(overLimit).reason, backendEmail.EMAIL_REASONS.TOO_LONG);
  assert.equal(
    validateAuthForm({ email: overLimit, password: "x" }, AUTH_MODES.SIGN_IN).email,
    "EMAIL_TOO_LONG",
  );
});

test("a message reads the same whichever side caught the problem", () => {
  for (const [code, message] of Object.entries(FORM_MESSAGES)) {
    const backend = backendErrors.AUTH_ERRORS[code];
    assert.ok(backend, `${code} is not a server error code`);
    assert.equal(message, backend.message, code);
  }
});
