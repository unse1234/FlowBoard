import { MessageSquare, Send } from "lucide-react";
import { Avatar } from "../ui/index.js";

/**
 * ChatPanel — text chat.
 *
 * There is no messaging transport in the app: the realtime layer carries board
 * operations and presence only. The panel is therefore rendered exactly as the
 * design shows it — thread, composer, send button — but every control is
 * disabled and the thread shows a sample-free empty state, so it reads as
 * "not built yet" rather than "broken".
 */
export default function ChatPanel({ collaborators = [] }) {
  const others = collaborators.filter((person) => !person.isLocal);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ── Thread ───────────────────────────────────────────────── */}
      <div className="fb-scroll flex min-h-40 flex-1 flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-surface-soft p-6 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-surface text-text-soft shadow-raised">
          <MessageSquare size={20} />
        </span>
        <div>
          <p className="text-[13px] font-semibold text-text">
            Chat isn&apos;t available yet
          </p>
          <p className="mt-1 max-w-56 text-[11.5px] leading-relaxed text-text-soft">
            {others.length > 0
              ? `${others.length} ${others.length === 1 ? "person is" : "people are"} on this board. Use voice chat to talk to them for now.`
              : "Share the board and use voice chat to talk to collaborators."}
          </p>
        </div>

        {others.length > 0 && (
          <div className="flex -space-x-2">
            {others.slice(0, 5).map((person) => (
              <Avatar
                key={person.userId}
                name={person.username}
                color={person.color}
                seed={person.userId}
                size="xs"
                ring
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Composer — present, deliberately inert ───────────────── */}
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => event.preventDefault()}
      >
        <input
          type="text"
          disabled
          placeholder="Type a message…"
          aria-label="Message (not available yet)"
          title="Chat is not available yet"
          className={[
            "h-9 min-w-0 flex-1 rounded-button border border-border bg-surface-soft px-3",
            "text-[13px] text-text placeholder:text-text-soft",
            "disabled:cursor-not-allowed disabled:opacity-60",
          ].join(" ")}
        />
        <button
          type="submit"
          disabled
          aria-label="Send message (not available yet)"
          title="Chat is not available yet"
          className={[
            "grid h-9 w-9 shrink-0 place-items-center rounded-button",
            "bg-brand text-on-brand disabled:cursor-not-allowed disabled:opacity-45",
          ].join(" ")}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
