import { useCallback, useMemo } from "react";
import { Palette, PanelRightClose, SlidersHorizontal } from "lucide-react";
import Minimap from "../components/Minimap";
import StylePanel from "../components/StylePanel";
import TextEditorOverlay from "../components/TextEditorOverlay";
import Toolbar from "../components/Toolbar";
import ViewControls from "../components/ViewControls";
import WhiteboardCanvas from "../components/WhiteboardCanvas";
import EmptyCanvasHint from "../components/layout/EmptyCanvasHint";
import MobileTopBar from "../components/layout/MobileTopBar";
import WorkspaceHeader from "../components/layout/WorkspaceHeader";
import { buildBoardMenuItems } from "../components/layout/boardMenuItems.js";
import VoiceChatPanel from "../components/panels/VoiceChatPanel";
import { ActionList, IconButton, Island, Sheet } from "../components/ui/index.js";
import { SHAPE_LABELS, STYLEABLE_TOOLS, TOOL_LABELS } from "../constants/toolMeta.js";
import { TOOLS } from "../constants/tools.js";
import { getCanvasPalette } from "../design/canvasTokens.js";
import { useVoice } from "../features/communication/voice/useVoice.js";
import {
  downloadBlob,
  exportBoardImage,
  getExportFileName,
} from "../features/export/exportBoardImage.js";
import { useThemeContext } from "../features/theme/themeContext.js";
import { useToast } from "../features/toasts/toastContext.js";
import { SHEETS, useUiLayout } from "../hooks/useUiLayout";
import { useViewportSize } from "../hooks/useViewportSize";
import { useWhiteboard } from "../hooks/useWhiteboard";

/** Inspector top edge: 12px inset + 44px header island + 12px gap. */
const INSPECTOR_TOP = 68;
/** Space kept under the inspector: the minimap (12 + 122 + 8) or the bottom row. */
const INSPECTOR_BOTTOM_WITH_MINIMAP = 142;
const INSPECTOR_BOTTOM = 68;

/**
 * Voice state and actions, reduced to what the UI needs.
 *
 * Memoised on the individual fields — useVoice returns a new object every
 * render, which would otherwise re-render every consumer on every frame.
 * The underlying calls reject on failure; useVoice has already put the error
 * into `error`, which the UI renders, so rejections are absorbed here.
 */
function useVoiceModel(voice) {
  const {
    isJoined,
    isMuted,
    connectionState,
    localSpeaking,
    participants,
    error,
    joinVoice,
    leaveVoice,
    mute,
    unmute,
  } = voice;

  return useMemo(
    () => ({
      isJoined,
      isMuted,
      connectionState,
      localSpeaking,
      participants,
      error,
      onJoinVoice: () => joinVoice().catch(() => {}),
      onLeaveVoice: () => leaveVoice().catch(() => {}),
      onToggleMute: () => (isMuted ? unmute() : mute()),
    }),
    [
      connectionState,
      error,
      isJoined,
      isMuted,
      joinVoice,
      leaveVoice,
      localSpeaking,
      mute,
      participants,
      unmute,
    ],
  );
}

function getInspectorTitle(tool, selectedShapes) {
  if (selectedShapes.length > 1) return `${selectedShapes.length} selected`;
  if (selectedShapes.length === 1) return SHAPE_LABELS[selectedShapes[0].type] ?? "Selection";

  return STYLEABLE_TOOLS.has(tool) ? `${TOOL_LABELS[tool]} defaults` : "Style";
}

/**
 * BoardPage — the application shell.
 *
 * The Konva stage fills the viewport and every piece of chrome floats above it
 * as an island. Keeping the stage at window size (rather than insetting it
 * between panels) lets the pointer maths in useWhiteboardEvents and the
 * absolutely-positioned text editor keep using plain window coordinates.
 *
 * Two presentations are built from the same state:
 *   - tablet and desktop (≥ 768): header islands, contextual inspector, bottom
 *     row of view controls, tool dock and minimap
 *   - phone: compact top bar, bottom dock, and sheets for style, people and
 *     the board menu
 */
