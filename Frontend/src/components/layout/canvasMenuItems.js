import {
  ArrowDown,
  ArrowUp,
  BringToFront,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Grid3x3,
  Group,
  Scan,
  Scissors,
  SendToBack,
  SquareDashed,
  Trash2,
  Ungroup,
} from "lucide-react";
import { getShortcutCombo } from "../../features/shortcuts/boardShortcuts.js";

/**
 * The canvas right-click menu, as data.
 *
 * With a selection it offers what can be done to it; on empty canvas, what can
 * be done to the board. Every entry shows the real shortcut, so the menu also
 * teaches the keys.
 */
export function buildCanvasMenuItems({
  hasSelection,
  hasShapes,
  clipboard,
  layerActions,
  groupActions,
  onDelete,
  onSelectAll,
  onFitToScreen,
  gridEnabled,
  onToggleGrid,
}) {
  const paste = {
    id: "paste",
    label: "Paste",
    icon: ClipboardPaste,
    shortcut: getShortcutCombo("paste"),
    onSelect: clipboard.paste,
  };

  if (!hasSelection) {
    return [
      paste,
      {
        id: "select-all",
        label: "Select all",
        icon: SquareDashed,
        shortcut: getShortcutCombo("selectAll"),
        disabled: !hasShapes,
        onSelect: onSelectAll,
      },
      { type: "separator" },
      {
        id: "fit",
        label: "Zoom to fit",
        icon: Scan,
        disabled: !hasShapes,
        onSelect: onFitToScreen,
      },
      {
        id: "grid",
        type: "checkbox",
        label: "Show grid",
        icon: Grid3x3,
        checked: gridEnabled,
        onSelect: onToggleGrid,
      },
    ];
  }

  const canGroup = Boolean(groupActions?.canGroup);
  const canUngroup = Boolean(groupActions?.canUngroup);

  return [
    { id: "cut", label: "Cut", icon: Scissors, shortcut: getShortcutCombo("cut"), onSelect: clipboard.cut },
    { id: "copy", label: "Copy", icon: Copy, shortcut: getShortcutCombo("copy"), onSelect: clipboard.copy },
    paste,
    {
      id: "duplicate",
      label: "Duplicate",
      icon: CopyPlus,
      shortcut: getShortcutCombo("duplicate"),
      onSelect: clipboard.duplicate,
    },
    { type: "separator" },
    {
      id: "front",
      label: "Bring to front",
      icon: BringToFront,
      shortcut: getShortcutCombo("bringToFront"),
      onSelect: layerActions.bringToFront,
    },
    {
      id: "forward",
      label: "Bring forward",
      icon: ArrowUp,
      shortcut: getShortcutCombo("bringForward"),
      onSelect: layerActions.bringForward,
    },
    {
      id: "backward",
      label: "Send backward",
      icon: ArrowDown,
      shortcut: getShortcutCombo("sendBackward"),
      onSelect: layerActions.sendBackward,
    },
    {
      id: "back",
      label: "Send to back",
      icon: SendToBack,
      shortcut: getShortcutCombo("sendToBack"),
      onSelect: layerActions.sendToBack,
    },
    (canGroup || canUngroup) && { type: "separator" },
    canGroup && {
      id: "group",
      label: "Group",
      icon: Group,
      shortcut: getShortcutCombo("group"),
      onSelect: groupActions.group,
    },
    canUngroup && {
      id: "ungroup",
      label: "Ungroup",
      icon: Ungroup,
      shortcut: getShortcutCombo("ungroup"),
      onSelect: groupActions.ungroup,
    },
    { type: "separator" },
    {
      id: "delete",
      label: "Delete",
      icon: Trash2,
      shortcut: getShortcutCombo("delete"),
      danger: true,
      onSelect: onDelete,
    },
  ];
}
