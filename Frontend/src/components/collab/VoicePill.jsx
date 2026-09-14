import { memo } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { cx, IconButton, Island, Spinner } from "../ui/index.js";

const ICON = { size: 20, strokeWidth: 1.75 };

/**
 * VoicePill — the in-call control on phones.
 *
 * Floats above the dock only while connecting or in a call, within thumb
 * reach: mute, a status that opens People, and leave. Rendered by the shell
 * only when there is a call to control.
 */
function VoicePill({ voice, onOpenPeople }) {
  const speaking = voice.localSpeaking && !voice.isMuted;
  const reconnecting = voice.isJoined && voice.connectionState !== "connected";

  return (
    <Island role="group" aria-label="Voice chat" className="fb-rise flex items-center gap-0.5 rounded-xl p-0.5">
      {voice.isJoining ? (
        <span role="status" className="flex h-11 items-center gap-2 px-3 text-label text-text-muted">
          <Spinner size={14} />
          Connecting…
        </span>
      ) : (
        <>
          <IconButton
            label={voice.isMuted ? "Unmute microphone" : "Mute microphone"}
            size="xl"
            tooltip={false}
            active
            tone={voice.isMuted ? "danger" : "soft"}
            className={cx(speaking && "ring-2 ring-success ring-offset-1 ring-offset-surface")}
            onClick={voice.onToggleMute}
          >
            {voice.isMuted ? <MicOff {...ICON} /> : <Mic {...ICON} />}
          </IconButton>

          <button
            type="button"
            onClick={onOpenPeople}
            className={cx(
              "flex h-11 items-center gap-1.5 rounded-lg px-2 text-label transition-colors active:bg-pressed",
              reconnecting ? "text-warning" : "text-text-muted",
            )}
          >
            {reconnecting ? <Spinner size={12} /> : null}
            {reconnecting
              ? "Reconnecting…"
              : `${voice.participants?.length || 1} in voice`}
          </button>

          <IconButton
            label="Leave voice"
            size="xl"
            tooltip={false}
            className="text-danger"
            onClick={voice.onLeaveVoice}
          >
            <PhoneOff {...ICON} />
          </IconButton>
        </>
      )}
    </Island>
  );
}

export default memo(VoicePill);
