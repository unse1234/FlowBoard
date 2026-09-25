/**
 * Makes account and board changes take effect on connected sockets at once
 * (Phase D). Without this, a socket authenticated before a sign-out, a
 * password reset or a removal from a board would keep working until it
 * happened to reconnect.
 *
 * | Event                  | Effect                                                     |
 * | ---------------------- | ---------------------------------------------------------- |
 * | sessions-ended         | those sessions' sockets are told and disconnected          |
 * | account-deleted        | every socket of the account is told and disconnected       |
 * | board-access-changed   | every socket on the board, and in its voice room, is       |
 * |                        | re-checked against the database; one that lost access is   |
 * |                        | removed and told, a changed role is updated and told       |
 * | account-changed        | the new display name is used for presence from now on      |
 *
 * Events come from `auth/accountEvents.js`, in this process. The realtime
 * layer is single-instance today; see that module for what several would need.
 *
 * @returns {() => void} unsubscribe
 */
function connectRealtimeRevocation({ accountEvents, boardGateway, voiceGateway, logger = console }) {
  return accountEvents.subscribe((event) => {
    let task;
    if (event?.type === "sessions-ended") task = boardGateway.endSessions(event.userId, event.sessionIds ?? []);
    else if (event?.type === "account-deleted") task = boardGateway.endAccount(event.userId);
    else if (event?.type === "board-access-changed") {
      task = Promise.all([boardGateway.revokeBoardAccess(event.boardId), voiceGateway.revokeVoiceAccess(event.boardId)]);
    } else if (event?.type === "account-changed") {
      task = boardGateway.refreshAccount(event.userId, { displayName: event.displayName });
    } else return;

    task.catch((error) => {
      logger.error?.("[realtime] Could not apply an access change to live sockets.", {
        type: event.type,
        message: error?.message,
      });
    });
  });
}

module.exports = {
  connectRealtimeRevocation,
};
