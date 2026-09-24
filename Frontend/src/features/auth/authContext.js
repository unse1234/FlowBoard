import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

/**
 * useAuth — who is signed in, and the actions that change it.
 *
 * `{ status, user, signIn, signUp, signOut, getAccessToken }`, where status is
 * one of AUTH_STATUS (authSession.js). `user` is null unless signed in.
 *
 * Throws outside an AuthProvider rather than pretending to be signed out: a
 * component that silently never sees a session is a bug that looks like a
 * working sign-out.
 */
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>.");
  return value;
}
