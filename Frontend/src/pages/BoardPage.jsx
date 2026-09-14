import { useCallback, useMemo, useState } from "react";
import StylePanel from "../components/StylePanel";
import TextEditorOverlay from "../components/TextEditorOverlay";
import Toolbar from "../components/Toolbar";
import WhiteboardCanvas from "../components/WhiteboardCanvas";
import Minimap from "../components/Minimap";
import { ViewControls, ZoomPill } from "../components/ViewControls";
import ToolsSheet from "../components/mobile/ToolsSheet";
import LeftRail from "../components/layout/LeftRail";
import MobileTabBar from "../components/layout/MobileTabBar";
import TopBar from "../components/layout/TopBar";
import ChatPanel from "../components/panels/ChatPanel";
import SettingsPanel from "../components/panels/SettingsPanel";
import VoiceChatPanel from "../components/panels/VoiceChatPanel";
import { Dialog, Sheet } from "../components/ui/index.js";
import { useVoice } from "../features/communication/voice/useVoice.js";
import { useThemeContext } from "../features/theme/themeContext.js";
import { MOBILE_SHEETS, useUiLayout } from "../hooks/useUiLayout";
import { useViewportSize } from "../hooks/useViewportSize";
import { useWhiteboard } from "../hooks/useWhiteboard";

/** Widths of the docked desktop columns, in pixels. */
const RAIL_WIDTH = 44;
const SIDE_PANEL_WIDTH = 264;

/**
 * BoardPage — the application shell.
 *
 * Layout model: the Konva stage fills the whole viewport and every piece of
 * chrome floats above it. Keeping the stage at window size (rather than
 * insetting it between the panels) is what lets the pointer maths in
 * useWhiteboardEvents and the absolutely-positioned text editor keep using
 * plain window coordinates.
 *
 * Two presentations are built from the same state:
 *   - desktop (lg+): docked left/right columns plus the icon rail
 *   - mobile: a bottom tab bar that opens the same panels as sheets
 */
