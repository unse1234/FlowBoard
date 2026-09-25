const SOCKET_EVENTS = Object.freeze({
  BOARD_JOIN: "board:join",
  BOARD_LEAVE: "board:leave",
  BOARD_EVENT: "board:event",
  PRESENCE_UPDATE: "presence:update",
  VOICE_JOIN: "voice:join",
  VOICE_LEAVE: "voice:leave",
  VOICE_OFFER: "voice:offer",
  VOICE_ANSWER: "voice:answer",
  VOICE_ICE: "voice:ice",
  // Server to client, authenticated gateways only (Phase D).
  SESSION_ENDED: "session:ended",
  BOARD_ACCESS_REVOKED: "board:access-revoked",
  BOARD_ROLE_CHANGED: "board:role-changed",
});

module.exports = {
  SOCKET_EVENTS,
};
