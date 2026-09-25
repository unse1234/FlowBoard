import { useCallback, useEffect, useState } from "react";
import {
  createInvite,
  deleteBoard,
  getBoard,
  listInvites,
  removeMember,
  renameBoard,
  revokeInvite,
  setMemberRole,
} from "./boardsClient.js";

/**
 * A shared board's people and invitations, and the owner's actions on them
 * (spec Phase C), for the share panel.
 *
 * Every read and action asks `getAccessToken` for a current token. After an
 * action the board is read again, so the panel always shows what the server
 * holds rather than what it hoped would happen.
 *
 * @param {{ boardId: string | null, getAccessToken: () => Promise<string | null>, enabled: boolean }} options
 */
export function useBoardSharing({ boardId, getAccessToken, enabled }) {
  const [readKey, setReadKey] = useState(0);
  // Tagged with what it answers, so a slow old answer never replaces a newer one.
  const [state, setState] = useState({ key: null, board: null, invites: [], error: null });
  const key = enabled && boardId ? `${boardId}:${readKey}` : null;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const accessToken = await getAccessToken();
        const board = await getBoard({ accessToken, boardId });
        // Invitations are the owner's to see.
        const invites = board.role === "owner" ? await listInvites({ accessToken, boardId }) : [];
        if (!cancelled) setState({ key, board, invites, error: null });
      } catch (error) {
        if (!cancelled) setState({ key, board: null, invites: [], error });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boardId, getAccessToken, key]);

  const reread = useCallback(() => setReadKey((current) => current + 1), []);

  /** Run an action with a current token, then read the board again. */
  const act = useCallback(
    async (run) => {
      try {
        return await run(await getAccessToken());
      } finally {
        reread();
      }
    },
    [getAccessToken, reread],
  );

  const current = state.key === key ? state : null;

  return {
    loading: Boolean(key) && !current,
    board: current?.board ?? null,
    invites: current?.invites ?? [],
    error: current?.error ?? null,
    reread,

    /** @returns {Promise<{ link: string }>} */
    invite: (role) => act((accessToken) => createInvite({ accessToken, boardId, role })),
    withdrawInvite: (inviteId) => act((accessToken) => revokeInvite({ accessToken, boardId, inviteId })),
    setRole: (userId, role) => act((accessToken) => setMemberRole({ accessToken, boardId, userId, role })),
    remove: (userId) => act((accessToken) => removeMember({ accessToken, boardId, userId })),
    rename: (title) => act((accessToken) => renameBoard({ accessToken, boardId, title })),
    // Not followed by a re-read: the board is gone, or this account is off it.
    leave: async (userId) => removeMember({ accessToken: await getAccessToken(), boardId, userId }),
    destroy: async () => deleteBoard({ accessToken: await getAccessToken(), boardId }),
  };
}
