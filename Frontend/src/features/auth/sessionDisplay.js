/**
 * How a session reads in the account dialog's device list (chunk 3.3).
 *
 * Pure, so the wording is testable. The User-Agent is only ever *displayed*
 * here, never trusted for anything: it is whatever the browser sent at sign-in.
 */

/** Checked in order: the first match wins, so Edge and Opera come before Chrome. */
const BROWSERS = [
  ["Edge", /\bEdg(?:e|A|iOS)?\//],
  ["Opera", /\bOPR\/|\bOpera\b/],
  ["Samsung Internet", /\bSamsungBrowser\//],
  ["Firefox", /\bFirefox\/|\bFxiOS\//],
  ["Chrome", /\bChrome\/|\bCriOS\//],
  ["Safari", /\bSafari\//],
];

const SYSTEMS = [
  ["iPhone", /\biPhone\b/],
  ["iPad", /\biPad\b/],
  ["Android", /\bAndroid\b/],
  ["Windows", /\bWindows\b/],
  ["macOS", /\bMac OS X\b|\bMacintosh\b/],
  ["ChromeOS", /\bCrOS\b/],
  ["Linux", /\bLinux\b/],
];

const MOBILE_SYSTEMS = new Set(["iPhone", "Android"]);

/**
 * @param {string | null} userAgent
 * @returns {{ label: string, mobile: boolean }}  e.g. "Chrome on Windows"
 */
export function describeUserAgent(userAgent) {
  if (typeof userAgent !== "string" || userAgent.trim() === "") {
    return { label: "Unknown device", mobile: false };
  }

  const browser = BROWSERS.find(([, pattern]) => pattern.test(userAgent))?.[0];
  const system = SYSTEMS.find(([, pattern]) => pattern.test(userAgent))?.[0];

  const label =
    browser && system ? `${browser} on ${system}` : (browser ?? system ?? "Unknown device");

  return { label, mobile: MOBILE_SYSTEMS.has(system) };
}

const UNITS = [
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

/**
 * "Active now", or "Active 5 minutes ago", from the last time a session was used.
 *
 * @param {Date | string} lastUsedAt
 * @param {number} [now]
 */
export function formatLastActive(lastUsedAt, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(lastUsedAt).getTime()) / 1000));

  // A session refreshes quietly every quarter hour, so "now" is anything
  // within a couple of minutes.
  if (seconds < 120) return "Active now";

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return `Active ${formatter.format(-Math.floor(seconds / size), unit)}`;
  }
  return "Active now";
}
