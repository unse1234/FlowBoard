import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_LINK, addressWithoutAuthLink, readAuthLink } from "./authLinks.js";

/** 43 characters of base64url, the shape the server issues. */
const TOKEN = `${"q".repeat(20)}-_${"Z9".repeat(10)}x`;
const at = (href) => {
  const url = new URL(href, "https://app.flowboard.test");
  return { pathname: url.pathname, search: url.search, hash: url.hash };
};

test("each emailed link is recognised with its token", () => {
  assert.deepEqual(readAuthLink(at(`/verify-email?token=${TOKEN}`)), { kind: AUTH_LINK.VERIFY_EMAIL, token: TOKEN });
  assert.deepEqual(readAuthLink(at(`/reset-password?token=${TOKEN}`)), {
    kind: AUTH_LINK.RESET_PASSWORD,
    token: TOKEN,
  });
  assert.deepEqual(readAuthLink(at(`/invite/${TOKEN}`)), { kind: AUTH_LINK.INVITE, token: TOKEN });
  assert.deepEqual(readAuthLink(at("/?auth=sign-in")), { kind: AUTH_LINK.SIGN_IN, token: null });
  // A trailing slash from a mail client's rewriting is not a different page.
  assert.deepEqual(readAuthLink(at(`/verify-email/?token=${TOKEN}`)), { kind: AUTH_LINK.VERIFY_EMAIL, token: TOKEN });
});

test("a damaged link is still recognised, with no token to use", () => {
  for (const href of [
    "/verify-email",
    `/verify-email?token=${TOKEN.slice(0, 40)}`,
    `/reset-password?token=${TOKEN}!`,
    "/invite/",
    `/invite/${TOKEN}extra`,
  ]) {
    const link = readAuthLink(at(href));
    assert.ok(link, href);
    assert.equal(link.token, null, href);
  }
});

test("everything else is not a link", () => {
  for (const href of ["/", "/?roomId=room-1", "/?auth=sign-out", "/boards/x", `/verify?token=${TOKEN}`]) {
    assert.equal(readAuthLink(at(href)), null, href);
  }
  assert.equal(readAuthLink(undefined), null);
});

test("the address afterwards keeps other parameters and drops the token", () => {
  assert.equal(addressWithoutAuthLink(at(`/verify-email?token=${TOKEN}`)), "/");
  assert.equal(addressWithoutAuthLink(at("/?auth=sign-in&roomId=room-1#x")), "/?roomId=room-1#x");
  assert.ok(!addressWithoutAuthLink(at(`/reset-password?token=${TOKEN}`)).includes(TOKEN));
});
