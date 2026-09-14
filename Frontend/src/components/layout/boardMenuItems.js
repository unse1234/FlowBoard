import { Download, Grid3x3, Keyboard, Map as MapIcon, Moon, Trash2 } from "lucide-react";

/**
 * The board's main menu, as data.
 *
 * One definition feeds both the desktop dropdown (`Menu`) and the phone sheet
 * (`ActionList`), so the two can never offer different actions.
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
}) {
  return [
    {
      id: "export",
      label: "Export as PNG",
      icon: Download,
      disabled: !hasShapes,
      onSelect: onExport,
    },
    { type: "separator" },
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
    onShowShortcuts && { type: "separator" },
    onShowShortcuts && {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      icon: Keyboard,
      shortcut: "?",
      onSelect: onShowShortcuts,
    },
    { type: "separator" },
    {
      id: "clear",
      label: "Clear canvas",
      icon: Trash2,
      danger: true,
      disabled: !hasShapes,
      onSelect: onClearBoard,
    },
  ];
}
