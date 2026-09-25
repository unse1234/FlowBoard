import { useCallback, useEffect, useState } from "react";
import { AUTH_LINK, readAuthLink } from "../auth/authLinks.js";
import { AUTH_STATUS } from "../auth/authSession.js";
import { acceptInvite, previewInvite } from "./boardsClient.js";

let linkRead = false;
let linkToken;

/**
 * The invitation this page was opened with (`/invite/<token>`), read once per
 * page load. The address bar is cleared at the same moment, so the token is
 * not left in history or on a shared screen. Undefined when the page was not
 * opened from an invitation; null when it was, but the link arrived damaged.
 */
function consumeInviteLink() {
  if (linkRead) return linkToken;
  linkRead = true;

  const link = readAuthLink(window.location);
  if (link?.kind !== AUTH_LINK.INVITE) return undefined;

  window.history.replaceState(window.history.state, "", "/");
  linkToken = link.token;
  return linkToken;
}

/**
 * Accepting a board invitation (spec Phase C).
 *
 * Possessing the link is never enough on its own: the server wants a
 * signed-in account with a confirmed address. So this waits for sign-in,
 * shows what the invitation is for, and joins only when asked. Joining opens
 * the board, as a fresh page on its own address.
 *
 * @param {{ status: string, user: Object | null, getAccessToken: () => Promise<string | null> }} auth
 */
export function useInviteLink(auth) {
  const [token] = useState(consumeInviteLink);
  const [dismissed, setDismissed] = useState(false);
  // Tagged with the account it was read for, so signing in as someone else reads it again.
  const [preview, setPreview] = useState({ for: null, invite: null, error: null });
  const [accepting, setAccepting] = useState({ pending: false, error: null });
  const signedInAs = auth.status === AUTH_STATUS.SIGNED_IN ? auth.user?.id : null;
  const { getAccessToken } = auth;

  useEffect(() => {
    if (!token || !signedInAs || dismissed) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const invite = await previewInvite({ token, accessToken: await getAccessToken() });
        if (!cancelled) setPreview({ for: signedInAs, invite, error: null });
      } catch (error) {
        if (!cancelled) setPreview({ for: signedInAs, invite: null, error });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dismissed, getAccessToken, signedInAs, token]);

  const accept = useCallback(async () => {
    setAccepting({ pending: true, error: null });
    try {
      const { board } = await acceptInvite({ token, accessToken: await getAccessToken() });
      window.location.assign(`/?roomId=${encodeURIComponent(board.id)}`);
    } catch (error) {
      setAccepting({ pending: false, error });
    }
  }, [getAccessToken, token]);

  const open = useCallback((boardId) => window.location.assign(`/?roomId=${encodeURIComponent(boardId)}`), []);
  const current = preview.for === signedInAs ? preview : { invite: null, error: null };

  return {
    /** Whether this page came from an invitation that has not been dismissed. */
    active: token !== undefined && !dismissed,
    damaged: token === null,
    loading: Boolean(token && signedInAs) && !current.invite && !current.error,
    invite: current.invite,
    error: current.error ?? accepting.error,
    accepting: accepting.pending,
    accept,
    open,
    dismiss: () => setDismissed(true),
  };
}