export default function BoardPage() {
  const board = useWhiteboard();
  const voice = useVoice({
    roomId: board.collaboration.roomId,
    userId: board.collaboration.userId,
    username: board.collaboration.username,
  });
  const viewportSize = useViewportSize();
  const { theme, toggleTheme } = useThemeContext();
  const layout = useUiLayout();
  const [settingsOpen, setSettingsOpen] = useState(false);

  /**
   * Voice actions, reduced to what the UI needs.
   *
   * The underlying calls reject on failure; useVoice has already pushed that
   * failure into `voice.error`, which the panel renders, so the rejection is
   * absorbed here rather than becoming an unhandled promise.
   */
  const voiceModel = useMemo(
    () => ({
      isJoined: voice.isJoined,
      isMuted: voice.isMuted,
      connectionState: voice.connectionState,
      localSpeaking: voice.localSpeaking,
      participants: voice.participants,
      error: voice.error,
      onJoinVoice: () => voice.joinVoice().catch(() => {}),
      onLeaveVoice: () => voice.leaveVoice().catch(() => {}),
      onToggleMute: () => (voice.isMuted ? voice.unmute() : voice.mute()),
    }),
    [voice],
  );

  const openSettings = useCallback(() => {
    if (layout.isDesktop) setSettingsOpen(true);
    else layout.openSheet(MOBILE_SHEETS.SETTINGS);
  }, [layout]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Centre the floating toolbar over the visible canvas, not the window, so it
  // does not drift under a docked panel when only one side is open.
  const leftInset = layout.isDesktop
    ? RAIL_WIDTH + (layout.leftPanelOpen ? SIDE_PANEL_WIDTH : 0)
    : 0;
  const rightInset =
    layout.isDesktop && layout.rightPanelOpen ? SIDE_PANEL_WIDTH : 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg font-body text-text">
      {/* ── Canvas ───────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 z-0 bg-canvas"
        style={{ cursor: board.isPanMode ? "grab" : undefined }}
      >
        <WhiteboardCanvas
          stageRef={board.stageRef}
          transformerRef={board.transformerRef}
          viewportSize={viewportSize}
          transform={board.transform}
          shapes={board.shapes}
          tool={board.tool}
          erasingIds={board.erasingIds}
          selectedShapes={board.selectedShapes}
          editingTextShape={board.editingTextShape}
          marquee={board.marquee}
          snapGuides={board.snapGuides}
          gridSize={board.gridSize}
          isPanMode={board.isPanMode}
          laserPoints={board.laserPoints}
          eraserPoints={board.eraserPoints}
          liveCursors={board.liveCursors}
          registerShapeRef={board.registerShapeRef}
          onWheel={board.handleWheel}
          onMouseDown={board.handleMouseDown}
          onMouseMove={board.handleMouseMove}
          onMouseUp={board.handleMouseUp}
          onShapeMouseDown={board.handleShapeMouseDown}
          onShapeDoubleClick={board.handleShapeDoubleClick}
          onDragStart={board.handleDragStart}
          onDragMove={board.handleDragMove}
          onDragEnd={board.handleDragEnd}
          onTransformStart={board.handleTransformStart}
          onTransformEnd={board.handleTransformEnd}
          onAnchorDragStart={board.handleAnchorDragStart}
          onAnchorDragMove={board.handleAnchorDragMove}
        />
      </div>

      <TextEditorOverlay
        key={board.editingTextShape?.id ?? "idle-text-editor"}
        shape={board.editingTextShape}
        transform={board.transform}
        onCommit={board.handleTextCommit}
        onCancel={board.handleTextCancel}
      />

      {/* ── Header ───────────────────────────────────────────────── */}
      <TopBar
        collaborators={board.collaborators}
        collaboration={board.collaboration}
        voice={voiceModel}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={openSettings}
      />

      {/* ── Desktop rail ─────────────────────────────────────────── */}
      <LeftRail
        leftPanelOpen={layout.leftPanelOpen}
        rightPanelOpen={layout.rightPanelOpen}
        isMinimal={layout.isMinimal}
        onToggleLeftPanel={layout.toggleLeftPanel}
        onToggleRightPanel={layout.toggleRightPanel}
        onToggleMinimal={layout.toggleMinimal}
        onOpenSettings={openSettings}
      />

      {/* ── Desktop left column ──────────────────────────────────── */}
      {layout.leftPanelOpen && (
        <aside
          aria-label="Voice chat"
          className={[
            "fb-scroll fixed bottom-0 top-14 z-40 hidden overflow-y-auto lg:block",
            "border-r border-border bg-surface p-3",
          ].join(" ")}
          style={{ left: RAIL_WIDTH, width: SIDE_PANEL_WIDTH }}
        >
          <VoiceChatPanel
            collaborators={board.collaborators}
            voice={voiceModel}
            isRoomOwner={board.collaboration.isRoomOwner}
          />
        </aside>
      )}

      {/* ── Desktop right column ─────────────────────────────────── */}
      {layout.rightPanelOpen && (
        <aside
          aria-label="Tool style"
          className={[
            "fb-scroll fixed bottom-0 right-0 top-14 z-40 hidden overflow-y-auto lg:block",
            "border-l border-border bg-surface p-3",
          ].join(" ")}
          style={{ width: SIDE_PANEL_WIDTH }}
        >
          <StylePanel
            tool={board.tool}
            selectedShape={board.selectedShape}
            selectionCount={board.selectedShapes.length}
            activeStyle={board.activeStyle}
            onStyleChange={board.handleStyleChange}
            layerActions={board.layerActions}
            groupActions={board.groupActions}
            alignmentActions={board.alignmentActions}
          />
        </aside>
      )}

      {/* ── Floating toolbar (desktop) ───────────────────────────── */}
      <div
        className="fixed top-[4.5rem] z-40 hidden -translate-x-1/2 lg:block"
        style={{ left: `calc(${leftInset}px + (100% - ${leftInset + rightInset}px) / 2)` }}
      >
        <Toolbar
          tool={board.tool}
          setTool={board.setTool}
          toolLocked={board.toolLocked}
          setToolLocked={board.setToolLocked}
          pendingImageAsset={board.pendingImageAsset}
          onImageFileSelected={board.handleImageFileSelected}
        />
      </div>

      {/* ── Canvas controls ──────────────────────────────────────── */}
      <div
        className="fixed bottom-[4.75rem] z-40 lg:bottom-3"
        style={{ left: layout.isDesktop ? leftInset + 12 : 12 }}
      >
        <ZoomPill
          scale={board.transform.scale}
          onSetZoom={board.setZoom}
          onResetZoom={board.resetZoom}
          onUndo={board.undo}
          onRedo={board.redo}
        />
      </div>

      {/* Minimap sits above the view controls, desktop only — at phone width
          it would cost more screen than it saves. */}
      <div
        className="fixed bottom-16 z-40 hidden lg:block"
        style={{ right: rightInset + 12 }}
      >
        <Minimap
          shapes={board.shapes}
          transform={board.transform}
          viewportSize={viewportSize}
          onNavigate={board.centerOn}
        />
      </div>

      <div
        className="fixed bottom-3 z-40 hidden lg:block"
        style={{ right: rightInset + 12 }}
      >
        <ViewControls
          scale={board.transform.scale}
          onZoomIn={board.zoomIn}
          onZoomOut={board.zoomOut}
          onFitToScreen={board.fitToScreen}
          canFitToScreen={board.shapes.length > 0}
        />
      </div>

      {/* ── Mobile navigation ────────────────────────────────────── */}
      <MobileTabBar
        activeSheet={layout.mobileSheet}
        onSelect={layout.toggleSheet}
        participantCount={board.collaborators.length}
      />

      <Sheet
        open={layout.mobileSheet === MOBILE_SHEETS.TOOLS}
        title="Tools"
        onClose={layout.closeSheet}
      >
        <ToolsSheet
          tool={board.tool}
          setTool={board.setTool}
          toolLocked={board.toolLocked}
          setToolLocked={board.setToolLocked}
          activeStyle={board.activeStyle}
          selectedShape={board.selectedShape}
          onStyleChange={board.handleStyleChange}
          onImageFileSelected={board.handleImageFileSelected}
          onToolPicked={layout.closeSheet}
        />
      </Sheet>

      <Sheet
        open={layout.mobileSheet === MOBILE_SHEETS.CHAT}
        title="Chat"
        onClose={layout.closeSheet}
      >
        <ChatPanel collaborators={board.collaborators} />
      </Sheet>

      <Sheet
        open={layout.mobileSheet === MOBILE_SHEETS.PARTICIPANTS}
        title={`Participants (${board.collaborators.length})`}
        onClose={layout.closeSheet}
      >
        <VoiceChatPanel
          collaborators={board.collaborators}
          voice={voiceModel}
          isRoomOwner={board.collaboration.isRoomOwner}
          variant="mobile"
        />
      </Sheet>

      <Sheet
        open={layout.mobileSheet === MOBILE_SHEETS.SETTINGS}
        title="Settings"
        onClose={layout.closeSheet}
      >
        <SettingsPanel
          theme={theme}
          onToggleTheme={toggleTheme}
          collaboration={board.collaboration}
          onClearBoard={board.clearBoard}
          gridEnabled={board.gridEnabled}
          onToggleGrid={board.toggleGrid}
          shapeCount={board.shapes.length}
        />
      </Sheet>

      {/* ── Desktop settings ─────────────────────────────────────── */}
      <Dialog
        open={settingsOpen}
        title="Settings"
        description="Appearance, sharing and board actions"
        onClose={closeSettings}
      >
        <SettingsPanel
          theme={theme}
          onToggleTheme={toggleTheme}
          collaboration={board.collaboration}
          onClearBoard={board.clearBoard}
          gridEnabled={board.gridEnabled}
          onToggleGrid={board.toggleGrid}
          shapeCount={board.shapes.length}
        />
      </Dialog>
    </div>
  );
}
