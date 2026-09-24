import {
  AuthRequestError,
  refreshSession,
  signIn as requestSignIn,
  signOut as requestSignOut,
  signUp as requestSignUp,
} from "./authClient.js";

/**
 * The signed-in state of this tab, and everything that keeps it current.
 *
 * Framework-free, so every edge is testable in node. React reads it through
 * `useSyncExternalStore` (AuthProvider.jsx).
 *
 * - **The access token lives here, in memory, and nowhere else.** Not in
 *   storage, not in a broadcast. A reload loses it, and restore gets a new one
 *   from the refresh cookie.
 * - **Restore on load.** The cookie is HttpOnly, so the only way to know if a
 *   session exists is to try to refresh it.
 * - **Refresh ahead of expiry**, so a request never waits on it.
 * - **One refresh at a time across tabs** (Web Locks). Every tab shares one
 *   cookie, so two refreshing at once present the same token. The server's
 *   grace window absorbs that, but serialising means it rarely has to.
 * - **Sign-in and sign-out reach every tab** (BroadcastChannel). The message
 *   says only which. Never a token, never who.
 * - **A generation counter.** Every sign-in and sign-out moves it on, and an
 *   async result from an older generation is dropped, so a refresh finishing
 *   after a sign-out cannot bring the session back.
 */

export const AUTH_STATUS = Object.freeze({
  RESTORING: "restoring",
  SIGNED_OUT: "signed_out",
  SIGNED_IN: "signed_in",
  // The server has accounts switched off (no database). Nothing to offer, and
  // nothing to retry: it will not change during this page's life.
  UNAVAILABLE: "unavailable",
});

const CHANNEL_NAME = "flowboard:auth";
const LOCK_NAME = "flowboard:auth-refresh";

/** Refresh this long before the access token expires. */
const REFRESH_LEAD_MS = 60_000;
/** A token this close to expiry is refreshed before being handed out. */
const MIN_REMAINING_MS = 30_000;
/** After a network failure, try again this much later. */
const RETRY_DELAY_MS = 30_000;
/** Never schedule a refresh sooner than this, however short the token. */
const MIN_REFRESH_DELAY_MS = 5_000;

/** Codes that mean the session is over, rather than unreachable. */
const SESSION_ENDED_CODES = new Set(["SESSION_INVALID", "ACCOUNT_UNAVAILABLE"]);

/**
 * The message for a sign-up whose follow-up sign-in was refused.
 *
 * Sign-up answers the same whether or not the address was taken (E-12). So if
 * the automatic sign-in then fails, the likeliest reason is an existing account
 * with another password. Said conditionally, since the response cannot tell,
 * and this reveals nothing a sign-in attempt would not.
 */
export const SIGN_UP_THEN_SIGN_IN_FAILED =
  "We couldn't sign you in with that password. If you already have an account, sign in instead.";

const SIGNED_OUT_SNAPSHOT = Object.freeze({ status: AUTH_STATUS.SIGNED_OUT, user: null });
const UNAVAILABLE_SNAPSHOT = Object.freeze({ status: AUTH_STATUS.UNAVAILABLE, user: null });
const RESTORING_SNAPSHOT = Object.freeze({ status: AUTH_STATUS.RESTORING, user: null });

/**
 * @param {Object} [options]
 * @param {{ signIn: Function, signUp: Function, refreshSession: Function, signOut: Function }} [options.client]
 * @param {() => number} [options.now]
 * @param {(callback: () => void, ms: number) => unknown} [options.setTimer]
 * @param {(handle: unknown) => void} [options.clearTimer]
 * @param {{ request(name: string, callback: () => Promise<unknown>): Promise<unknown> } | null} [options.locks]
 * @param {{ postMessage(message: unknown): void, addEventListener: Function, removeEventListener: Function, close?(): void } | null} [options.channel]
 */
