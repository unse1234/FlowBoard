/**
 * FlowBoard's authentication API, as the browser calls it.
 *
 * The same shape as `features/ai/aiClient.js`: one typed error with a code
 * and a message safe to show, network and timeout failures named, and a
 * response that does not look right treated as a failure rather than trusted.
 *
 * Tokens (ADR 0002):
 * - The **access token** comes back in the body and is held in memory by the
 *   session controller, never in storage.
 * - The **refresh token** never touches script. The server sets it as an
 *   HttpOnly cookie, and only the three requests that set, exchange or clear it
 *   send credentials. Signup and `me` do not, so the cookie travels no further
 *   than it must.
 */

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Where the auth API is: this page's own origin, unless VITE_AUTH_API_URL says
 * otherwise.
 *
 * Same origin is what makes the refresh cookie work (AUTH_DECISIONS.md E-15).
 * The API runs on onrender.com and the app on vercel.app, which are different
 * sites, and a SameSite=Strict cookie is never sent across sites. So the app
 * calls `/api/auth/...` on itself and something in front forwards it: Vercel's
 * rewrite in production (Frontend/vercel.json), Vite's proxy in development
 * (vite.config.js). AI requests and the realtime socket still go straight to
 * VITE_API_URL: they carry no cookie.
 *
 * @returns {string} a base URL, where "" means this origin
 */
export function getAuthApiUrl() {
  return import.meta.env?.VITE_AUTH_API_URL ?? "";
}

export const AUTH_CLIENT_MESSAGES = Object.freeze({
  NETWORK: "Can't reach FlowBoard. Check your connection and try again.",
  TIMEOUT: "FlowBoard took too long to respond. Try again.",
  BAD_RESPONSE: "The server sent an unexpected response. Try again.",
  UNAVAILABLE: "Accounts aren't available on this server.",
});

export class AuthRequestError extends Error {
  /**
   * @param {string} code - the server's code, or NETWORK, TIMEOUT, CANCELLED, BAD_RESPONSE
   * @param {string} message - safe to show a person
   * @param {number | null} [status]
   */
  constructor(code, message, status = null) {
    super(message);
    this.name = "AuthRequestError";
    this.code = code;
    this.status = status;
  }
}

/**
 * @typedef {{ id: string, email: string, displayName: string, emailVerified: boolean, hasPassword: boolean }} AuthUser
 * @typedef {{ user: AuthUser, accessToken: string, accessTokenExpiresAt: Date }} AuthSession
 * @typedef {{ signal?: AbortSignal, fetchImpl?: typeof fetch, baseUrl?: string, timeoutMs?: number }} RequestOptions
 */

/**
 * Create an account. Resolves with nothing: the server answers the same
 * whether or not the address was already registered (AUTH_DECISIONS.md E-12),
 * so there is nothing to report beyond "accepted".
 *
 * @param {{ email: string, password: string, displayName: string, turnstileToken?: string } & RequestOptions} details
 *   `turnstileToken` where the server has Turnstile on (7.5)
 */
export async function signUp({ email, password, displayName, turnstileToken, ...options }) {
  const body = { email, password, displayName };
  if (turnstileToken) body.turnstileToken = turnstileToken;
  await send("/api/auth/signup", { ...options, body });
}

/**
 * @param {{ email: string, password: string } & RequestOptions} credentials
 * @returns {Promise<AuthSession>}
 */
export async function signIn({ email, password, ...options }) {
  const body = await send("/api/auth/login", {
    ...options,
    body: { email, password },
    credentials: "include",
  });
  return readSession(body);
}

/**
 * Exchange the refresh cookie for a new access token (and a rotated cookie).
 *
 * @param {RequestOptions} [options]
 * @returns {Promise<AuthSession>}
 */
export async function refreshSession(options = {}) {
  const body = await send("/api/auth/refresh", { ...options, credentials: "include" });
  return readSession(body);
}

/**
 * End this device's session. The server answers ok whatever state it was in.
 *
 * @param {RequestOptions} [options]
 */
export async function signOut(options = {}) {
  await send("/api/auth/logout", { ...options, credentials: "include" });
}

/**
 * The account behind an access token, as the server sees it now.
 *
 * @param {{ accessToken: string } & RequestOptions} request
 * @returns {Promise<AuthUser>}
 */
export async function fetchCurrentUser({ accessToken, ...options }) {
  const body = await send("/api/auth/me", { ...options, method: "GET", accessToken });
  const user = readUser(body?.user);
  if (!user) throw badResponse();
  return user;
}

