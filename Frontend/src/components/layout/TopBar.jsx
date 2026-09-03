import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Mic,
  MicOff,
  MoreHorizontal,
  Moon,
  Settings,
  Share2,
  Sun,
  Wifi,
  WifiOff,
} from "lucide-react";
import { CONNECTION_STATE } from "../../features/realtime/manager/ConnectionState.js";
import { AvatarStack, Badge, Button, IconButton } from "../ui/index.js";
import { SoonBadge } from "../ui/ComingSoon.jsx";
import BrandMark from "./BrandMark.jsx";

const CONNECTION_LABELS = {
  [CONNECTION_STATE.IDLE]: "Not shared",
  [CONNECTION_STATE.CONNECTING]: "Connecting…",
  [CONNECTION_STATE.CONNECTED]: "Live",
  [CONNECTION_STATE.RECONNECTING]: "Reconnecting…",
  [CONNECTION_STATE.DISCONNECTED]: "Offline",
  [CONNECTION_STATE.ERROR]: "Connection issue",
};

const CONNECTION_TONES = {
  [CONNECTION_STATE.CONNECTED]: "success",
  [CONNECTION_STATE.CONNECTING]: "info",
  [CONNECTION_STATE.RECONNECTING]: "warning",
  [CONNECTION_STATE.ERROR]: "danger",
  [CONNECTION_STATE.DISCONNECTED]: "default",
  [CONNECTION_STATE.IDLE]: "default",
};

/**
 * TopBar — application header.
 *
 * Board naming and the workspace switcher are in the design but have no
 * backing model yet, so the title control renders as an inert chip with a
 * "Soon" marker instead of being dropped from the layout.
 */
export default function TopBar({
  collaborators = [],
  collaboration,
  voice,
  theme,
  onToggleTheme,
  onOpenSettings,
}) {
  const status = collaboration?.status ?? CONNECTION_STATE.IDLE;
  const isShared = Boolean(collaboration?.isEnabled);
  const connectionLabel = CONNECTION_LABELS[status] ?? CONNECTION_LABELS.idle;
  const connectionTone = CONNECTION_TONES[status] ?? "default";
  const isDark = theme === "dark";

  const micActive = voice?.isJoined && !voice?.isMuted;
  const micTitle = !voice?.isJoined
    ? "Join voice chat to use your microphone"
    : voice?.isMuted
      ? "Unmute microphone"
      : "Mute microphone";

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50 h-14",
        "flex items-center gap-2 border-b border-border bg-surface px-3 lg:px-4",
      ].join(" ")}
    >
      <BrandMark className="shrink-0" />

      {/* Board title — no board-naming model exists yet, so this is inert. */}
      <button
        type="button"
        disabled
        title="Board naming is not available yet"
        className={[
          "ml-1 hidden items-center gap-1.5 rounded-button px-2.5 py-1.5 sm:flex",
          "text-[13px] font-medium text-text-muted",
          "cursor-not-allowed border border-transparent",
        ].join(" ")}
      >
        <span className="max-w-40 truncate">Untitled board</span>
        <SoonBadge />
        <ChevronDown size={14} />
      </button>

      <div className="flex-1" />

      {/* ── Presence ─────────────────────────────────────────────── */}
      <AvatarStack users={collaborators} max={3} className="mr-0.5" />

      {/* ── Share ────────────────────────────────────────────────── */}
      <Button
        variant="primary"
        size="sm"
        onClick={
          isShared
            ? collaboration?.copyCollaborationLink
            : collaboration?.startCollaboration
        }
        title={
          isShared
            ? "Copy the collaboration link"
            : "Create a collaboration link for this board"
        }
        className="shrink-0"
      >
        {collaboration?.linkCopied ? (
          <Check size={14} />
        ) : isShared ? (
          <Copy size={14} />
        ) : (
          <Share2 size={14} />
        )}
        <span className="hidden sm:inline">
          {collaboration?.linkCopied ? "Copied" : isShared ? "Copy link" : "Share"}
        </span>
      </Button>

      {/* ── Desktop-only controls ────────────────────────────────── */}
      <div className="hidden items-center gap-1 lg:flex">
        <IconButton
          title={micTitle}
          tone="brand"
          active={micActive}
          disabled={!voice?.isJoined}
          onClick={voice?.onToggleMute}
        >
          {micActive ? <Mic size={16} /> : <MicOff size={16} />}
        </IconButton>

        <IconButton
          title={`Switch to ${isDark ? "light" : "dark"} mode`}
          onClick={onToggleTheme}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>

        <IconButton title="Board settings" onClick={onOpenSettings}>
          <Settings size={16} />
        </IconButton>

        <ConnectionChip
          status={status}
          tone={connectionTone}
          label={connectionLabel}
          roomId={collaboration?.roomId}
        />
      </div>

      {/* ── Mobile overflow ──────────────────────────────────────── */}
      <MobileMenu
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        onOpenSettings={onOpenSettings}
        connectionLabel={connectionLabel}
        connectionTone={connectionTone}
        voice={voice}
        micTitle={micTitle}
        micActive={micActive}
      />
    </header>
  );
}

