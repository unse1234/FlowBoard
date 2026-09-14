import { memo, useCallback, useRef, useState } from "react";
import { Ellipsis, Share2 } from "lucide-react";
import PeoplePanel from "../panels/PeoplePanel.jsx";
import {
  AvatarStack,
  Button,
  cx,
  Divider,
  IconButton,
  Island,
  Menu,
  Popover,
} from "../ui/index.js";
import BoardStatus from "./BoardStatus.jsx";
import BrandMark from "./BrandMark.jsx";

/**
 * WorkspaceHeader — the two top islands on tablet and desktop.
 *
 * Left: identity and sync state — what this board is and whether it is live.
 * Right: everything about other people — who is here (opens People, which
 * holds voice), Share as the one primary action, and the main menu.
 *
 * Two islands rather than a full-width bar, so the canvas runs to the top edge
 * between them.
 */
function WorkspaceHeader({ status, collaborators, voice, isShared, menuItems, onShare }) {
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const peopleButtonRef = useRef(null);
  const menuButtonRef = useRef(null);

  const closePeople = useCallback(() => setPeopleOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const count = collaborators.length;

  return (
    <>
      <Island as="header" className="fixed left-3 top-3 z-40 flex h-11 items-center pl-2 pr-1">
        <BrandMark />
        <Divider vertical className="mx-2" />
        <BoardStatus status={status} participantCount={count} />
      </Island>

      <Island
        role="toolbar"
        aria-label="Collaboration"
        className="fixed right-3 top-3 z-40 flex h-11 items-center gap-1 px-1"
      >
        <button
          ref={peopleButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={peopleOpen}
          aria-label={`People on this board, ${count}`}
          onClick={() => setPeopleOpen((open) => !open)}
          className={cx(
            "flex h-9 items-center rounded-md px-1.5 transition-colors duration-150 hover:bg-hover",
            peopleOpen && "bg-pressed",
          )}
        >
          <AvatarStack users={collaborators} max={3} />
        </button>

        <Divider vertical className="mx-0.5" />

        <Button variant="primary" size="sm" className="h-9 px-3.5" onClick={onShare}>
          <Share2 size={15} strokeWidth={2} aria-hidden="true" />
          Share
        </Button>

        <IconButton
          ref={menuButtonRef}
          label="Main menu"
          size="lg"
          tone="soft"
          active={menuOpen}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Ellipsis size={18} strokeWidth={1.75} />
        </IconButton>
      </Island>

      <Popover
        open={peopleOpen}
        onClose={closePeople}
        anchorRef={peopleButtonRef}
        placement="bottom-end"
        label="People"
        className="fb-scroll max-h-[min(70dvh,560px)] w-80 overflow-y-auto p-3"
      >
        <h2 className="mb-1 text-title text-text">
          People <span className="font-normal tabular-nums text-text-muted">· {count}</span>
        </h2>
        <PeoplePanel
          collaborators={collaborators}
          voice={voice}
          isShared={isShared}
          onShare={() => {
            closePeople();
            onShare();
          }}
        />
      </Popover>

      <Menu
        open={menuOpen}
        onClose={closeMenu}
        anchorRef={menuButtonRef}
        placement="bottom-end"
        label="Main menu"
        items={menuItems}
      />
    </>
  );
}

export default memo(WorkspaceHeader);
