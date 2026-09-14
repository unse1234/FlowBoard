import { Fragment, memo, useCallback, useRef, useState } from "react";
import { Ellipsis, ImagePlus, Lock, LockOpen, X } from "lucide-react";
import { TOOL_LABELS, TOOL_SHORTCUTS } from "../constants/toolMeta.js";
import { TOOLS } from "../constants/tools.js";
import {
  DOCK_LAYOUTS,
  FILE_TOOLS,
  SHAPE_TOOLS,
  TOOL_ICONS,
} from "./toolbar/toolCatalog.js";
import { cx, Divider, IconButton, Island, Popover } from "./ui/index.js";

const ICON_STROKE = 1.75;
/** The active tool's icon thickens — a state cue that does not rely on colour. */
const ACTIVE_STROKE = 2.25;

const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/**
 * On phones narrower than 380px, 44px targets no longer fit six tools plus the
 * style button inside the side gutters; 40px still clears touch guidance.
 */
const NARROW_TOUCH_BUTTON = "max-[23.75rem]:size-10";
const NARROW_TOUCH_DIVIDER = "max-[23.75rem]:mx-0.5";

/**
 * Arrow-key focus movement for a row of buttons (the ARIA toolbar pattern).
 * Propagation stops so the board's own arrow shortcuts (nudge, undo) do not
 * also fire.
 */
function moveFocusWithArrows(event) {
  if (!NAVIGATION_KEYS.has(event.key)) return;

  const items = Array.from(
    event.currentTarget.querySelectorAll("[data-dock-item]:not([disabled])"),
  );
  const index = items.indexOf(document.activeElement);
  if (index === -1) return;

  event.preventDefault();
  event.stopPropagation();

  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;

  items[next].focus();
}

/**
 * Toolbar — the floating tool dock.
 *
 * Sits bottom-centre on every layout, so a tool is always in the same place
 * relative to the thumb or the pointer. `variant` picks how much is visible
 * (see DOCK_LAYOUTS); `touch` switches to 44px targets and labelled flyouts.
 *
 * A shape flyout's trigger shows the last shape used: one press brings that
 * shape back and opens the flyout beside it, so repeating a shape is one tap
 * and switching is two.
 *
 * @param {'full'|'compact'|'touch'} variant
 */
function Toolbar({
  tool,
  setTool,
  toolLocked,
  setToolLocked,
  pendingImageAsset,
  onImageFileSelected,
  onCancelImage,
  variant = "full",
  touch = false,
  className = "",
}) {
  const fileInputRef = useRef(null);
  const [openFlyout, setOpenFlyout] = useState(null);
  const [lastShapeTool, setLastShapeTool] = useState(TOOLS.RECT);

  // Remember a shape however it was chosen — flyout, keyboard or dock.
  if (SHAPE_TOOLS.includes(tool) && tool !== lastShapeTool) {
    setLastShapeTool(tool);
  }

  const layout =
    DOCK_LAYOUTS[variant === "compact" && touch ? "compactTouch" : variant] ?? DOCK_LAYOUTS.full;
  const size = touch ? "xl" : "lg";
  const iconSize = touch ? 20 : 18;

  const closeFlyout = useCallback(() => setOpenFlyout(null), []);

  const selectTool = useCallback(
    (id) => {
      if (FILE_TOOLS.has(id)) {
        fileInputRef.current?.click();
        return;
      }
      setTool(id);
    },
    [setTool],
  );

  const toggleLock = useCallback(() => setToolLocked((locked) => !locked), [setToolLocked]);

  const renderEntry = (entry) => {
    if (entry === "lock") {
      return (
        <LockButton
          key="lock"
          locked={toolLocked}
          size={size}
          iconSize={iconSize}
          onToggle={toggleLock}
        />
      );
    }

    if (typeof entry === "object") {
      return (
        <ToolFlyout
          key={entry.flyout}
          entry={entry}
          tool={tool}
          lastShapeTool={lastShapeTool}
          open={openFlyout === entry.flyout}
          onOpenChange={(open) => setOpenFlyout(open ? entry.flyout : null)}
          onClose={closeFlyout}
          onSelect={selectTool}
          toolLocked={toolLocked}
          onToggleLock={toggleLock}
          size={size}
          iconSize={iconSize}
          touch={touch}
        />
      );
    }

    return (
      <ToolButton
        key={entry}
        id={entry}
        active={tool === entry}
        size={size}
        iconSize={iconSize}
        onSelect={selectTool}
      />
    );
  };

  return (
    <Island
      role="toolbar"
      aria-label="Tools"
      aria-orientation="horizontal"
      onKeyDown={moveFocusWithArrows}
      className={cx(
        "relative flex items-center gap-0.5",
        touch ? "rounded-xl p-0.5" : "p-1",
        className,
      )}
    >
      {layout.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          {groupIndex > 0 ? (
            <Divider vertical className={cx("mx-1", touch && NARROW_TOUCH_DIVIDER)} />
          ) : null}
          {group.map(renderEntry)}
        </Fragment>
      ))}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onChange={(event) => {
          const [file] = event.target.files ?? [];
          if (file) onImageFileSelected(file);
          event.target.value = "";
        }}
      />

      {pendingImageAsset ? <PlacementHint touch={touch} onCancel={onCancelImage} /> : null}
    </Island>
  );
}

