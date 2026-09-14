import { memo } from "react";
import { CopyPlus, PanelRightClose, Trash2 } from "lucide-react";
import { getShortcutCombo } from "../../features/shortcuts/boardShortcuts.js";
import { IconButton, Island } from "../ui/index.js";
import InspectorPanel from "./InspectorPanel.jsx";

/**
 * SelectionActions — the two things done to a selection most often.
 * Shared by the desktop inspector header and the phone style sheet.
 */
export function SelectionActions({ onDuplicate, onDelete, touch = false }) {
  const size = touch ? "xl" : "md";
  const icon = { size: touch ? 18 : 16, strokeWidth: 1.75 };

  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        label="Duplicate"
        shortcut={getShortcutCombo("duplicate")}
        tooltip={touch ? false : undefined}
        size={size}
        onClick={onDuplicate}
      >
        <CopyPlus {...icon} />
      </IconButton>
      <IconButton
        label="Delete"
        shortcut={getShortcutCombo("delete")}
        tooltip={touch ? false : undefined}
        size={size}
        className="hover:bg-danger-soft! hover:text-danger!"
        onClick={onDelete}
      >
        <Trash2 {...icon} />
      </IconButton>
    </div>
  );
}

/**
 * Inspector — the floating contextual panel on tablet and desktop.
 *
 * Titled by what it edits ("Rectangle", "3 selected", or a tool's defaults),
 * with selection actions in its header and the style controls below.
 */
function Inspector({
  model,
  shapeStyle,
  onStyleChange,
  layerActions,
  groupActions,
  alignmentActions,
  onDuplicate,
  onDelete,
  onHide,
  style,
}) {
  return (
    <Island
      as="aside"
      aria-label="Inspector"
      className="fb-rise fixed right-3 z-40 flex w-64 flex-col overflow-hidden"
      style={style}
    >
      <header className="flex min-h-12 shrink-0 items-center gap-1 border-b border-divider py-1.5 pl-3 pr-1.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title text-text">{model.title}</h2>
          {model.subtitle ? (
            <p className="truncate text-caption text-text-muted">{model.subtitle}</p>
          ) : null}
        </div>

        {model.mode === "selection" ? (
          <SelectionActions onDuplicate={onDuplicate} onDelete={onDelete} />
        ) : null}

        <IconButton label="Hide inspector" tooltipPlacement="left" onClick={onHide}>
          <PanelRightClose size={16} strokeWidth={1.75} />
        </IconButton>
      </header>

      <div className="fb-scroll min-h-0 overflow-y-auto p-3">
        <InspectorPanel
          model={model}
          shapeStyle={shapeStyle}
          onStyleChange={onStyleChange}
          layerActions={layerActions}
          groupActions={groupActions}
          alignmentActions={alignmentActions}
        />
      </div>
    </Island>
  );
}

export default memo(Inspector);
