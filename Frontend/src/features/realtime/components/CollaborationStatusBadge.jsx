import { Copy, Link2, Users } from "lucide-react";
import { CONNECTION_STATE } from "../manager/ConnectionState.js";

const STATUS_LABELS = {
  [CONNECTION_STATE.IDLE]: "Realtime idle",
  [CONNECTION_STATE.CONNECTING]: "Connecting",
  [CONNECTION_STATE.CONNECTED]: "Live",
  [CONNECTION_STATE.RECONNECTING]: "Reconnecting",
  [CONNECTION_STATE.DISCONNECTED]: "Offline",
  [CONNECTION_STATE.ERROR]: "Connection issue",
};

const STATUS_CLASSES = {
  [CONNECTION_STATE.CONNECTED]:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-200",
  [CONNECTION_STATE.ERROR]:
    "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500 dark:bg-rose-950 dark:text-rose-200",
  [CONNECTION_STATE.DISCONNECTED]:
    "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300",
  [CONNECTION_STATE.RECONNECTING]:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-200",
  [CONNECTION_STATE.CONNECTING]:
    "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950 dark:text-sky-200",
  [CONNECTION_STATE.IDLE]:
    "border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300",
};

export default function CollaborationStatusBadge({
  status,
  boardId,
  roomId,
  isEnabled,
  linkCopied,
  onStartCollaboration,
  onCopyLink,
}) {
  if (!isEnabled) {
    return (
      <button
        type="button"
        onClick={onStartCollaboration}
        className="fixed right-4 top-4 z-20 flex h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
        title="Create a collaboration link"
      >
        <Users size={16} />
        Start collaboration
      </button>
    );
  }

  return (
    <div
      className={`fixed right-4 top-4 z-20 flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${
        STATUS_CLASSES[status] ?? STATUS_CLASSES[CONNECTION_STATE.IDLE]
      }`}
    >
      <Link2 size={15} />
      <span>
        {STATUS_LABELS[status] ?? STATUS_LABELS[CONNECTION_STATE.IDLE]}
      </span>
      <span className="max-w-32 truncate opacity-70">{roomId ?? boardId}</span>
      <button
        type="button"
        onClick={onCopyLink}
        className="ml-1 grid h-6 w-6 place-items-center rounded bg-white/70 text-gray-700 transition hover:bg-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        title="Copy collaboration link"
        aria-label="Copy collaboration link"
      >
        <Copy size={14} />
      </button>
      {linkCopied && <span className="text-emerald-700">Copied</span>}
    </div>
  );
}