export default function BoardPage() {
  const board = useWhiteboard();
  const {
    collaboration,
    collaborators,
    shapes,
    tool,
    transform,
    selectedShape,
    selectedShapes,
    stageRef,
    getShapes,
    getStage,
    clearBoard,
    undo,
    redo,
    canUndo,
    canRedo,
    gridEnabled,
    toggleGrid,
  } = board;

  const voice = useVoice({
    roomId: collaboration.roomId,
    userId: collaboration.userId,
    username: collaboration.username,
  });
  const voiceModel = useVoiceModel(voice);

  const viewportSize = useViewportSize();
  const { theme, toggleTheme } = useThemeContext();
  const { toast } = useToast();
  const {
    isDesktop,
    isTabletUp,
    isCoarsePointer,
    inspectorOpen,
    toggleInspector,
    minimapVisible,
    toggleMinimap,
    sheet,
    openSheet,
    closeSheet,
  } = useUiLayout();

  const palette = getCanvasPalette(theme);
  const isDark = theme === "dark";
  const hasShapes = shapes.length > 0;
  const { startCollaboration, isEnabled: isShared } = collaboration;

  const handleShare = useCallback(async () => {
    const { copied } = await startCollaboration();

    if (!copied) {
      toast({
        id: "share",
        tone: "warning",
        title: isShared ? "Couldn't copy the link" : "Live link created",
        description: "Copy it from your browser's address bar.",
      });
      return;
    }

    toast({
      id: "share",
      tone: "success",
      title: isShared ? "Link copied" : "Live link copied",
      description: isShared ? undefined : "Anyone with the link can join and edit.",
    });
  }, [isShared, startCollaboration, toast]);

  const handleExport = useCallback(async () => {
    toast({ id: "export", tone: "loading", title: "Exporting image…", duration: Infinity });

    try {
      const blob = await exportBoardImage({
        stage: getStage(),
        shapes: getShapes(),
        background: palette.background,
      });
      if (!blob) throw new Error("Nothing to export");

      const fileName = getExportFileName();
      downloadBlob(blob, fileName);
      toast({ id: "export", tone: "success", title: "Image exported", description: fileName });
    } catch {
      toast({
        id: "export",
        tone: "danger",
        title: "Export failed",
        description: "Try again, or zoom out if the board is very large.",
      });
    }
  }, [getShapes, getStage, palette.background, toast]);

  const handleClearBoard = useCallback(() => {
    clearBoard();
    toast({
      id: "clear",
      title: "Canvas cleared",
      duration: 6000,
      action: { label: "Undo", onClick: undo },
    });
  }, [clearBoard, toast, undo]);

  const menuItems = useMemo(
    () =>
      buildBoardMenuItems({
        hasShapes,
        gridEnabled,
        isDark,
        minimapVisible,
        showMinimapToggle: isDesktop,
        onExport: handleExport,
        onToggleGrid: toggleGrid,
        onToggleTheme: toggleTheme,
        onToggleMinimap: toggleMinimap,
        onClearBoard: handleClearBoard,
      }),
    [
      gridEnabled,
      handleClearBoard,
      handleExport,
      hasShapes,
      isDark,
      isDesktop,
      minimapVisible,
      toggleGrid,
      toggleMinimap,
      toggleTheme,
    ],
  );

  const openMenuSheet = useCallback(() => openSheet(SHEETS.MENU), [openSheet]);
  const openPeopleSheet = useCallback(() => openSheet(SHEETS.PEOPLE), [openSheet]);
  const openStyleSheet = useCallback(() => openSheet(SHEETS.STYLE), [openSheet]);

  const selectionCount = selectedShapes.length;
  const hasInspectorContext = selectionCount > 0 || STYLEABLE_TOOLS.has(tool);
  const inspectorTitle = getInspectorTitle(tool, selectedShapes);
  const showMinimap = isDesktop && minimapVisible && hasShapes;
  const showEmptyHint =
    !hasShapes && !board.editingTextShape && (tool === TOOLS.SELECT || tool === TOOLS.PAN);

  const stylePanel = (
    <StylePanel
      compact
      tool={tool}
      selectedShape={selectedShape}
      selectionCount={selectionCount}
      activeStyle={board.activeStyle}
      onStyleChange={board.handleStyleChange}
      layerActions={board.layerActions}
      groupActions={board.groupActions}
      alignmentActions={board.alignmentActions}
    />
  );

  const toolbar = (
    <Toolbar
      tool={tool}
      setTool={board.setTool}
      toolLocked={board.toolLocked}
      setToolLocked={board.setToolLocked}
      pendingImageAsset={board.pendingImageAsset}
      onImageFileSelected={board.handleImageFileSelected}
      className="max-w-full!"
    />
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-canvas text-text">
      {/* ── Canvas ───────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 z-0"
        style={{ cursor: board.isPanMode ? "grab" : undefined }}
      >
        <WhiteboardCanvas
          stageRef={stageRef}
          transformerRef={board.transformerRef}
          viewportSize={viewportSize}
          transform={transform}
          shapes={shapes}
          tool={tool}
          erasingIds={board.erasingIds}
          selectedShapes={selectedShapes}
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
        transform={transform}
        onCommit={board.handleTextCommit}
        onCancel={board.handleTextCancel}
      />

      <EmptyCanvasHint visible={showEmptyHint} touch={isCoarsePointer} />

      {isTabletUp ? (
        <>
          <WorkspaceHeader
            status={collaboration.status}
            collaborators={collaborators}
            voice={voiceModel}
            isRoomOwner={collaboration.isRoomOwner}
            menuItems={menuItems}
            onShare={handleShare}
          />

          {/* ── Inspector — only when there is something to style ──── */}
          {hasInspectorContext && inspectorOpen ? (
            <Island
              as="aside"
              aria-label="Style"
              className="fb-rise fixed right-3 z-40 flex w-64 flex-col overflow-hidden"
              style={{
                top: INSPECTOR_TOP,
                maxHeight: `calc(100dvh - ${
                  INSPECTOR_TOP + (showMinimap ? INSPECTOR_BOTTOM_WITH_MINIMAP : INSPECTOR_BOTTOM)
                }px)`,
              }}
            >
              <header className="flex h-11 shrink-0 items-center gap-2 border-b border-divider pl-3 pr-1">
                <h2 className="min-w-0 flex-1 truncate text-title text-text">{inspectorTitle}</h2>
                <IconButton
                  label="Hide style panel"
                  tooltipPlacement="left"
                  onClick={toggleInspector}
                >
                  <PanelRightClose size={16} strokeWidth={1.75} />
                </IconButton>
              </header>
              <div className="fb-scroll min-h-0 overflow-y-auto p-3">{stylePanel}</div>
            </Island>
          ) : null}

          {hasInspectorContext && !inspectorOpen ? (
            <Island className="fixed right-3 z-40 p-1" style={{ top: INSPECTOR_TOP }}>
              <IconButton
                label="Show style panel"
                tooltipPlacement="left"
                onClick={toggleInspector}
              >
                <SlidersHorizontal size={16} strokeWidth={1.75} />
              </IconButton>
            </Island>
          ) : null}

          {/* ── Bottom row ───────────────────────────────────────────── */}
          <div className="fixed bottom-3 left-3 z-40">
            <ViewControls
              scale={transform.scale}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              onZoomIn={board.zoomIn}
              onZoomOut={board.zoomOut}
              onSetZoom={board.setZoom}
              onResetZoom={board.resetZoom}
              onFitToScreen={board.fitToScreen}
              canFitToScreen={hasShapes}
              showZoomButtons={isDesktop}
              touch={isCoarsePointer}
            />
          </div>

          <div
            className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2"
            style={isDesktop ? undefined : { maxWidth: "calc(100vw - 28rem)" }}
          >
            {toolbar}
          </div>

          {showMinimap ? (
            <div className="fixed bottom-3 right-3 z-40">
              <Minimap
                shapes={shapes}
                transform={transform}
                viewportSize={viewportSize}
                palette={palette}
                onNavigate={board.centerOn}
              />
            </div>
          ) : null}
        </>
      ) : (
        <>
          <MobileTopBar
            status={collaboration.status}
            collaborators={collaborators}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onOpenMenu={openMenuSheet}
            onOpenPeople={openPeopleSheet}
            onShare={handleShare}
          />

          <div className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-2">
            <div className="min-w-0 flex-1">{toolbar}</div>
            <Island className="shrink-0 rounded-xl p-0.5">
              <IconButton label="Style" size="xl" tooltip={false} onClick={openStyleSheet}>
                <Palette size={20} strokeWidth={1.75} />
              </IconButton>
            </Island>
          </div>

          <Sheet open={sheet === SHEETS.STYLE} onClose={closeSheet} title={inspectorTitle}>
            {stylePanel}
          </Sheet>

          <Sheet
            open={sheet === SHEETS.PEOPLE}
            onClose={closeSheet}
            title="People"
            description={`${collaborators.length} on this board`}
          >
            <VoiceChatPanel
              collaborators={collaborators}
              voice={voiceModel}
              isRoomOwner={collaboration.isRoomOwner}
              variant="mobile"
            />
          </Sheet>

          <Sheet open={sheet === SHEETS.MENU} onClose={closeSheet} title="Board">
            <ActionList items={menuItems} onAction={closeSheet} />
          </Sheet>
        </>
      )}
    </div>
  );
}
