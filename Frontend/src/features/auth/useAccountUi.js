import { useCallback, useEffect, useMemo, useState } from "react";
import { buildAccountMenuItems } from "../../components/auth/accountMenuItems.js";
import {
  connectProvider,
  listProviders,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  startProviderSignIn,
  verifyEmail,
} from "./authClient.js";
import { useAuth } from "./authContext.js";
import { AUTH_MODES } from "./authForm.js";
import { AUTH_LINK, addressWithoutAuthLink, readAuthLink } from "./authLinks.js";
import { AUTH_STATUS } from "./authSession.js";
import { addressWithoutProviderReturn, readProviderReturn } from "./providerReturn.js";
import { dismissVerificationBanner, shouldShowVerificationBanner } from "./verificationBanner.js";

let providerReturnRead = false;
let providerReturnAnnounced = false;
let providerReturnValue = null;

/**
 * What a provider sign-in came back with (`/?oauth=…`), read once per page
 * load and cleared from the address at the same moment.
 */
function consumeProviderReturn() {
  if (providerReturnRead) return providerReturnValue;
  providerReturnRead = true;

  providerReturnValue = readProviderReturn(window.location);
  if (providerReturnValue) {
    window.history.replaceState(window.history.state, "", addressWithoutProviderReturn(window.location));
  }
  return providerReturnValue;
}

/** Set once a verification link has been sent to the server, for this page load. */
let verificationStarted = false;
let pageLinkRead = false;
let pageLinkValue = null;

/**
 * The account link this page was opened with (authLinks.js), read once per
 * page load. The address bar is cleared at the same moment, so the token is
 * not left in history. Board invitations are left for the board to handle.
 */
function consumePageLink() {
  if (pageLinkRead) return pageLinkValue;
  pageLinkRead = true;

  const link = readAuthLink(window.location);
  if (!link || link.kind === AUTH_LINK.INVITE) return null;

  window.history.replaceState(window.history.state, "", addressWithoutAuthLink(window.location));
  pageLinkValue = link;
  return link;
}

/**
 * useAccountUi — every account surface's state and actions, for the board page.
 *
 * Owns which dialog is open (sign in, account, reset password), the
 * verification banner, and the links that arrive from email. Kept out of
 * BoardPage.jsx so the page wires one object into its menus and renders one
 * `<AccountSurfaces>`.
 *
 * A link is read once per page load and removed from the address bar before
 * anything is done with it, and verifying starts at most once, so React's
 * development double-mount can never use a token twice.
 *
 * @param {{ toast: (options: Object) => void }} options
 */
