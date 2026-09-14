import { useEffect, useRef } from "react";
import { CONNECTION_STATE } from "../features/realtime/manager/ConnectionState.js";
import { useToast } from "../features/toasts/toastContext.js";

const TOAST_ID = "connection";

/**
 * Tell people when the live connection drops and when it recovers — and
 * nothing in between.
 *
 * The first connect after sharing is already confirmed by the share toast, so
 * nothing shows until a connection fails. Every message reuses one toast id,
 * so a flapping connection updates a single toast instead of stacking them.
 * The realtime manager queues operations while offline and sends them on
 * rejoin, which is what makes "your edits will sync" true.
 */
export function useConnectionToasts(status) {
  const { toast, dismiss } = useToast();
  const previousRef = useRef(status);
  const wasLiveRef = useRef(false);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = status;
    if (previous === status) return;

    if (status === CONNECTION_STATE.CONNECTED) {
      if (wasLiveRef.current) {
        toast({
          id: TOAST_ID,
          tone: "success",
          title: "Back online",
          description: "Your changes are syncing again.",
          duration: 2500,
        });
      } else {
        dismiss(TOAST_ID);
      }
      wasLiveRef.current = true;
      return;
    }

    if (status === CONNECTION_STATE.IDLE || status === CONNECTION_STATE.DISCONNECTED) {
      dismiss(TOAST_ID);
      return;
    }

    if (status === CONNECTION_STATE.ERROR && !wasLiveRef.current) {
      toast({
        id: TOAST_ID,
        tone: "danger",
        title: "Can't reach the live board",
        description: "Your board still works here. Retrying automatically…",
        duration: Infinity,
      });
      return;
    }

    if (wasLiveRef.current) {
      toast({
        id: TOAST_ID,
        tone: "warning",
        title: "Connection lost",
        description: "Reconnecting… Your edits will sync when you're back.",
        duration: Infinity,
      });
    }
  }, [dismiss, status, toast]);
}