/** Live connection indicator; the room id is shown once a room exists. */
function ConnectionChip({ status, tone, label, roomId }) {
  const isOnline =
    status === CONNECTION_STATE.CONNECTED ||
    status === CONNECTION_STATE.CONNECTING;

  return (
    <span
      title={roomId ? `Room ${roomId}` : "This board is local to this browser"}
      className="ml-1 flex items-center gap-1.5 rounded-button border border-border bg-surface-soft px-2 py-1.5"
    >
      {isOnline ? (
        <Wifi size={14} className="text-success" />
      ) : (
        <WifiOff size={14} className="text-text-soft" />
      )}
      <Badge variant={tone}>{label}</Badge>
    </span>
  );
}

/** Compact "…" menu holding the controls the mobile header has no room for. */
function MobileMenu({
  isDark,
  onToggleTheme,
  onOpenSettings,
  connectionLabel,
  connectionTone,
  voice,
  micTitle,
  micActive,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative lg:hidden">
      <IconButton
        title="More"
        active={open}
        tone="soft"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} />
      </IconButton>

      {open && (
        <div
          className={[
            "fb-animate-pop absolute right-0 top-full mt-2 w-56 overflow-hidden",
            "rounded-panel border border-border bg-surface p-1.5 shadow-popover",
          ].join(" ")}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] font-medium text-text-muted">
              Connection
            </span>
            <Badge variant={connectionTone}>{connectionLabel}</Badge>
          </div>

          <div className="my-1 h-px bg-border" />

          <MenuItem
            icon={micActive ? Mic : MicOff}
            label={micActive ? "Mute microphone" : "Unmute microphone"}
            disabled={!voice?.isJoined}
            hint={voice?.isJoined ? undefined : "Join voice first"}
            title={micTitle}
            onClick={() => {
              voice?.onToggleMute?.();
              setOpen(false);
            }}
          />
          <MenuItem
            icon={isDark ? Sun : Moon}
            label={isDark ? "Light mode" : "Dark mode"}
            onClick={() => {
              onToggleTheme?.();
              setOpen(false);
            }}
          />
          <MenuItem
            icon={Settings}
            label="Board settings"
            onClick={() => {
              onOpenSettings?.();
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, hint, disabled, title, onClick }) {
  const Icon = icon;

  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? label}
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2.5 rounded-button px-2 py-2 text-left",
        "text-[13px] font-medium transition-colors duration-150",
        disabled
          ? "cursor-not-allowed text-text-soft"
          : "text-text hover:bg-surface-hover",
      ].join(" ")}
    >
      <Icon size={15} className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {hint ? (
        <span className="text-[10px] text-text-soft">{hint}</span>
      ) : null}
    </button>
  );
}
