import { memo, useCallback, useRef, useState } from "react";
import { Ellipsis, Share2 } from "lucide-react";
import SharePanel from "../collab/SharePanel.jsx";
import VoiceButton from "../collab/VoiceButton.jsx";
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

const PANELS = Object.freeze({ PEOPLE: "people", SHARE: "share", MENU: "menu" });

/**
 * WorkspaceHeader — the two top islands on tablet and desktop.
 *
 * Left: identity and sync state — what this board is and whether it is live.
 * Right: everything about other people — who is here (opens People), voice
 * once the board is shared, Share as the one primary action, and the main
 * menu. One panel is open at a time, so People can hand off to Share.
 *
 * Two islands rather than a full-width bar, so the canvas runs to the top edge
 * between them.
 */
function WorkspaceHeader({
  status,
  collaborators,
  voice,
  isShared,
  link,
  linkCopied,
  menuItems,
  onCreateLink,
  onCopyLink,
}) {
  const [openPanel, setOpenPanel] = useState(null);
  const peopleButtonRef = useRef(null);
  const shareButtonRef = useRef(null);
  const menuButtonRef = useRef(null);

  const closePanel = useCallback(() => setOpenPanel(null), []);
  const openPeople = useCallback(() => setOpenPanel(PANELS.PEOPLE), []);
  const openShare = useCallback(() => setOpenPanel(PANELS.SHARE), []);
  const togglePanel = (panel) => setOpenPanel((current) => (current === panel ? null : panel));

  // Creating a room asks for a display name next, in a dialog; close first so
  // the two never stack.
  const createLink = useCallback(async () => {
    setOpenPanel(null);
    await onCreateLink();
  }, [onCreateLink]);

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
          aria-expanded={openPanel === PANELS.PEOPLE}
          aria-label={`People on this board, ${count}`}
          onClick={() => togglePanel(PANELS.PEOPLE)}
          className={cx(
            "flex h-9 items-center rounded-md px-1.5 transition-colors duration-150 hover:bg-hover",
            openPanel === PANELS.PEOPLE && "bg-pressed",
          )}
        >
          <AvatarStack users={collaborators} max={3} />
        </button>

        <VoiceButton voice={voice} isShared={isShared} onOpenPeople={openPeople} />

        <Divider vertical className="mx-0.5" />

        <Button
          ref={shareButtonRef}
          variant="primary"
          size="sm"
          className="h-9 px-3.5"
          aria-haspopup="dialog"
          aria-expanded={openPanel === PANELS.SHARE}
          onClick={() => togglePanel(PANELS.SHARE)}
        >
          <Share2 size={15} strokeWidth={2} aria-hidden="true" />
          Share
        </Button>

        <IconButton
          ref={menuButtonRef}
          label="Main menu"
          size="lg"
          tone="soft"
          active={openPanel === PANELS.MENU}
          aria-haspopup="menu"
          aria-expanded={openPanel === PANELS.MENU}
          onClick={() => togglePanel(PANELS.MENU)}
        >
          <Ellipsis size={18} strokeWidth={1.75} />
        </IconButton>
      </Island>

      <Popover
        open={openPanel === PANELS.PEOPLE}
        onClose={closePanel}
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
          onShare={openShare}
        />
      </Popover>

      <Popover
        open={openPanel === PANELS.SHARE}
        onClose={closePanel}
        anchorRef={shareButtonRef}
        placement="bottom-end"
        label="Share this board"
        className="w-88 p-4"
      >
        <SharePanel
          isShared={isShared}
          link={link}
          linkCopied={linkCopied}
          status={status}
          collaborators={collaborators}
          onCreateLink={createLink}
          onCopyLink={onCopyLink}
        />
      </Popover>

      <Menu
        open={openPanel === PANELS.MENU}
        onClose={closePanel}
        anchorRef={menuButtonRef}
        placement="bottom-end"
        label="Main menu"
        items={menuItems}
      />
    </>
  );
}

export default memo(WorkspaceHeader);
