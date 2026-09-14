// @ts-check

import { TOOLS } from "../../constants/tools.js";
import { TOOL_LABELS, TOOL_SHORTCUTS } from "../../constants/toolMeta.js";
import { BOARD_SHORTCUTS, SHOW_SHORTCUTS_COMBO } from "./boardShortcuts.js";

/**
 * The shortcuts dialog's content, derived from the binding tables.
 *
 * Rows name the actions they document rather than repeating key strings, so a
 * rebinding in boardShortcuts.js shows up here automatically. Gestures that are
 * not registry bindings (space-to-pan, ctrl-scroll zoom) are spelled out.
 *
 * @typedef {{ label: string, combos: string[], separator?: "or" | "none", note?: string, actions?: string[] }} ShortcutRow
 * @typedef {{ title: string, rows: ShortcutRow[] }} ShortcutSection
 */

/** @param {string[]} actions */
function combosFor(actions) {
  return actions.flatMap((action) =>
    BOARD_SHORTCUTS.filter((binding) => binding.action === action).map(
      (binding) => binding.combo,
    ),
  );
}

/** Tools in the order the dock presents them. */
const TOOL_ORDER = [
  TOOLS.SELECT,
  TOOLS.PAN,
  TOOLS.RECT,
  TOOLS.CIRCLE,
  TOOLS.DIAMOND,
  TOOLS.LINE,
  TOOLS.ARROW,
  TOOLS.PEN,
  TOOLS.LASER,
  TOOLS.ERASER,
  TOOLS.TEXT,
  TOOLS.NOTE,
];

/** @type {Array<{ title: string, rows: Array<Omit<ShortcutRow, "combos"> & { combos?: string[] }> }>} */
const SECTIONS = [
  {
    title: "Tools",
    rows: TOOL_ORDER.map((tool) => ({
      label: TOOL_LABELS[tool],
      combos: [TOOL_SHORTCUTS[tool]],
    })),
  },
  {
    title: "Edit",
    rows: [
      { label: "Undo", actions: ["undo"] },
      { label: "Redo", actions: ["redo"] },
      { label: "Copy", actions: ["copy"] },
      { label: "Cut", actions: ["cut"] },
      { label: "Paste", actions: ["paste"] },
      { label: "Duplicate", actions: ["duplicate"] },
      { label: "Delete selection", actions: ["delete"] },
      { label: "Select all", actions: ["selectAll"] },
      { label: "Clear selection", actions: ["clearSelection"] },
    ],
  },
  {
    title: "Arrange",
    rows: [
      { label: "Group", actions: ["group"] },
      { label: "Ungroup", actions: ["ungroup"] },
      { label: "Bring forward", actions: ["bringForward"] },
      { label: "Send backward", actions: ["sendBackward"] },
      { label: "Bring to front", actions: ["bringToFront"] },
      { label: "Send to back", actions: ["sendToBack"] },
    ],
  },
  {
    title: "Move and view",
    rows: [
      {
        label: "Nudge selection",
        actions: ["nudgeLeft", "nudgeUp", "nudgeDown", "nudgeRight"],
        separator: "none",
      },
      {
        // Documents the four shift-arrow bindings without four keycap pairs.
        label: "Nudge by 10",
        actions: ["nudgeLeftLarge", "nudgeUpLarge", "nudgeDownLarge", "nudgeRightLarge"],
        combos: ["shift"],
        note: "+ arrow keys",
      },
      {
        label: "Undo / redo, nothing selected",
        combos: ["ArrowLeft", "ArrowRight"],
      },
      { label: "Pan", combos: ["Space"], note: "hold and drag" },
      { label: "Zoom", combos: ["mod"], note: "+ scroll" },
    ],
  },
  {
    title: "General",
    rows: [{ label: "Keyboard shortcuts", combos: [SHOW_SHORTCUTS_COMBO] }],
  },
];

/** @type {ReadonlyArray<ShortcutSection>} */
export const SHORTCUT_SECTIONS = Object.freeze(
  SECTIONS.map((section) => ({
    title: section.title,
    rows: section.rows.map((row) => ({
      ...row,
      combos: row.combos ?? combosFor(row.actions ?? []),
    })),
  })),
);