export function useAccountUi({ toast }) {
  const auth = useAuth();
  const { getAccessToken, reloadUser, signOut } = auth;

  const [pageLink] = useState(consumePageLink);
  const [providerReturn] = useState(consumeProviderReturn);
  // Signing in with a provider is offered only where the server has one.
  const [providers, setProviders] = useState([]);
  const [authDialog, setAuthDialog] = useState(() => ({
    open: pageLink?.kind === AUTH_LINK.SIGN_IN,
    mode: AUTH_MODES.SIGN_IN,
    key: 0,
  }));
  // Back from connecting a provider or proving identity: straight to settings.
  const [accountOpen, setAccountOpen] = useState(
    () => providerReturn?.ok === true && (providerReturn.outcome === "linked" || providerReturn.outcome === "reauthenticated"),
  );
  // A new key each time the account dialog opens, so its device list is fresh.
  const [accountKey, setAccountKey] = useState(0);
  const [reset, setReset] = useState(() => ({
    open: pageLink?.kind === AUTH_LINK.RESET_PASSWORD,
    token: pageLink?.kind === AUTH_LINK.RESET_PASSWORD ? pageLink.token : null,
    key: 0,
  }));
  const [deletion, setDeletion] = useState({ open: false, key: 0 });
  // Storage is not reactive; this re-renders after a dismissal.
  const [, setBannerVersion] = useState(0);

  // A new key each time, so a form opens empty rather than holding the last
  // attempt's password.
  const openAuth = useCallback(
    (mode) => setAuthDialog((current) => ({ open: true, mode, key: current.key + 1 })),
    [],
  );
  const openSignIn = useCallback(() => openAuth(AUTH_MODES.SIGN_IN), [openAuth]);
  const openSignUp = useCallback(() => openAuth(AUTH_MODES.SIGN_UP), [openAuth]);
  const closeAuthDialog = useCallback(() => setAuthDialog((current) => ({ ...current, open: false })), []);

  const openAccount = useCallback(() => {
    setAccountKey((key) => key + 1);
    setAccountOpen(true);
  }, []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);

  const handleAuthSuccess = useCallback(
    (user, mode) => {
      setAuthDialog((current) => ({ ...current, open: false }));
      toast({
        id: "auth",
        tone: "success",
        title:
          mode === AUTH_MODES.SIGN_UP
            ? `Welcome to FlowBoard, ${user.displayName}`
            : `Signed in as ${user.displayName}`,
        description:
          mode === AUTH_MODES.SIGN_UP ? `We sent a link to ${user.email} to confirm your address.` : undefined,
      });
    },
    [toast],
  );

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      setAccountOpen(false);
      toast({ id: "auth", title: "Signed out" });
    } catch (error) {
      // Nothing changed: only the server can clear the session cookie, so a
      // sign-out it never received is reported, not pretended.
      toast({ id: "auth", tone: "danger", title: "Couldn't sign out", description: error.message });
    }
  }, [signOut, toast]);

  // In place of the account dialog, never on top of it.
  const openDeleteAccount = useCallback(() => {
    setAccountOpen(false);
    setDeletion((current) => ({ open: true, key: current.key + 1 }));
  }, []);
  const closeDeleteAccount = useCallback(() => setDeletion((current) => ({ ...current, open: false })), []);

  const handleAccountDeleted = useCallback(async () => {
    setDeletion((current) => ({ ...current, open: false }));
    // The server already ended every session and cleared the cookie; this
    // tells this tab and the others.
    await signOut().catch(() => {});
    // A shared board open here is no longer reachable; start clean.
    if (new URLSearchParams(window.location.search).has("roomId")) {
      window.location.assign("/");
      return;
    }
    toast({ id: "auth", title: "Your account was deleted", description: "Everything in it is gone, and you're signed out." });
  }, [signOut, toast]);

  const requestReset = useCallback(({ email }) => requestPasswordReset({ email }), []);

  const submitReset = useCallback(({ token, password }) => resetPassword({ token, password }), []);

  const handleResetDone = useCallback(async () => {
    setReset((current) => ({ ...current, open: false }));
    // Every session ended on the server, this browser's too. Say so here
    // rather than wait for the next refresh to find out.
    if (auth.status === AUTH_STATUS.SIGNED_IN) await signOut().catch(() => {});
    toast({
      id: "auth",
      tone: "success",
      title: "Password changed",
      description: "Every device was signed out. Sign in with your new password.",
    });
    openSignIn();
  }, [auth.status, openSignIn, signOut, toast]);

  const requestNewResetLink = useCallback(() => {
    setReset((current) => ({ ...current, open: false }));
    openAuth(AUTH_MODES.FORGOT_PASSWORD);
  }, [openAuth]);

  const closeReset = useCallback(() => setReset((current) => ({ ...current, open: false })), []);

  const resendLink = useCallback(async () => {
    const result = await resendVerification({ accessToken: await getAccessToken() });
    if (result.alreadyVerified) await reloadUser().catch(() => {});
    return result;
  }, [getAccessToken, reloadUser]);

  const dismissBanner = useCallback(() => {
    if (auth.user) dismissVerificationBanner(auth.user);
    setBannerVersion((version) => version + 1);
  }, [auth.user]);

  useEffect(() => {
    if (auth.status === AUTH_STATUS.UNAVAILABLE) return undefined;
    let cancelled = false;
    listProviders().then(
      (list) => {
        if (!cancelled) setProviders(list);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  // Say what came of a provider sign-in, once.
  useEffect(() => {
    if (!providerReturn || providerReturnAnnounced) return;
    providerReturnAnnounced = true;
    toast({ id: "auth", ...providerReturn.message });
  }, [providerReturn, toast]);

  /** Leave for the provider; the browser comes back to `/?oauth=…`. */
  const signInWithProvider = useCallback(async (provider) => {
    window.location.assign(await startProviderSignIn({ provider }));
  }, []);

  /** From settings: connect a provider, or sign in with one again to prove it is you. */
  const goToProvider = useCallback(
    async (provider, intent) => {
      window.location.assign(await connectProvider({ accessToken: await getAccessToken(), provider, intent }));
    },
    [getAccessToken],
  );

  // A verification link needs nothing filled in, so it is used straight away.
  useEffect(() => {
    if (pageLink?.kind !== AUTH_LINK.VERIFY_EMAIL || verificationStarted) return;
    verificationStarted = true;

    if (!pageLink.token) {
      toast({ id: "verify", tone: "danger", title: "That link is incomplete", description: "Open it from the email again." });
      return;
    }
    toast({ id: "verify", tone: "loading", title: "Confirming your email…", duration: Infinity });
    verifyEmail({ token: pageLink.token }).then(
      () => {
        toast({
          id: "verify",
          tone: "success",
          title: "Email confirmed",
          description: "You can now invite people to your boards and join theirs.",
        });
        // Signed in here or not, every tab that is signed in hears of it.
        reloadUser().catch(() => {});
      },
      (error) => {
        const expired = error?.code === "TOKEN_INVALID";
        toast({
          id: "verify",
          tone: "danger",
          title: expired ? "That link has expired or was already used" : "Couldn't confirm your email",
          description: expired ? 'Sign in and choose "Resend link" for a new one.' : (error?.message ?? "Try again."),
        });
      },
    );
  }, [pageLink, reloadUser, toast]);

  const accountItems = useMemo(
    () =>
      buildAccountMenuItems({
        status: auth.status,
        user: auth.user,
        onSignIn: openSignIn,
        onOpenAccount: openAccount,
        onSignOut: handleSignOut,
      }),
    [auth.status, auth.user, handleSignOut, openAccount, openSignIn],
  );

  return {
    auth,
    accountItems,
    openSignIn,
    openSignUp,
    authDialog,
    closeAuthDialog,
    handleAuthSuccess,
    requestReset,
    accountOpen,
    accountKey,
    openAccount,
    closeAccount,
    handleSignOut,
    reset,
    submitReset,
    handleResetDone,
    requestNewResetLink,
    closeReset,
    providers,
    signInWithProvider,
    goToProvider,
    deletion,
    openDeleteAccount,
    closeDeleteAccount,
    handleAccountDeleted,
    showVerificationBanner: shouldShowVerificationBanner(auth.user),
    resendLink,
    dismissBanner,
  };
}
