// @ts-check

/**
 * Voice state, in words people understand.
 *
 * Pure so every state the UI can show is covered by tests rather than found by
 * reproducing a flaky network.
 */

export const VOICE_STATUS = Object.freeze({
  /** The board is not shared, so there is no room to talk in. */
  UNAVAILABLE: "unavailable",
  IDLE: "idle",
  JOINING: "joining",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  ERROR: "error",
});

/**
 * @param {{ isShared: boolean, isJoined: boolean, isJoining: boolean, connectionState: string, joinFailed: boolean }} voice
 * @returns {string}
 */
export function getLocalVoiceStatus({ isShared, isJoined, isJoining, connectionState, joinFailed }) {
  if (!isShared) return VOICE_STATUS.UNAVAILABLE;
  if (isJoining) return VOICE_STATUS.JOINING;
  if (isJoined) {
    return connectionState === "connected" ? VOICE_STATUS.CONNECTED : VOICE_STATUS.RECONNECTING;
  }
  if (joinFailed) return VOICE_STATUS.ERROR;

  return VOICE_STATUS.IDLE;
}

/**
 * A voice failure as a headline and something the person can do about it.
 *
 * @param {unknown} error
 * @returns {{ title: string, description: string }}
 */
export function describeVoiceError(error) {
  const failure = /** @type {{ name?: string, message?: string } | null | undefined} */ (error);
  const name = failure?.name;

  if (name === "MediaPermissionDeniedError" || name === "NotAllowedError") {
    return {
      title: "Microphone blocked",
      description: "Allow microphone access for this site in your browser, then try again.",
    };
  }

  if (name === "MediaDeviceUnavailableError" || name === "NotFoundError") {
    return {
      title: "No microphone found",
      description: "Connect a microphone, or check that another app isn't using it.",
    };
  }

  const message = String(failure?.message ?? error ?? "");

  if (/does not support/i.test(message)) {
    return {
      title: "Voice isn't supported here",
      description: "Try a recent version of Chrome, Edge, Firefox or Safari.",
    };
  }

  return {
    title: "Couldn't connect to voice",
    description: "Check your connection and try again.",
  };
}

/**
 * @typedef {Object} PersonVoice
 * @property {string} label
 * @property {"muted" | "success" | "warning" | "danger"} tone
 * @property {boolean} inVoice
 * @property {boolean} speaking
 * @property {boolean} muted
 */

/** @param {Partial<PersonVoice>} state @returns {PersonVoice} */
const state = (partial) => ({
  label: "On the board",
  tone: "muted",
  inVoice: false,
  speaking: false,
  muted: false,
  ...partial,
});

/**
 * One person's voice status line.
 *
 * @param {{ isLocal?: boolean }} person
 * @param {{ isSpeaking?: boolean, connectionState?: string } | undefined} participant - their voice entry, if any
 * @param {{ isJoined?: boolean, isMuted?: boolean, localSpeaking?: boolean }} local
 * @returns {PersonVoice}
 */
export function describePersonVoice(person, participant, local) {
  if (person.isLocal) {
    if (!local.isJoined) return state({});
    if (local.isMuted) return state({ label: "Muted", inVoice: true, muted: true });
    if (local.localSpeaking) {
      return state({ label: "Speaking", tone: "success", inVoice: true, speaking: true });
    }
    return state({ label: "In voice", inVoice: true });
  }

  if (!participant) return state({});

  switch (participant.connectionState) {
    case "new":
    case "connecting":
      return state({ label: "Connecting audio…", inVoice: true });
    case "disconnected":
      return state({ label: "Reconnecting audio…", tone: "warning", inVoice: true });
    case "failed":
      return state({ label: "Audio unavailable", tone: "danger", inVoice: true });
    case "closed":
      return state({});
    default:
      return participant.isSpeaking
        ? state({ label: "Speaking", tone: "success", inVoice: true, speaking: true })
        : state({ label: "In voice", inVoice: true });
  }
}