/**
 * @typedef {{ id: string, createdAt: Date, lastUsedAt: Date, userAgent: string | null, ipAddress: string | null, current: boolean }} AuthSessionSummary
 */

/**
 * This account's live sessions, most recent first (Phase 3).
 *
 * @param {{ accessToken: string } & RequestOptions} request
 * @returns {Promise<AuthSessionSummary[]>}
 */
export async function listSessions({ accessToken, ...options }) {
  const body = await send("/api/auth/sessions", { ...options, method: "GET", accessToken });
  if (!Array.isArray(body?.sessions)) throw badResponse();

  return body.sessions.map((session) => {
    const createdAt = new Date(session?.createdAt);
    const lastUsedAt = new Date(session?.lastUsedAt);
    if (
      typeof session?.id !== "string" ||
      typeof session.current !== "boolean" ||
      Number.isNaN(createdAt.getTime()) ||
      Number.isNaN(lastUsedAt.getTime())
    ) {
      throw badResponse();
    }
    return Object.freeze({
      id: session.id,
      createdAt,
      lastUsedAt,
      userAgent: typeof session.userAgent === "string" ? session.userAgent : null,
      ipAddress: typeof session.ipAddress === "string" ? session.ipAddress : null,
      current: session.current,
    });
  });
}

/**
 * End one of this account's sessions, signing that device out.
 *
 * @param {{ accessToken: string, sessionId: string } & RequestOptions} request
 */
export async function revokeSession({ accessToken, sessionId, ...options }) {
  await send(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
    ...options,
    method: "DELETE",
    accessToken,
  });
}

/**
 * Sign out everywhere else: end every session but this one.
 *
 * @param {{ accessToken: string } & RequestOptions} request
 * @returns {Promise<number>} how many were ended
 */
export async function revokeOtherSessions({ accessToken, ...options }) {
  const body = await send("/api/auth/sessions/revoke-others", { ...options, body: {}, accessToken });
  return Number.isInteger(body?.revoked) ? body.revoked : 0;
}

/**
 * Confirm an email address with the token from its link. Works signed in or
 * not: the link is often opened on another device.
 *
 * @param {{ token: string } & RequestOptions} request
 */
export async function verifyEmail({ token, ...options }) {
  await send("/api/auth/verify-email", { ...options, body: { token } });
}

/**
 * Send a new verification link to the signed-in account. The previous link
 * stops working.
 *
 * @param {{ accessToken: string } & RequestOptions} request
 * @returns {Promise<{ alreadyVerified: boolean }>}
 */
export async function resendVerification({ accessToken, ...options }) {
  const body = await send("/api/auth/resend-verification", { ...options, body: {}, accessToken });
  return { alreadyVerified: body?.alreadyVerified === true };
}

/**
 * Ask for a password-reset link. The server answers the same whether or not
 * the address has an account, and so does this: it resolves with the
 * server's wording, which never says which.
 *
 * @param {{ email: string } & RequestOptions} request
 * @returns {Promise<string>} the message to show
 */
export async function requestPasswordReset({ email, ...options }) {
  const body = await send("/api/auth/forgot-password", { ...options, body: { email } });
  return typeof body?.message === "string" && body.message
    ? body.message
    : "If an account exists for that address, a password-reset email has been sent.";
}

/**
 * Choose a new password with the token from a reset link. Every device is
 * signed out, this one included, so the person signs in again afterwards.
 *
 * @param {{ token: string, password: string } & RequestOptions} request
 */
export async function resetPassword({ token, password, ...options }) {
  await send("/api/auth/reset-password", { ...options, body: { token, password } });
}

/**
 * Change the name shown to collaborators.
 *
 * @param {{ accessToken: string, displayName: string } & RequestOptions} request
 * @returns {Promise<AuthUser>}
 */
export async function updateDisplayName({ accessToken, displayName, ...options }) {
  const body = await send("/api/auth/me", { ...options, method: "PATCH", body: { displayName }, accessToken });
  const user = readUser(body?.user);
  if (!user) throw badResponse();
  return user;
}

/**
 * Change the password (with the current one), or set a first one for an
 * account that signs in through a provider (after signing in with it again).
 *
 * Every session ends, and this device gets a new one, so the response is a
 * whole session and the request must let the browser store its new cookie.
 *
 * @param {{ accessToken: string, currentPassword?: string, newPassword: string } & RequestOptions} request
 * @returns {Promise<AuthSession>}
 */