function ToolButton({ id, active, size, iconSize, onSelect }) {
  const Icon = TOOL_ICONS[id];

  return (
    <IconButton
      data-dock-item
      label={TOOL_LABELS[id]}
      shortcut={TOOL_SHORTCUTS[id]}
      size={size}
      active={active}
      pressed={active}
      className={size === "xl" ? NARROW_TOUCH_BUTTON : undefined}
      onClick={() => onSelect(id)}
    >
      <Icon size={iconSize} strokeWidth={active ? ACTIVE_STROKE : ICON_STROKE} />
    </IconButton>
  );
}

function LockButton({ locked, size, iconSize, onToggle }) {
  const Icon = locked ? Lock : LockOpen;

  return (
    <IconButton
      data-dock-item
      label="Keep tool active"
      tooltip={locked ? "Tool stays active after drawing" : "Return to Select after drawing"}
      size={size}
      tone="soft"
      active={locked}
      pressed={locked}
      className={size === "xl" ? NARROW_TOUCH_BUTTON : undefined}
      onClick={onToggle}
    >
      <Icon size={iconSize} strokeWidth={ICON_STROKE} />
    </IconButton>
  );
}

function ToolFlyout({
  entry,
  tool,
  lastShapeTool,
  open,
  onOpenChange,
  onClose,
  onSelect,
  toolLocked,
  onToggleLock,
  size,
  iconSize,
  touch,
}) {
  const triggerRef = useRef(null);
  const isShapes = entry.flyout === "shapes";
  const containsActive = entry.tools.includes(tool);

  // Shapes always show a shape; More shows its active tool, or an ellipsis.
  const shownTool = isShapes ? (containsActive ? tool : lastShapeTool) : containsActive ? tool : null;
  const Icon = shownTool ? TOOL_ICONS[shownTool] : Ellipsis;
  const label = shownTool ? `${TOOL_LABELS[shownTool]}, ${entry.label.toLowerCase()}` : entry.label;

  const handleTrigger = () => {
    if (isShapes && tool !== shownTool) {
      onSelect(shownTool);
      onOpenChange(true);
      return;
    }
    onOpenChange(!open);
  };

  const pick = (id) => {
    onSelect(id);
    onClose();
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        data-dock-item
        label={label}
        shortcut={shownTool ? TOOL_SHORTCUTS[shownTool] : undefined}
        size={size}
        active={containsActive}
        pressed={containsActive}
        aria-expanded={open}
        className={size === "xl" ? NARROW_TOUCH_BUTTON : undefined}
        onClick={handleTrigger}
      >
        <Icon size={iconSize} strokeWidth={containsActive ? ACTIVE_STROKE : ICON_STROKE} />
        {/* Corner mark: this button holds more than one tool. */}
        <svg
          aria-hidden="true"
          width="5"
          height="5"
          viewBox="0 0 5 5"
          className="absolute bottom-1 right-1 opacity-60"
        >
          <path d="M5 0V5H0Z" fill="currentColor" />
        </svg>
      </IconButton>

      <Popover
        open={open}
        onClose={onClose}
        anchorRef={triggerRef}
        placement="top-center"
        offset={10}
        role="group"
        label={entry.label}
        className={touch ? "p-1.5" : "p-1"}
      >
        {touch ? (
          <div className="grid grid-cols-3 gap-1">
            {entry.tools.map((id) => (
              <FlyoutTile
                key={id}
                icon={TOOL_ICONS[id]}
                label={TOOL_LABELS[id]}
                active={tool === id}
                onClick={() => pick(id)}
              />
            ))}
            {entry.lock ? (
              <FlyoutTile
                icon={toolLocked ? Lock : LockOpen}
                label="Keep tool"
                active={toolLocked}
                onClick={onToggleLock}
              />
            ) : null}
          </div>
        ) : (
          <div
            role="toolbar"
            aria-label={entry.label}
            onKeyDown={moveFocusWithArrows}
            className="flex items-center gap-0.5"
          >
            {entry.tools.map((id) => (
              <ToolButton
                key={id}
                id={id}
                active={tool === id}
                size="lg"
                iconSize={18}
                onSelect={pick}
              />
            ))}
            {entry.lock ? (
              <>
                <Divider vertical className="mx-1" />
                <LockButton locked={toolLocked} size="lg" iconSize={18} onToggle={onToggleLock} />
              </>
            ) : null}
          </div>
        )}
      </Popover>
    </>
  );
}

function FlyoutTile({ icon, label, active, onClick }) {
  const Icon = icon;

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "flex h-16 w-21 flex-col items-center justify-center gap-1 rounded-lg px-1",
        "text-center text-caption leading-tight transition-colors duration-100",
        active ? "bg-ink text-on-ink" : "text-text hover:bg-hover active:bg-pressed",
      )}
    >
      <Icon size={20} strokeWidth={active ? ACTIVE_STROKE : ICON_STROKE} aria-hidden="true" />
      {label}
    </button>
  );
}

function PlacementHint({ touch, onCancel }) {
  return (
    <div
      role="status"
      className={cx(
        "fb-rise absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-2",
        "whitespace-nowrap rounded-lg border border-border bg-surface-raised py-1 pl-3 pr-1",
        "text-label text-text shadow-popover",
      )}
    >
      <ImagePlus size={14} strokeWidth={ICON_STROKE} aria-hidden="true" className="text-text-muted" />
      {touch ? "Tap the canvas to place your image" : "Click the canvas to place your image"}
      <IconButton label="Cancel image" tooltip={false} size="sm" onClick={onCancel}>
        <X size={14} strokeWidth={ICON_STROKE} />
      </IconButton>
    </div>
  );
}

export default memo(Toolbar);
