import { memo, useId, useRef, useState } from "react";
import { Avatar, Button, Dialog } from "../ui/index.js";

const MAX_NAME_LENGTH = 32;

/**
 * JoinRoomDialog — asks for a display name before connecting to a room.
 *
 * Replaces the blocking `window.prompt`. The board stays usable behind it (the
 * connection simply waits), the last name used is suggested and pre-selected,
 * and dismissing it joins as "Guest" rather than leaving the room half-joined.
 * Re-key it per room so the field resets.
 */
function JoinRoomDialog({ open, isRoomOwner, suggestedName = "", color, onSubmit }) {
  const [name, setName] = useState(suggestedName);
  const inputRef = useRef(null);
  const inputId = useId();
  const trimmed = name.trim();

  const joinAsGuest = () => onSubmit("");

  return (
    <Dialog
      open={open}
      onClose={joinAsGuest}
      size="sm"
      initialFocusRef={inputRef}
      title={isRoomOwner ? "What should we call you?" : "Join this board"}
      description="Your name appears next to your cursor and in the people list."
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(trimmed);
        }}
      >
        <div className="flex items-center gap-3">
          <Avatar name={trimmed || "Guest"} color={color} size="lg" />
          <div className="min-w-0 flex-1">
            <label htmlFor={inputId} className="sr-only">
              Display name
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="nickname"
              placeholder="Your name"
              onFocus={(event) => event.target.select()}
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-body text-text placeholder:text-text-soft"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="md" onClick={joinAsGuest}>
            Continue as guest
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={!trimmed}>
            {isRoomOwner ? "Continue" : "Join board"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default memo(JoinRoomDialog);
