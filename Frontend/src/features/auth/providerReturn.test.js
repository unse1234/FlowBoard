import assert from "node:assert/strict";
import test from "node:test";
import { addressWithoutProviderReturn, readProviderReturn } from "./providerReturn.js";

const at = (href) => {
  const url = new URL(href, "https://app.flowboard.test");
  return { pathname: url.pathname, search: url.search, hash: url.hash };
};

test("each outcome reads in plain words, naming the provider", () => {
  assert.deepEqual(readProviderReturn(at("/?oauth=signed-in&provider=github")), {
    ok: true,
    outcome: "signed-in",
    message: { tone: "success", title: "Signed in with GitHub" },
  });
  assert.equal(readProviderReturn(at("/?oauth=linked&provider=microsoft")).message.title, "Microsoft is now connected");
});

test("the existing-account refusal says exactly what to do", () => {
  const result = readProviderReturn(at("/?oauth_error=account_exists&provider=google"));

  assert.equal(result.ok, false);
  assert.equal(result.message.title, "An account already exists with this email");
  assert.equal(
    result.message.description,
    "Sign in with your existing password account first, then connect Google from Account settings.",
  );
});

test("nothing from the address is shown as-is", () => {
  const crafted = readProviderReturn(at("/?oauth_error=<b>pwned</b>&provider=<script>"));

  assert.equal(crafted.message.title, "your account provider couldn't sign you in");
  assert.ok(!JSON.stringify(crafted).includes("<"));
  assert.equal(readProviderReturn(at("/?oauth=made-up&provider=google")).ok, false);
});

test("an ordinary address is not a provider return, and the report is cleared from it", () => {
  assert.equal(readProviderReturn(at("/?roomId=abc")), null);
  assert.equal(addressWithoutProviderReturn(at("/?oauth=signed-in&provider=google&roomId=abc#x")), "/?roomId=abc#x");
  assert.equal(addressWithoutProviderReturn(at("/?oauth_error=cancelled&provider=google")), "/");
});
