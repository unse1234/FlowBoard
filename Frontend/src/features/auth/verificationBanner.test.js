import assert from "node:assert/strict";
import test from "node:test";
import { dismissVerificationBanner, shouldShowVerificationBanner } from "./verificationBanner.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

const ADA = Object.freeze({ id: "u-ada", emailVerified: false });
const GRACE = Object.freeze({ id: "u-grace", emailVerified: false });

test("shows for an unverified account until dismissed, per account", () => {
  const storage = memoryStorage();

  assert.equal(shouldShowVerificationBanner(ADA, storage), true);
  dismissVerificationBanner(ADA, storage);
  assert.equal(shouldShowVerificationBanner(ADA, storage), false);
  assert.equal(shouldShowVerificationBanner(GRACE, storage), true);
});

test("never shows for a verified account or when signed out", () => {
  const storage = memoryStorage();
  assert.equal(shouldShowVerificationBanner({ ...ADA, emailVerified: true }, storage), false);
  assert.equal(shouldShowVerificationBanner(null, storage), false);
});

test("storage that fails leaves the banner showing", () => {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  assert.doesNotThrow(() => dismissVerificationBanner(ADA, broken));
  assert.equal(shouldShowVerificationBanner(ADA, broken), true);
  assert.equal(shouldShowVerificationBanner(ADA, undefined), true);
});
