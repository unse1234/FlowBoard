import { useMemo } from "react";
import { AUTH_STATUS } from "../auth/authSession.js";
import { createBoard } from "./boardsClient.js";

/**
 * The signed-in account, as the realtime layer and sharing need it
 * (Phases C and D). Null where the server has no accounts, which keeps the
 * anonymous rooms of before.
 *
 * - `ready` is false while a returning visitor's session is being restored,
 *   so nothing connects as nobody and then reconnects as someone.
 * - `user` is null when signed out: a board link then asks for sign-in.
 * - `createBoard` makes the server-side board that sharing starts from.
 *
 * @param {{ status: string, user: Object | null, getAccessToken: Function, revalidate: Function }} auth
 */
export function useCollaborationAccount(auth) {
  const { status, user, getAccessToken, revalidate } = auth;

  return useMemo(() => {
    if (status === AUTH_STATUS.UNAVAILABLE) return null;

    return {
      ready: status !== AUTH_STATUS.RESTORING,
      user: status === AUTH_STATUS.SIGNED_IN ? user : null,
      getAccessToken,
      revalidate,
      createBoard: async () => createBoard({ accessToken: await getAccessToken() }),
    };
  }, [getAccessToken, revalidate, status, user]);
}
