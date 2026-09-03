import { AlertCircle, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  EmptyNote,
  IconButton,
  SectionLabel,
  StatusDot,
} from "../ui/index.js";

/**
 * VoiceChatPanel — participants, voice controls and local status.
 *
 * Renders the left column of the desktop design and the body of the mobile
 * "Participants" sheet, so the two stay in step.
 *
 * Two things in the mockup have no implementation and are therefore inert:
 * the per-participant mute control (there is no moderation model — you can
 * only mute yourself) and the Host badge, which is inferred as "the local user
 * in a room they created" rather than being a real role.
 */
export default function VoiceChatPanel({
  collaborators = [],
  voice,
  isRoomOwner = false,
  variant = "desktop",
}) {
  const isDesktop = variant === "desktop";
  const isSignalingConnected = voice?.connectionState === "connected";
  const participantCount = collaborators.length;

  // Voice participants are the subset who actually joined the audio channel.
  const voiceParticipants = voice?.participants ?? [];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ── Connection status ────────────────────────────────────── */}
      <div>
        {isDesktop && <SectionLabel>Voice chat</SectionLabel>}
        <div className={isDesktop ? "mt-1.5 flex items-center gap-2" : "flex items-center gap-2"}>
          <StatusDot tone={isSignalingConnected ? "success" : "muted"} />
          <span className="text-[13px] font-semibold text-text">
            {isSignalingConnected ? "Connected" : "Disconnected"}
          </span>
          <Badge variant={isSignalingConnected ? "success" : "default"}>
            {participantCount} online
          </Badge>
        </div>
      </div>

      {/* ── Participants ─────────────────────────────────────────── */}
      <section>
        {/* On mobile the sheet's own title already names this section. */}
        {isDesktop && (
          <SectionLabel className="mb-2">
            Participants ({participantCount})
          </SectionLabel>
        )}

        <ul className="space-y-1">
          {collaborators.map((person) => {
            const voiceState = voiceParticipants.find(
              (participant) => participant.userId === person.userId,
            );
            const isInVoice = Boolean(voiceState);
            const isSpeaking = person.isLocal
              ? Boolean(voice?.localSpeaking)
              : Boolean(voiceState?.isSpeaking);

            return (
              <li
                key={person.userId}
                className="flex items-center gap-2.5 rounded-card px-1.5 py-1.5 hover:bg-surface-hover"
              >
                <Avatar
                  name={person.username}
                  color={person.color}
                  seed={person.userId}
                  size="sm"
                  className={isSpeaking ? "fb-speaking" : ""}
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-text">
                      {person.isLocal ? "You" : person.username}
                    </span>
                    {person.isLocal && isRoomOwner ? (
                      <Badge variant="info">Host</Badge>
                    ) : null}
                  </span>
                  <span className="text-[11px] text-text-soft">
                    {isInVoice
                      ? isSpeaking
                        ? "Speaking"
                        : "In voice"
                      : "On canvas"}
                  </span>
                </span>

                {person.isLocal ? (
                  <IconButton
                    size="sm"
                    title={voice?.isMuted ? "Unmute yourself" : "Mute yourself"}
                    disabled={!voice?.isJoined}
                    active={voice?.isJoined && !voice?.isMuted}
                    tone="soft"
                    onClick={voice?.onToggleMute}
                  >
                    {voice?.isJoined && !voice?.isMuted ? (
                      <Mic size={14} />
                    ) : (
                      <MicOff size={14} />
                    )}
                  </IconButton>
                ) : (
                  <IconButton
                    size="sm"
                    disabled
                    title="Muting other participants is not available yet"
                  >
                    <MicOff size={14} />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Voice controls ───────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionLabel>Voice controls</SectionLabel>

        {voice?.isJoined ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={voice?.isMuted ? "primary" : "secondary"}
              size="md"
              onClick={voice?.onToggleMute}
            >
              {voice?.isMuted ? <MicOff size={15} /> : <Mic size={15} />}
              {voice?.isMuted ? "Unmute" : "Mute"}
            </Button>
            <Button variant="danger" size="md" onClick={voice?.onLeaveVoice}>
              <PhoneOff size={15} />
              Leave
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={voice?.onJoinVoice}
          >
            <Volume2 size={15} />
            Join Voice Chat
          </Button>
        )}
        {/* Joining requests the microphone and opens signalling on its own, so
            there is no separate "connect" step to expose. */}
      </section>

      {/* ── Local status ─────────────────────────────────────────── */}
      <section>
        <SectionLabel className="mb-2">Local status</SectionLabel>
        <div className="rounded-card border border-border bg-surface-soft p-2.5">
          <div className="flex items-center gap-2">
            <StatusDot
              tone={voice?.localSpeaking ? "success" : "muted"}
              pulse={Boolean(voice?.localSpeaking)}
            />
            <span className="text-[13px] font-medium text-text">You</span>
          </div>
          <p className="mt-0.5 pl-4 text-[11px] text-text-soft">
            {!voice?.isJoined
              ? "Not in voice"
              : voice?.isMuted
                ? "Microphone muted"
                : voice?.localSpeaking
                  ? "Speaking"
                  : "Listening"}
          </p>
        </div>
      </section>

      {/* ── Voice participants ───────────────────────────────────── */}
      <section>
        <SectionLabel className="mb-2">
          Voice participants ({voiceParticipants.length})
        </SectionLabel>

        {voiceParticipants.length === 0 ? (
          <EmptyNote>No voice participants yet.</EmptyNote>
        ) : (
          <ul className="space-y-1">
            {voiceParticipants.map((participant) => (
              <li
                key={participant.userId}
                className="flex items-center gap-2.5 rounded-card border border-border bg-surface-soft px-2.5 py-2"
              >
                <StatusDot
                  tone={participant.isSpeaking ? "success" : "muted"}
                  pulse={participant.isSpeaking}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text">
                  {participant.username}
                  {participant.isLocal ? " (You)" : ""}
                </span>
                <span className="text-[10px] text-text-soft">
                  {participant.connectionState}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Error ────────────────────────────────────────────────── */}
      {voice?.error ? (
        <div className="flex gap-2 rounded-card border border-danger/40 bg-danger-bg p-2.5">
          <AlertCircle size={15} className="mt-px shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-danger">Voice error</p>
            <p className="mt-0.5 break-words text-[11px] text-danger/90">
              {String(voice.error?.message ?? voice.error)}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
