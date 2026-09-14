import { memo } from "react";
import { Menu as MenuIcon, Redo2, Share2, Undo2 } from "lucide-react";
import { AvatarStack, Divider, IconButton, Island } from "../ui/index.js";
import BoardStatus from "./BoardStatus.jsx";

const ICON = { size: 20, strokeWidth: 1.75 };

/**
 * MobileTopBar — the phone header, as two compact islands.
 *
 * Left: the board menu, then sync state and presence as one target that opens
 * People. Right: undo and redo — frequent enough to earn a permanent place —
 * and Share. Every target is 44px; hover tooltips are off, since there is no
 * hover to trigger them.
 *
 * Islands use the 14px radius around 12px buttons with 2px padding, keeping
 * the corners concentric.
 */
function MobileTopBar({
  status,
  collaborators,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenMenu,
  onOpenPeople,
  onOpenShare,
}) {
  return (
    <div className="pointer-events-none fixed inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] z-40 flex items-start justify-between gap-2">
      <Island className="pointer-events-auto flex min-w-0 items-center gap-0.5 rounded-xl p-0.5">
        <IconButton label="Board menu" size="xl" tooltip={false} onClick={onOpenMenu}>
          <MenuIcon {...ICON} />
        </IconButton>

        <button
          type="button"
          onClick={onOpenPeople}
          aria-label={`People on this board, ${collaborators.length}`}
          className="flex h-11 min-w-0 items-center gap-1 rounded-lg pr-2 transition-colors duration-100 active:bg-pressed"
        >
          <BoardStatus status={status} compact className="min-w-0 px-1.5" />
          <AvatarStack users={collaborators} max={2} size="sm" />
        </button>
      </Island>

      <Island className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-xl p-0.5">
        <IconButton label="Undo" size="xl" tooltip={false} disabled={!canUndo} onClick={onUndo}>
          <Undo2 {...ICON} />
        </IconButton>
        <IconButton label="Redo" size="xl" tooltip={false} disabled={!canRedo} onClick={onRedo}>
          <Redo2 {...ICON} />
        </IconButton>
        <Divider vertical className="mx-0.5" />
        <IconButton
          label="Share"
          size="xl"
          tooltip={false}
          active
          tone="primary"
          aria-haspopup="dialog"
          onClick={onOpenShare}
        >
          <Share2 size={18} strokeWidth={2} />
        </IconButton>
      </Island>
    </div>
  );
}

export default memo(MobileTopBar);
