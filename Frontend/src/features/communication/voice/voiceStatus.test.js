import assert from "node:assert/strict";
import test from "node:test";
import {
  describePersonVoice,
  describeVoiceError,
  getLocalVoiceStatus,
  VOICE_STATUS,
} from "./voiceStatus.js";

const base = {
  isShared: true,
  isJoined: false,
  isJoining: false,
  connectionState: "disconnected",
  joinFailed: false,
};

test("voice is unavailable until the board is shared", () => {
  assert.equal(getLocalVoiceStatus({ ...base, isShared: false }), VOICE_STATUS.UNAVAILABLE);
});

test("walks idle, joining, connected and reconnecting", () => {
  assert.equal(getLocalVoiceStatus(base), VOICE_STATUS.IDLE);
  assert.equal(getLocalVoiceStatus({ ...base, isJoining: true }), VOICE_STATUS.JOINING);
  assert.equal(
    getLocalVoiceStatus({ ...base, isJoined: true, connectionState: "connected" }),
    VOICE_STATUS.CONNECTED,
  );
  assert.equal(
    getLocalVoiceStatus({ ...base, isJoined: true, connectionState: "disconnected" }),
    VOICE_STATUS.RECONNECTING,
  );
});

test("a failed join is an error until the next attempt", () => {
  assert.equal(getLocalVoiceStatus({ ...base, joinFailed: true }), VOICE_STATUS.ERROR);
  assert.equal(
    getLocalVoiceStatus({ ...base, joinFailed: true, isJoining: true }),
    VOICE_STATUS.JOINING,
  );
});

test("explains microphone failures in actionable terms", () => {
  assert.equal(describeVoiceError({ name: "MediaPermissionDeniedError" }).title, "Microphone blocked");
  assert.equal(describeVoiceError({ name: "MediaDeviceUnavailableError" }).title, "No microphone found");
  assert.equal(
    describeVoiceError(new Error("Browser does not support microphone access.")).title,
    "Voice isn't supported here",
  );
  assert.equal(describeVoiceError(new Error("socket timeout")).title, "Couldn't connect to voice");
});

test("describes the local person from their own voice state", () => {
  assert.equal(describePersonVoice({ isLocal: true }, undefined, { isJoined: false }).label, "On the board");
  assert.equal(
    describePersonVoice({ isLocal: true }, undefined, { isJoined: true, isMuted: true }).label,
    "Muted",
  );

  const speaking = describePersonVoice({ isLocal: true }, undefined, {
    isJoined: true,
    isMuted: false,
    localSpeaking: true,
  });
  assert.equal(speaking.label, "Speaking");
  assert.equal(speaking.speaking, true);
});

test("describes remote people from their peer connection", () => {
  const remote = { isLocal: false };
  const local = { isJoined: true };

  assert.equal(describePersonVoice(remote, undefined, local).inVoice, false);
  assert.equal(describePersonVoice(remote, { connectionState: "connecting" }, local).label, "Connecting audio…");
  assert.equal(describePersonVoice(remote, { connectionState: "disconnected" }, local).tone, "warning");
  assert.equal(describePersonVoice(remote, { connectionState: "failed" }, local).tone, "danger");
  assert.equal(
    describePersonVoice(remote, { connectionState: "connected", isSpeaking: true }, local).label,
    "Speaking",
  );
});
