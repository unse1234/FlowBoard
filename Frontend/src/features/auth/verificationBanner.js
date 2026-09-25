/**
 * Whether the "confirm your email" banner is showing (D-5).
 *
 * Persistent but dismissible: it returns in every new browser session until
 * the address is confirmed, and "dismiss" hides it for the rest of this one.
 * Remembered per account, so dismissing it for one account does not hide it
 * for another signed in later in the same tab.
 *
 * Only ever a convenience. Storage failing (private mode, blocked storage)
 * means the banner shows, which is the safe side.
 */

const KEY_PREFIX = "flowboard:verify-banner-dismissed:";

/**
 * @param {{ id: string, emailVerified: boolean } | null} user
 * @param {Storage | null | undefined} [storage]
 */
export function shouldShowVerificationBanner(user, storage = globalThis.sessionStorage) {
  if (!user || user.emailVerified) return false;
  try {
    return storage?.getItem(`${KEY_PREFIX}${user.id}`) !== "1";
  } catch {
    return true;
  }
}

/**
 * @param {{ id: string }} user
 * @param {Storage | null | undefined} [storage]
 */
export function dismissVerificationBanner(user, storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(`${KEY_PREFIX}${user.id}`, "1");
  } catch {
    // It will simply show again; nothing is lost.
  }
}
