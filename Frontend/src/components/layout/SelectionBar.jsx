import { memo, useCallback, useRef, useState } from "react";
import { CopyPlus, Ellipsis, Trash2 } from "lucide-react";
import { IconButton, Island, Menu } from "../ui/index.js";

const ICON = { size: 20, strokeWidth: 1.75 };

/**
 * SelectionBar — what a keyboard and right-click give on desktop, as visible
 * buttons on touch.
 *
 * Duplicate and Delete are one tap; More opens the same action list as the
 * desktop context menu (clipboard, layer order, grouping). Shown while
 * something is selected on phones and touch tablets.
 */
function SelectionBar({ count, menuItems, onDuplicate, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreButtonRef = useRef(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <Island
      role="toolbar"
      aria-label={`Selection actions, ${count} selected`}
      className="fb-rise flex items-center gap-0.5 rounded-xl p-0.5"
    >
      <IconButton label="Duplicate" size="xl" tooltip={false} onClick={onDuplicate}>
        <CopyPlus {...ICON} />
      </IconButton>
      <IconButton label="Delete" size="xl" tooltip={false} className="text-danger" onClick={onDelete}>
        <Trash2 {...ICON} />
      </IconButton>
      <IconButton
        ref={moreButtonRef}
        label="More actions"
        size="xl"
        tooltip={false}
        tone="soft"
        active={menuOpen}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Ellipsis {...ICON} />
      </IconButton>

      <Menu
        open={menuOpen}
        onClose={closeMenu}
        anchorRef={moreButtonRef}
        placement="top-start"
        label="Selection actions"
        items={menuItems}
      />
    </Island>
  );
}

export default memo(SelectionBar);
