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
});

module.exports = {
  SOCKET_EVENTS,
};
