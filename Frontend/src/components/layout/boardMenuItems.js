import {
  ClipboardPaste,
  Download,
  Grid3x3,
  Keyboard,
  Map as MapIcon,
  Moon,
  RotateCcw,
  Scan,
  SquareDashed,
  Trash2,
} from "lucide-react";

/** Join non-empty sections with a single separator between each. */
function withSeparators(sections) {
  return sections
    .map((section) => section.filter(Boolean))
    .filter((section) => section.length > 0)
    .flatMap((section, index) => (index === 0 ? section : [{ type: "separator" }, ...section]));
}

/**
 * The board's main menu, as data.
 *
 * One definition feeds both the desktop dropdown (`Menu`) and the phone sheet
 * (`ActionList`), so the two can never offer different actions.
 *
 * `touchActions` adds what a touch device cannot reach otherwise: Select all
 * and Paste (there is no keyboard and no right-click), and — on phones, which
 * have no view island — Zoom to fit and Reset view.
 */
export function buildBoardMenuItems({
  hasShapes,
  gridEnabled,
  isDark,
  minimapVisible,
  showMinimapToggle,
  onExport,
  onToggleGrid,
  onToggleTheme,
  onToggleMinimap,
  onShowShortcuts,
  onClearBoard,
  touchActions,
}) {
  return withSeparators([
    [
      {
        id: "export",
        label: "Export as PNG",
        icon: Download,
        disabled: !hasShapes,
        onSelect: onExport,
      },
    ],
    [
      touchActions && {
        id: "select-all",
        label: "Select all",
        icon: SquareDashed,
        disabled: !hasShapes,
        onSelect: touchActions.onSelectAll,
      },
      touchActions && {
        id: "paste",
        label: "Paste",
        icon: ClipboardPaste,
        onSelect: touchActions.onPaste,
      },
    ],
    [
      touchActions?.onFitToScreen && {
        id: "fit",
        label: "Zoom to fit",
        icon: Scan,
        disabled: !hasShapes,
        onSelect: touchActions.onFitToScreen,
      },
      touchActions?.onResetView && {
        id: "reset-view",
        label: "Reset view",
        icon: RotateCcw,
        onSelect: touchActions.onResetView,
      },
    ],
    [
      {
        id: "grid",
        type: "checkbox",
        label: "Show grid",
        icon: Grid3x3,
        checked: gridEnabled,
        onSelect: onToggleGrid,
      },
      showMinimapToggle && {
        id: "minimap",
        type: "checkbox",
        label: "Show minimap",
        icon: MapIcon,
        checked: minimapVisible,
        onSelect: onToggleMinimap,
      },
      {
        id: "theme",
        type: "checkbox",
        label: "Dark mode",
        icon: Moon,
        checked: isDark,
        onSelect: onToggleTheme,
      },
    ],
    [
      onShowShortcuts && {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        icon: Keyboard,
        shortcut: "?",
        onSelect: onShowShortcuts,
      },
    ],
    [
      {
        id: "clear",
        label: "Clear canvas",
        icon: Trash2,
        danger: true,
        disabled: !hasShapes,
        onSelect: onClearBoard,
      },
    ],
  ]);
}
