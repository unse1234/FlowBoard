import {
  Home,
  Layers,
  Maximize2,
  PanelLeft,
  PanelRight,
  Settings,
  Shapes,
  Users,
} from "lucide-react";
import { IconButton } from "../ui/index.js";

/**
 * LeftRail — the persistent desktop icon rail.
 *
 * It is the control surface for the four desktop presentations in the design:
 * both panels open, left collapsed, right collapsed, and minimal (neither).
 *
 * Board home, layers and the shape library are drawn from the design but have
 * no implementation, so they render disabled rather than being omitted — the
 * rail keeps the height and rhythm the mockup shows.
 */
export default function LeftRail({
  leftPanelOpen,
  rightPanelOpen,
  isMinimal,
  onToggleLeftPanel,
  onToggleRightPanel,
  onToggleMinimal,
  onOpenSettings,
}) {
  return (
    <nav
      aria-label="Workspace"
      className={[
        "fixed bottom-0 left-0 top-14 z-40 hidden w-11 lg:flex",
        "flex-col items-center gap-1 border-r border-border bg-surface py-2",
      ].join(" ")}
    >
      <IconButton
        title={leftPanelOpen ? "Hide voice panel" : "Show voice panel"}
        active={leftPanelOpen}
        tone="soft"
        onClick={onToggleLeftPanel}
      >
        <PanelLeft size={17} />
      </IconButton>

      <IconButton
        title={rightPanelOpen ? "Hide style panel" : "Show style panel"}
        active={rightPanelOpen}
        tone="soft"
        onClick={onToggleRightPanel}
      >
        <PanelRight size={17} />
      </IconButton>

      <IconButton
        title={isMinimal ? "Restore panels" : "Minimal mode — hide all panels"}
        active={isMinimal}
        tone="soft"
        onClick={onToggleMinimal}
      >
        <Maximize2 size={17} />
      </IconButton>

      <span aria-hidden="true" className="my-1 h-px w-6 bg-border" />

      <IconButton title="Boards — not available yet" disabled>
        <Home size={17} />
      </IconButton>
      <IconButton title="Layers — not available yet" disabled>
        <Layers size={17} />
      </IconButton>
      <IconButton title="Shape library — not available yet" disabled>
        <Shapes size={17} />
      </IconButton>
      <IconButton
        title="Participants"
        onClick={onToggleLeftPanel}
      >
        <Users size={17} />
      </IconButton>

      <div className="flex-1" />

      <IconButton title="Settings" onClick={onOpenSettings}>
        <Settings size={17} />
      </IconButton>
    </nav>
  );
}