export function createAuthSession({
  client = {
    signIn: requestSignIn,
    signUp: requestSignUp,
    refreshSession,
    signOut: requestSignOut,
  },
  now = () => Date.now(),
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle),
  locks = globalThis.navigator?.locks ?? null,
  channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL_NAME) : null,
} = {}) {
  let snapshot = RESTORING_SNAPSHOT;
  let accessToken = null;
  let expiresAt = 0;
  let generation = 0;
  let timer = null;
  let inFlight = null;
  let started = false;
  let disposed = false;
  const listeners = new Set();

  function publish(next) {
    if (next === snapshot) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function schedule(delayMs, task) {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      if (!disposed) task();
    }, delayMs);
  }

  function cancelSchedule() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function apply(session) {
    accessToken = session.accessToken;
    expiresAt = session.accessTokenExpiresAt.getTime();

    // A new object only when who is signed in actually changed, so React does
    // not re-render every tab on every quarter-hour refresh.
    const unchanged =
      snapshot.status === AUTH_STATUS.SIGNED_IN &&
      snapshot.user.id === session.user.id &&
      snapshot.user.displayName === session.user.displayName &&
      snapshot.user.email === session.user.email &&
      snapshot.user.emailVerified === session.user.emailVerified;
    if (!unchanged) publish(Object.freeze({ status: AUTH_STATUS.SIGNED_IN, user: session.user }));

    schedule(Math.max(expiresAt - now() - REFRESH_LEAD_MS, MIN_REFRESH_DELAY_MS), () => {
      refresh().catch(() => {});
    });
  }

  function clear(next = SIGNED_OUT_SNAPSHOT) {
    generation += 1;
    accessToken = null;
    expiresAt = 0;
    cancelSchedule();
    publish(next);
  }

  function withRefreshLock(task) {
    return locks ? locks.request(LOCK_NAME, task) : task();
  }

  /**
   * Exchange the cookie for a new session. One at a time in this tab, and in
   * every tab that supports Web Locks.
   *
   * Resolves with the new access token, or null if there is no session.
   * Rejects only for a failure that says nothing about the session, such as
   * the network, and then keeps things as they were and tries again later.
   */
  function refresh() {
    if (inFlight) return inFlight;

    const startedIn = generation;

    inFlight = withRefreshLock(() => client.refreshSession())
      .then(
        (session) => {
          // Signed in or out while this was in flight: that decision wins.
          if (disposed || generation !== startedIn) return accessToken;
          apply(session);
          return accessToken;
        },
        (error) => {
          if (disposed || generation !== startedIn) return accessToken;

          if (error instanceof AuthRequestError && SESSION_ENDED_CODES.has(error.code)) {
            clear();
            return null;
          }

          if (error instanceof AuthRequestError && error.code === "AUTH_UNAVAILABLE") {
            clear(UNAVAILABLE_SNAPSHOT);
            return null;
          }

          // Unreachable, timed out or garbled. Nothing is known about the
          // session, so nothing changes. A signed-in tab stays signed in; a
          // restoring one shows signed out, since it cannot show an account it
          // has not confirmed. Try again either way.
          if (snapshot.status === AUTH_STATUS.RESTORING) publish(SIGNED_OUT_SNAPSHOT);
          schedule(RETRY_DELAY_MS, () => {
            refresh().catch(() => {});
          });
          throw error;
        },
      )
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  function broadcast(type) {
    try {
      channel?.postMessage({ type });
    } catch {
      // A closed channel only means other tabs learn on their next refresh.
    }
  }

  function onMessage(event) {
    if (disposed) return;
    const type = event?.data?.type;

    if (type === "signed_out") {
      // The tab that signed out already told the server and cleared the
      // cookie. Only this tab's memory is left.
      clear();
    } else if (type === "signed_in") {
      // The cookie now belongs to that sign-in. Adopt it, whoever it is.
      //
      // A refresh already in flight here went out with the old cookie, so its
      // answer may describe the old session. Moving the generation on drops
      // it. Then refresh again once it has settled, since refresh() would
      // otherwise just hand back that same stale request.
      generation += 1;
      const pending = inFlight ?? Promise.resolve();
      pending
        .catch(() => {})
        .then(() => {
          if (!disposed) refresh().catch(() => {});
        });
    }
  }

  channel?.addEventListener("message", onMessage);

  return {
    /** Current state. The same object until something changes. */
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Find out whether this browser already has a session. Once. */
    start() {
      if (started || disposed) return;
      started = true;
      refresh().catch(() => {});
    },

    /**
     * @param {{ email: string, password: string }} credentials
     * @returns {Promise<import("./authClient.js").AuthUser>}
     */
    async signIn(credentials) {
      const session = await client.signIn(credentials);
      generation += 1;
      apply(session);
      broadcast("signed_in");
      return session.user;
    },

    /**
     * Create an account, then sign straight in with the same details.
     *
     * @param {{ email: string, password: string, displayName: string }} details
     * @returns {Promise<import("./authClient.js").AuthUser>}
     */
    async signUp(details) {
      await client.signUp(details);

      let session;
      try {
        session = await client.signIn({ email: details.email, password: details.password });
      } catch (error) {
        if (error instanceof AuthRequestError && error.code === "INVALID_CREDENTIALS") {
          throw new AuthRequestError("SIGN_UP_THEN_SIGN_IN_FAILED", SIGN_UP_THEN_SIGN_IN_FAILED, error.status);
        }
        throw error;
      }

      generation += 1;
      apply(session);
      broadcast("signed_in");
      return session.user;
    },

    /**
     * Sign out of this browser.
     *
     * Waits for the server, because only the server can clear the HttpOnly
     * cookie. A sign-out that only cleared this tab's memory would be undone
     * by the next reload. If the server cannot be reached this rejects and
     * nothing changes, so the person can see it did not happen and retry.
     */
    async signOut() {
      await client.signOut();
      clear();
      broadcast("signed_out");
    },

    /**
     * A usable access token, refreshed first if it is about to expire, or
     * null when signed out. For callers of protected APIs.
     */
    async getAccessToken() {
      if (snapshot.status === AUTH_STATUS.SIGNED_OUT || snapshot.status === AUTH_STATUS.UNAVAILABLE) {
        return null;
      }
      if (accessToken && expiresAt - now() > MIN_REMAINING_MS) return accessToken;
      return refresh();
    },

    dispose() {
      disposed = true;
      cancelSchedule();
      listeners.clear();
      channel?.removeEventListener("message", onMessage);
      channel?.close?.();
    },
  };
}
