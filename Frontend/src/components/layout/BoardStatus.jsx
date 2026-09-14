import { memo } from "react";
import { Check } from "lucide-react";
import { CONNECTION_STATE } from "../../features/realtime/manager/ConnectionState.js";
import { cx, Spinner, StatusDot, Tooltip } from "../ui/index.js";

const STATUS = {
  [CONNECTION_STATE.IDLE]: {
    label: "Saved locally",
    tooltip: "Changes are saved in this browser. Share the board to collaborate.",
  },
  [CONNECTION_STATE.CONNECTING]: {
    label: "Connecting…",
    busy: true,
    tooltip: "Joining the live board",
  },
  [CONNECTION_STATE.CONNECTED]: {
    label: "Live",
    tone: "success",
    tooltip: "Changes sync to everyone on this board",
  },
  [CONNECTION_STATE.RECONNECTING]: {
    label: "Reconnecting…",
    busy: true,
    tone: "warning",
    tooltip: "Connection lost — trying to reconnect",
  },
  [CONNECTION_STATE.DISCONNECTED]: {
    label: "Offline",
    tone: "muted",
    tooltip: "Not connected to the live board",
  },
  [CONNECTION_STATE.ERROR]: {
    label: "Connection issue",
    tone: "danger",
    tooltip: "Couldn't reach the collaboration server",
  },
};

/**
 * BoardStatus — where this board lives and whether it is in sync.
 *
 * Status is always spelled out; the dot or spinner only reinforces it. The
 * participant count appears once the board is live with other people on it.
 */
function BoardStatus({ status, participantCount = 1, compact = false, className = "" }) {
  const meta = STATUS[status] ?? STATUS[CONNECTION_STATE.IDLE];
  const isLocal = status === CONNECTION_STATE.IDLE || !STATUS[status];
  const showCount =
    !compact && status === CONNECTION_STATE.CONNECTED && participantCount > 1;

  return (
    <Tooltip label={compact ? null : meta.tooltip} placement="bottom">
      <span
        role="status"
        className={cx(
          "flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-2 text-label text-text-muted",
          className,
        )}
      >
        {meta.busy ? (
          <Spinner size={12} className={meta.tone === "warning" ? "text-warning" : undefined} />
        ) : isLocal ? (
          <Check size={14} strokeWidth={2} aria-hidden="true" className="text-text-soft" />
        ) : (
          <StatusDot tone={meta.tone} />
        )}
        <span>{meta.label}</span>
        {showCount ? (
          <span className="tabular-nums text-text-soft">· {participantCount} here</span>
        ) : null}
      </span>
    </Tooltip>
  );
}

export default memo(BoardStatus);
