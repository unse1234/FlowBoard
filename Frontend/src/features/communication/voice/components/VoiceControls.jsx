// @ts-check

import { memo } from "react";
import { useThemeContext } from "../../../theme/ThemeProvider.jsx";

export default function VoiceControls({
  // @ts-ignore
  isJoined,
  // @ts-ignore
  isMuted,
  // @ts-ignore
  connectionState,
  // @ts-ignore
  localSpeaking,
  // @ts-ignore
  participants,
  // @ts-ignore
  error,
  // @ts-ignore
  onRequestMicrophone,
  // @ts-ignore
  onConnect,
  // @ts-ignore
  onJoinVoice,
  // @ts-ignore
  onLeaveVoice,
  // @ts-ignore
  onMute,
  // @ts-ignore
  onUnmute,
}) {
  const { isDark } = useThemeContext();

  const joinedLabel = isJoined ? "Leave voice" : "Join voice";
  const muteLabel = isMuted ? "Unmute" : "Mute";
  const participantCount = participants?.length ?? 0;
  const localParticipant =
    participants?.find(
      (/** @type {{ isLocal: any; }} */ participant) => participant?.isLocal,
    ) ?? null;

  const containerClasses = isDark
    ? "border-slate-700 bg-slate-900 text-white"
    : "border-gray-200 bg-white text-black shadow-sm";
  const headingSubClasses = isDark ? "text-slate-400" : "text-black/70";
  const badgeClasses = isDark
    ? "bg-slate-800 text-white"
    : "bg-white text-black";
  const buttonClasses = isDark
    ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
    : "border-black/10 bg-white text-black hover:bg-slate-50";
  const statusBoxClasses = isDark
    ? "border-slate-700 bg-slate-800 text-white"
    : "border-slate-100 bg-white text-black";
  const statusHeadingClasses = isDark ? "text-slate-100" : "text-black";
  const errorBoxClasses = isDark
    ? "border-red-600 bg-rose-950 text-red-200"
    : "border-red-200 bg-red-50 text-red-700";

  return (
    <div
      className={`voice-controls rounded-lg border p-3 transition ${containerClasses}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Voice chat</p>
          <p className={`text-xs ${headingSubClasses}`}>
            {connectionState === "connected" ? "Connected" : "Disconnected"}
          </p>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClasses}`}>
          {participantCount} participant{participantCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${buttonClasses}`}
          onClick={onRequestMicrophone}
          disabled={!onRequestMicrophone}
        >
          Request mic
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${buttonClasses}`}
          onClick={isJoined ? onLeaveVoice : onJoinVoice}
          disabled={!onJoinVoice || !onLeaveVoice}
        >
          {joinedLabel}
        </button>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${buttonClasses}`}
          onClick={isMuted ? onUnmute : onMute}
          disabled={!isJoined}
        >
          {muteLabel}
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${buttonClasses}`}
          onClick={onConnect}
          disabled={!onConnect || connectionState === "connected"}
        >
          Connect signaling
        </button>
      </div>

      <div className={`rounded-md border p-3 text-sm ${statusBoxClasses}`}>
        <p className={`font-semibold ${statusHeadingClasses}`}>Local status</p>
        <p>{localParticipant?.username ?? "You"}</p>
        <p>{localSpeaking ? "Speaking" : "Silent"}</p>
      </div>

      {error ? (
        <div className={`mt-3 rounded-md border p-3 text-sm ${errorBoxClasses}`}>
          <p className="font-semibold">Voice error</p>
          <p>{String(error?.message ?? error)}</p>
        </div>
      ) : null}
    </div>
  );
}

export const MemoizedVoiceControls = memo(VoiceControls);