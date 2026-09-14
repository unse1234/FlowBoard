import { memo } from "react";
import {
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  Share2,
  TriangleAlert,
} from "lucide-react";
import {
  describePersonVoice,
  describeVoiceError,
  getLocalVoiceStatus,
  VOICE_STATUS,
} from "../../features/communication/voice/voiceStatus.js";
import { Avatar, Button, cx, Spinner, StatusDot } from "../ui/index.js";

const TONE_TEXT = {
  muted: "text-text-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const ICON = { size: 15, strokeWidth: 1.75 };

/**
 * PeoplePanel — who is on the board, and voice.
 *
 * One list for presence and voice, rather than separate "participants" and
 * "voice participants" sections: each person has a single row whose status
 * line says what they are doing. Speaking is shown by a ring and the word, never
 * the ring alone. Fills the People popover (desktop) and sheet (phone).
 */
function PeoplePanel({ collaborators, voice, isShared, onShare, touch = false }) {
  const participantsById = new Map(
    (voice.participants ?? []).map((participant) => [participant.userId, participant]),
  );

  const status = getLocalVoiceStatus({
    isShared,
    isJoined: voice.isJoined,
    isJoining: voice.isJoining,
    connectionState: voice.connectionState,
    joinFailed: voice.joinFailed,
  });

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="People on this board" className="flex flex-col">
        {collaborators.map((person) => {
          const personVoice = describePersonVoice(
            person,
            participantsById.get(person.userId),
            voice,
          );
          const name =
            person.isLocal && (!person.username || person.username === "You")
              ? "You"
              : person.isLocal
                ? `${person.username} (you)`
                : person.username;

          return (
            <li key={person.userId} className="flex min-h-12 items-center gap-3 py-1">
              <Avatar
                name={person.username}
                color={person.color}
                seed={person.userId}
                size="lg"
                speaking={personVoice.speaking}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-text">{name}</p>
                <p className={cx("truncate text-label font-normal", TONE_TEXT[personVoice.tone])}>
                  {personVoice.label}
                </p>
              </div>
              {personVoice.inVoice ? (
                personVoice.muted ? (
                  <MicOff {...ICON} aria-hidden="true" className="shrink-0 text-text-muted" />
                ) : (
                  <Mic
                    {...ICON}
                    aria-hidden="true"
                    className={cx(
                      "shrink-0",
                      personVoice.speaking ? "text-success" : "text-text-muted",
                    )}
                  />
                )
              ) : null}
            </li>
          );
        })}
      </ul>

      {!isShared ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-body font-medium text-text">Invite people</p>
          <p className="text-label font-normal text-text-muted">
            Share this board to see collaborators&apos; cursors and talk over voice.
          </p>
          <Button size={touch ? "md" : "sm"} onClick={onShare}>
            <Share2 size={14} strokeWidth={1.75} aria-hidden="true" />
            Share board
          </Button>
        </div>
      ) : collaborators.length === 1 ? (
        <p className="text-label font-normal text-text-muted">
          No one else is here yet. Share the link to invite people.
        </p>
      ) : null}

      <VoiceSection status={status} voice={voice} touch={touch} />
    </div>
  );
}

function VoiceSection({ status, voice, touch }) {
  const buttonSize = touch ? "lg" : "md";

  if (status === VOICE_STATUS.UNAVAILABLE) {
    return (
      <section aria-label="Voice chat" className="flex flex-col gap-1 border-t border-divider pt-3">
        <h3 className="text-caption uppercase tracking-[0.06em] text-text-muted">Voice</h3>
        <p className="text-label font-normal text-text-muted">
          Voice chat becomes available once the board is shared.
        </p>
      </section>
    );
  }

  const inCall = status === VOICE_STATUS.CONNECTED || status === VOICE_STATUS.RECONNECTING;
  const failure = status === VOICE_STATUS.ERROR ? describeVoiceError(voice.error) : null;

  return (
    <section aria-label="Voice chat" className="flex flex-col gap-2.5 border-t border-divider pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-caption uppercase tracking-[0.06em] text-text-muted">Voice</h3>
        <VoiceStatusLine status={status} count={voice.participants?.length ?? 0} />
      </div>

      {failure ? (
        <div role="alert" className="flex gap-2 rounded-md bg-danger-soft p-2.5">
          <TriangleAlert {...ICON} aria-hidden="true" className="mt-px shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-label text-danger">{failure.title}</p>
            <p className="text-label font-normal text-text-muted">{failure.description}</p>
          </div>
        </div>
      ) : null}

      {inCall ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size={buttonSize}
            variant={voice.isMuted ? "ink" : "secondary"}
            onClick={voice.onToggleMute}
          >
            {voice.isMuted ? (
              <MicOff {...ICON} aria-hidden="true" />
            ) : (
              <Mic {...ICON} aria-hidden="true" />
            )}
            {voice.isMuted ? "Unmute" : "Mute"}
          </Button>
          <Button size={buttonSize} variant="danger" onClick={voice.onLeaveVoice}>
            <PhoneOff {...ICON} aria-hidden="true" />
            Leave
          </Button>
        </div>
      ) : (
        <Button
          size={buttonSize}
          fullWidth
          loading={status === VOICE_STATUS.JOINING}
          onClick={voice.onJoinVoice}
        >
          {status === VOICE_STATUS.JOINING ? (
            "Connecting…"
          ) : status === VOICE_STATUS.ERROR ? (
            <>
              <RotateCcw {...ICON} aria-hidden="true" />
              Try again
            </>
          ) : (
            <>
              <Headphones {...ICON} aria-hidden="true" />
              Join voice
            </>
          )}
        </Button>
      )}
    </section>
  );
}

function VoiceStatusLine({ status, count }) {
  const content = {
    [VOICE_STATUS.IDLE]: <span>Not joined</span>,
    [VOICE_STATUS.JOINING]: (
      <>
        <Spinner size={12} />
        <span>Connecting…</span>
      </>
    ),
    [VOICE_STATUS.CONNECTED]: (
      <>
        <StatusDot tone="success" />
        <span>
          Connected · {count} in voice
        </span>
      </>
    ),
    [VOICE_STATUS.RECONNECTING]: (
      <>
        <Spinner size={12} className="text-warning" />
        <span>Reconnecting…</span>
      </>
    ),
    [VOICE_STATUS.ERROR]: (
      <>
        <StatusDot tone="danger" />
        <span>Not connected</span>
      </>
    ),
  }[status];

  return (
    <span role="status" className="flex items-center gap-1.5 text-label font-normal text-text-muted">
      {content}
    </span>
  );
}

export default memo(PeoplePanel);
