/**
 * Cloudflare Turnstile in the browser (chunk 7.5, AUTH_DECISIONS.md E-18).
 *
 * Only signup uses it, and only where a site key is configured. The script is
 * fetched the first time the sign-up form needs it, never on a plain page
 * load, so people who never sign up never load it.
 */

export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Must match SIGNUP_ACTION in Backend/src/auth/botCheck.js; authContract.test.js checks. */
export const TURNSTILE_SIGNUP_ACTION = "signup";

/** The public site key, or null when Turnstile is off. */
export function getTurnstileSiteKey(env = import.meta.env) {
  const key = env?.VITE_TURNSTILE_SITE_KEY;
  return typeof key === "string" && key.trim() !== "" ? key.trim() : null;
}

let pending = null;

/**
 * The `turnstile` API, loading the script once however many callers ask.
 *
 * @param {{ doc?: Document, win?: Window }} [environment]  injectable for tests
 * @returns {Promise<{ render: Function, reset: Function, remove: Function }>}
 */
export function loadTurnstile({ doc = globalThis.document, win = globalThis.window } = {}) {
  if (win?.turnstile) return Promise.resolve(win.turnstile);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (win.turnstile) resolve(win.turnstile);
      else reject(new Error("Turnstile loaded but did not start."));
    };
    script.onerror = () => reject(new Error("Turnstile could not be loaded."));
    doc.head.appendChild(script);
  }).catch((error) => {
    // Let a later attempt try again, for example once the network is back.
    pending = null;
    throw error;
  });

  return pending;
}

/** For tests: forget a load in progress. */
export function resetTurnstileLoader() {
  pending = null;
}