export async function changePassword({ accessToken, currentPassword, newPassword, ...options }) {
  const body = { newPassword };
  if (currentPassword !== undefined) body.currentPassword = currentPassword;
  const response = await send("/api/auth/password", { ...options, body, accessToken, credentials: "include" });
  return readSession(response);
}

/**
 * What deleting the account would do: the shared boards to hand over or
 * delete first, how many private boards go with it, and which proof of
 * identity it will ask for.
 *
 * @param {{ accessToken: string } & RequestOptions} request
 * @returns {Promise<{ sharedBoards: { id: string, title: string, members: { id: string, displayName: string, role: string }[] }[],
 *   privateBoardCount: number, proof: "password" | "provider" }>}
 */
export async function getDeletionPreflight({ accessToken, ...options }) {
  const body = await send("/api/auth/delete-account", { ...options, method: "GET", accessToken });
  if (!Array.isArray(body?.sharedBoards) || !Number.isInteger(body.privateBoardCount)) throw badResponse();
  return { sharedBoards: body.sharedBoards, privateBoardCount: body.privateBoardCount, proof: body.proof };
}

/**
 * Delete the account, at once and for good. The browser is allowed to store
 * the response's cleared refresh cookie.
 *
 * @param {{ accessToken: string, confirmation: string, password?: string } & RequestOptions} request
 */
export async function deleteAccount({ accessToken, confirmation, password, ...options }) {
  const body = { confirmation };
  if (password !== undefined) body.password = password;
  await send("/api/auth/delete-account", { ...options, body, accessToken, credentials: "include" });
}

async function send(
  path,
  {
    method = "POST",
    body,
    accessToken,
    credentials = "omit",
    signal,
    fetchImpl = globalThis.fetch,
    baseUrl = getAuthApiUrl(),
    timeoutMs = REQUEST_TIMEOUT_MS,
  },
) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => controller.abort();

  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });

  const interrupted = () => {
    if (timedOut) return new AuthRequestError("TIMEOUT", AUTH_CLIENT_MESSAGES.TIMEOUT);
    if (signal?.aborted) return new AuthRequestError("CANCELLED", "Cancelled.");
    return null;
  };

  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    let response;
    try {
      response = await fetchImpl(`${String(baseUrl).replace(/\/+$/, "")}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials,
        // A token response must never come from a cache.
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      throw interrupted() ?? new AuthRequestError("NETWORK", AUTH_CLIENT_MESSAGES.NETWORK);
    }

    const payload = await response.json().catch(() => null);
    const stopped = interrupted();
    if (stopped) throw stopped;

    if (response.ok && payload?.ok === true) return payload;

    // Every auth route exists whenever accounts are switched on, so a 404
    // means they are not: a server with no database mounts no auth routes
    // (Backend/src/server.js). Named, so the UI can step aside rather than
    // offer a sign-in that cannot work.
    if (response.status === 404 && payload?.ok !== false) {
      throw new AuthRequestError("AUTH_UNAVAILABLE", AUTH_CLIENT_MESSAGES.UNAVAILABLE, 404);
    }

    throw new AuthRequestError(
      typeof payload?.code === "string" ? payload.code : `HTTP_${response.status}`,
      typeof payload?.error === "string" && payload.error
        ? payload.error
        : AUTH_CLIENT_MESSAGES.BAD_RESPONSE,
      response.status,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

/** A session from a response body, or a BAD_RESPONSE error: never half of one. */
function readSession(body) {
  const user = readUser(body?.user);
  const expiresAt = new Date(body?.accessTokenExpiresAt);

  if (
    !user ||
    typeof body.accessToken !== "string" ||
    body.accessToken.length === 0 ||
    Number.isNaN(expiresAt.getTime())
  ) {
    throw badResponse();
  }

  return { user, accessToken: body.accessToken, accessTokenExpiresAt: expiresAt };
}

/** Only the named fields, so nothing unexpected from the server reaches the UI. */
function readUser(user) {
  if (
    !user ||
    typeof user.id !== "string" ||
    typeof user.email !== "string" ||
    typeof user.displayName !== "string" ||
    typeof user.emailVerified !== "boolean"
  ) {
    return null;
  }

  return Object.freeze({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    // A server from before account settings did not say; every account it
    // knew had a password.
    hasPassword: typeof user.hasPassword === "boolean" ? user.hasPassword : true,
  });
}

function badResponse() {
  return new AuthRequestError("BAD_RESPONSE", AUTH_CLIENT_MESSAGES.BAD_RESPONSE);
}
