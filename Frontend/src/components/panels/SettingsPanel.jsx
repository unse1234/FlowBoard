import {
  Copy,
  Download,
  Grid3x3,
  Link2,
  Moon,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  Divider,
  SectionLabel,
  SoonBadge,
  Toggle,
} from "../ui/index.js";

/**
 * SettingsPanel — board and workspace settings.
 *
 * Theme, the canvas grid, sharing and the room identity are real and wired.
 * Export and permissions exist in the design but have no implementation, so they
 * render as disabled rows carrying a "Soon" marker.
 */
export default function SettingsPanel({
  theme,
  onToggleTheme,
  collaboration,
  onClearBoard,
  gridEnabled = false,
  onToggleGrid,
  shapeCount = 0,
}) {
  const isDark = theme === "dark";
  const isShared = Boolean(collaboration?.isEnabled);

  return (
    <div className="space-y-4">
      {/* ── Appearance ───────────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionLabel>Appearance</SectionLabel>

        <SettingRow
          icon={isDark ? Moon : Sun}
          label="Dark mode"
          description="Follows your choice, saved to this browser"
          control={
            <Toggle
              checked={isDark}
              onChange={onToggleTheme}
              label="Toggle dark mode"
            />
          }
        />

        <SettingRow
          icon={Grid3x3}
          label="Canvas grid"
          description="Background grid, and snapping to it while dragging"
          control={
            <Toggle
              checked={gridEnabled}
              onChange={onToggleGrid}
              label="Canvas grid"
            />
          }
        />
      </section>

      <Divider />

      {/* ── Collaboration ────────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionLabel>Collaboration</SectionLabel>

        <SettingRow
          icon={Link2}
          label={isShared ? "Board is shared" : "Board is private"}
          description={
            isShared
              ? `Room ${collaboration?.roomId}`
              : "Only you can see this board"
          }
          control={
            <Button
              variant={isShared ? "secondary" : "primary"}
              size="xs"
              onClick={
                isShared
                  ? collaboration?.copyCollaborationLink
                  : collaboration?.startCollaboration
              }
            >
              <Copy size={13} />
              {isShared ? "Copy link" : "Share"}
            </Button>
          }
        />

        <SettingRow
          icon={Users}
          label="Permissions"
          description="Choose who can edit or only view"
          soon
          control={<Badge variant="outline">Everyone can edit</Badge>}
        />
      </section>

      <Divider />

      {/* ── Board ────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionLabel>Board</SectionLabel>

        <SettingRow
          icon={Download}
          label="Export"
          description="Save as PNG or SVG"
          soon
          control={
            <Button variant="secondary" size="xs" disabled>
              Export
            </Button>
          }
        />

        <SettingRow
          icon={Trash2}
          label="Clear canvas"
          description={`${shapeCount} ${shapeCount === 1 ? "element" : "elements"} on this board`}
          control={
            <Button
              variant="danger"
              size="xs"
              disabled={shapeCount === 0}
              onClick={onClearBoard}
            >
              Clear
            </Button>
          }
        />
      </section>
    </div>
  );
}

function SettingRow({ icon, label, description, control, soon = false }) {
  const Icon = icon;

  return (
    <div
      className={[
        "flex items-center gap-3 rounded-card border border-border bg-surface-soft p-2.5",
        soon ? "opacity-70" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-button bg-surface text-text-muted">
        <Icon size={15} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-text">
            {label}
          </span>
          {soon ? <SoonBadge /> : null}
        </span>
        <span className="block truncate text-[11px] text-text-soft">
          {description}
        </span>
      </span>

      <span className="shrink-0">{control}</span>
    </div>
  );
}
