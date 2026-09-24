import assert from "node:assert/strict";
import test from "node:test";
import { describeUserAgent, formatLastActive } from "./sessionDisplay.js";

const AGENTS = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
};

test("common browsers read as a person would say them", () => {
  const labels = Object.fromEntries(
    Object.entries(AGENTS).map(([key, agent]) => [key, describeUserAgent(agent).label]),
  );

  assert.deepEqual(labels, {
    chromeWindows: "Chrome on Windows",
    // Edge and Chrome on iOS both also claim Chrome and Safari; the first
    // specific match has to win.
    edgeWindows: "Edge on Windows",
    safariMac: "Safari on macOS",
    safariIphone: "Safari on iPhone",
    chromeAndroid: "Chrome on Android",
    firefoxLinux: "Firefox on Linux",
    chromeIphone: "Chrome on iPhone",
  });
});

test("phones are marked mobile, desktops are not", () => {
  assert.equal(describeUserAgent(AGENTS.safariIphone).mobile, true);
  assert.equal(describeUserAgent(AGENTS.chromeAndroid).mobile, true);
  assert.equal(describeUserAgent(AGENTS.chromeWindows).mobile, false);
});

test("an unfamiliar or missing agent is shown honestly, never guessed", () => {
  assert.equal(describeUserAgent(null).label, "Unknown device");
  assert.equal(describeUserAgent("").label, "Unknown device");
  assert.equal(describeUserAgent("curl/8.9.1").label, "Unknown device");
  assert.equal(describeUserAgent("FlowBoardTest/1.0 (X11; Linux)").label, "Linux");
});

test("last activity reads in plain words", () => {
  const now = Date.UTC(2026, 8, 25, 12);
  const ago = (seconds) => new Date(now - seconds * 1000);

  assert.equal(formatLastActive(ago(30), now), "Active now");
  assert.equal(formatLastActive(ago(5 * 60), now), "Active 5 minutes ago");
  assert.equal(formatLastActive(ago(3 * 60 * 60), now), "Active 3 hours ago");
  assert.equal(formatLastActive(ago(26 * 60 * 60), now), "Active yesterday");
  assert.equal(formatLastActive(ago(4 * 24 * 60 * 60), now), "Active 4 days ago");
  // A clock slightly ahead of the server's is not "in the future".
  assert.equal(formatLastActive(new Date(now + 5_000), now), "Active now");
  assert.equal(formatLastActive(ago(5 * 60).toISOString(), now), "Active 5 minutes ago");
});
