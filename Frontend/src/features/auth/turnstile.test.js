import assert from "node:assert/strict";
import test from "node:test";
import {
  TURNSTILE_SCRIPT_URL,
  getTurnstileSiteKey,
  loadTurnstile,
  resetTurnstileLoader,
} from "./turnstile.js";

/** Just enough of a document to watch a script being added. */
function fakeEnvironment() {
  const scripts = [];
  const doc = {
    createElement: () => ({}),
    head: { appendChild: (script) => scripts.push(script) },
  };
  return { scripts, doc, win: {} };
}

test("Turnstile is off without a site key", () => {
  assert.equal(getTurnstileSiteKey({}), null);
  assert.equal(getTurnstileSiteKey({ VITE_TURNSTILE_SITE_KEY: "  " }), null);
  assert.equal(getTurnstileSiteKey({ VITE_TURNSTILE_SITE_KEY: " 0x4AAAsite " }), "0x4AAAsite");
});

test("the script is loaded once, however many forms ask", async () => {
  resetTurnstileLoader();
  const { scripts, doc, win } = fakeEnvironment();

  const first = loadTurnstile({ doc, win });
  const second = loadTurnstile({ doc, win });
  win.turnstile = { render() {} };
  scripts[0].onload();

  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, TURNSTILE_SCRIPT_URL);
  assert.equal(await first, win.turnstile);
  assert.equal(await second, win.turnstile);
});

test("a failed load can be retried", async () => {
  resetTurnstileLoader();
  const { scripts, doc, win } = fakeEnvironment();

  const failed = loadTurnstile({ doc, win });
  scripts[0].onerror();
  await assert.rejects(failed, /could not be loaded/);

  const retried = loadTurnstile({ doc, win });
  win.turnstile = { render() {} };
  scripts[1].onload();

  assert.equal(await retried, win.turnstile);
});

test("an already present Turnstile is used as is", async () => {
  resetTurnstileLoader();
  const { scripts, doc } = fakeEnvironment();
  const win = { turnstile: { render() {} } };

  assert.equal(await loadTurnstile({ doc, win }), win.turnstile);
  assert.equal(scripts.length, 0);
});
