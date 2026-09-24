import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AuthContext } from "./authContext.js";
import { createAuthSession } from "./authSession.js";

/**
 * One session controller for the page, created on first use.
 *
 * Module scope rather than component state, because StrictMode runs state
 * initialisers twice in development. The discarded twin would still hold an
 * open BroadcastChannel, and would answer another tab's sign-in with a refresh
 * of its own. It is never disposed: it lives exactly as long as the page.
 */
let pageSession = null;

function getPageSession() {
  pageSession ??= createAuthSession();
  return pageSession;
}

/**
 * AuthProvider — makes the signed-in state available to the app.
 *
 * Starts the restore on mount, so a returning visitor is signed in again
 * without doing anything. `start` runs once however many times the effect
 * fires, which StrictMode makes twice.
 */
export function AuthProvider({ children }) {
  const auth = getPageSession();
  const snapshot = useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getSnapshot);

  useEffect(() => {
    auth.start();
  }, [auth]);

  const value = useMemo(
    () => ({
      status: snapshot.status,
      user: snapshot.user,
      signIn: auth.signIn,
      signUp: auth.signUp,
      signOut: auth.signOut,
      getAccessToken: auth.getAccessToken,
    }),
    [auth, snapshot],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
