import { memo } from "react";
import { Headphones, Mic, MicOff, PhoneOff, TriangleAlert } from "lucide-react";
import {
  getLocalVoiceStatus,
  VOICE_STATUS,
} from "../../features/communication/voice/voiceStatus.js";
import { cx, IconButton, Spinner } from "../ui/index.js";

const ICON = { size: 17, strokeWidth: 1.75 };

/**
 * VoiceButton — voice at a glance in the header.
 *
 * Absent on an unshared board (People explains why), a join button when idle,
 * a spinner while connecting, and once in a call a microphone toggle plus
 * Leave. Speaking adds a ring; muted turns the toggle red; a dropped call adds
 * a small reconnecting badge. A failed join shows a warning that opens People,
 * where the reason and Try again live.
 */
function VoiceButton({ voice, isShared, onOpenPeople, size = "lg" }) {
  const status = getLocalVoiceStatus({
    isShared,
    isJoined: voice.isJoined,
    isJoining: voice.isJoining,
    connectionState: voice.connectionState,
    joinFailed: voice.joinFailed,
  });

  if (status === VOICE_STATUS.UNAVAILABLE) return null;

  if (status === VOICE_STATUS.IDLE) {
    return (
      <IconButton label="Join voice" size={size} onClick={voice.onJoinVoice}>
        <Headphones {...ICON} />
      </IconButton>
    );
  }

  if (status === VOICE_STATUS.JOINING) {
    return (
      <IconButton label="Connecting to voice" size={size} disabled aria-busy="true">
        <Spinner size={16} />
      </IconButton>
    );
  }

  if (status === VOICE_STATUS.ERROR) {
    return (
      <IconButton
        label="Voice couldn't connect. Show details"
        size={size}
        active
        tone="danger"
        onClick={onOpenPeople}
      >
        <TriangleAlert {...ICON} />
      </IconButton>
    );
  }

  const speaking = voice.localSpeaking && !voice.isMuted;
  const reconnecting = status === VOICE_STATUS.RECONNECTING;

  return (
    <span className="flex items-center gap-0.5">
      <IconButton
        label={voice.isMuted ? "Unmute microphone" : "Mute microphone"}
        tooltip={reconnecting ? "Reconnecting voice…" : undefined}
        size={size}
        active
        tone={voice.isMuted ? "danger" : "soft"}
        className={cx(speaking && "ring-2 ring-success ring-offset-1 ring-offset-surface")}
        onClick={voice.onToggleMute}
      >
        {voice.isMuted ? <MicOff {...ICON} /> : <Mic {...ICON} />}
        {reconnecting ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full bg-surface"
          >
            <Spinner size={10} className="text-warning" />
          </span>
        ) : null}
      </IconButton>

      <IconButton
        label="Leave voice"
        size={size}
        className="hover:bg-danger-soft! hover:text-danger!"
        onClick={voice.onLeaveVoice}
      >
        <PhoneOff {...ICON} />
      </IconButton>
    </span>
  );
}

export default memo(VoiceButton);
