import { useEffect, useRef } from "react";
import { useToast } from "../features/toasts/toastContext.js";

const TOAST_ID = "unshared";

const MESSAGES = {
  "too-large": {
    title: "Too large to share",
    description: "Collaborators won't see your last change. It stays on your board.",
  },
  "partly-too-large": {
    title: "Partly shared",
    description: "Part of your last change was too large to share. Collaborators see the rest.",
  },
  refused: {
    title: "Change not shared",
    description: "The board server refused it. It stays on your board only.",
  },
};

/**
 * Say when a change stays on this board only (finding F-27): too large to
 * send, or refused by the server. Before, such a change was resent on every
 * reconnect and silently held up everything after it.
 *
 * `unshared` comes from useRealtimeCollaboration; a new `id` means a new
 * report. One toast id, so a burst of refusals updates one toast.
 */
export function useUnsharedChangeToasts(unshared) {
  const { toast } = useToast();
  const shownRef = useRef(null);

  useEffect(() => {
    if (!unshared || unshared.id === shownRef.current) return;
    shownRef.current = unshared.id;

    const message = MESSAGES[unshared.reason] ?? MESSAGES.refused;
    toast({ id: TOAST_ID, tone: "warning", duration: 6000, ...message });
  }, [toast, unshared]);
}
