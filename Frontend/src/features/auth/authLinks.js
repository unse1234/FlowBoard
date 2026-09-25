/**
 * The links FlowBoard's emails and invitations point at, read from the page's
 * address.
 *
 * - `/verify-email?token=…`   confirm an address (Phase A)
 * - `/reset-password?token=…` choose a new password (Phase A)
 * - `/invite/<token>`         accept a board invitation (Phase C)
 * - `/?auth=sign-in`          open sign-in, from "you already have an account"
 *
 * Opening a link does nothing by itself. The page reads the token, removes it
 * from the address bar at once (so it is not left in history, a screenshot or
 * a shared screen), and only a deliberate request uses it.
 */

export const AUTH_LINK = Object.freeze({
  VERIFY_EMAIL: "verify-email",
  RESET_PASSWORD: "reset-password",
  INVITE: "invite",
  SIGN_IN: "sign-in",
});

/** 32 random bytes as base64url: the only shape the server issues. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const tokenOrNull = (value) => (typeof value === "string" && TOKEN_PATTERN.test(value) ? value : null);

/**
 * @param {{ pathname?: string, search?: string } | undefined} location
 * @returns {{ kind: string, token: string | null } | null}
 *   null when the address is not one of these links. `token` is null for a
 *   link that arrived damaged, so the page can say so.
 */
export function readAuthLink(location = globalThis.location) {
  const path = (location?.pathname ?? "/").replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(location?.search ?? "");

  if (path === "/verify-email") return { kind: AUTH_LINK.VERIFY_EMAIL, token: tokenOrNull(params.get("token")) };
  if (path === "/reset-password") return { kind: AUTH_LINK.RESET_PASSWORD, token: tokenOrNull(params.get("token")) };

  const invite = /^\/invite(?:\/([^/]*))?$/.exec(path);
  if (invite) return { kind: AUTH_LINK.INVITE, token: tokenOrNull(invite[1] ?? null) };

  if (path === "/" && params.get("auth") === "sign-in") return { kind: AUTH_LINK.SIGN_IN, token: null };

  return null;
}

/**
 * The address to show once a link has been read: the app's root, keeping any
 * other query parameters but never the token or the `auth` switch.
 *
 * @param {{ search?: string, hash?: string } | undefined} location
 */
export function addressWithoutAuthLink(location = globalThis.location) {
  const params = new URLSearchParams(location?.search ?? "");
  params.delete("token");
  params.delete("auth");
  const query = params.toString();
  return `/${query ? `?${query}` : ""}${location?.hash ?? ""}`;
}
