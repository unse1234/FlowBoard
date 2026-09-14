import { useCallback, useMemo, useRef, useState } from "react";
import { Palette, SlidersHorizontal } from "lucide-react";
import Minimap from "../components/Minimap";
import TextEditorOverlay from "../components/TextEditorOverlay";
import Toolbar from "../components/Toolbar";
import ViewControls from "../components/ViewControls";
import WhiteboardCanvas from "../components/WhiteboardCanvas";
import Inspector, { SelectionActions } from "../components/inspector/Inspector";
import InspectorPanel from "../components/inspector/InspectorPanel";
import { getInspectorModel } from "../components/inspector/inspectorModel.js";
import EmptyCanvasHint from "../components/layout/EmptyCanvasHint";
import MobileTopBar from "../components/layout/MobileTopBar";
import SelectionBar from "../components/layout/SelectionBar";
import WorkspaceHeader from "../components/layout/WorkspaceHeader";
import { buildBoardMenuItems } from "../components/layout/boardMenuItems.js";
import { buildCanvasMenuItems } from "../components/layout/canvasMenuItems.js";
import ShortcutsDialog from "../components/panels/ShortcutsDialog";
import JoinRoomDialog from "../components/collab/JoinRoomDialog";
import SharePanel from "../components/collab/SharePanel";
import VoicePill from "../components/collab/VoicePill";
import PeoplePanel from "../components/panels/PeoplePanel";
import { ActionList, IconButton, Island, Menu, Sheet } from "../components/ui/index.js";
import { MAX_SCALE, MIN_SCALE } from "../constants/canvas.js";
import { TOOLS } from "../constants/tools.js";
import { getCanvasPalette } from "../design/canvasTokens.js";
import { useVoice } from "../features/communication/voice/useVoice.js";
import {
  downloadBlob,
  exportBoardImage,
  getExportFileName,
} from "../features/export/exportBoardImage.js";
import { SHOW_SHORTCUTS_COMBO } from "../features/shortcuts/boardShortcuts.js";
import { useShortcuts } from "../features/shortcuts/useShortcuts.js";
import { useThemeContext } from "../features/theme/themeContext.js";
import { useToast } from "../features/toasts/toastContext.js";
import { useConnectionToasts } from "../hooks/useConnectionToasts";
import { useTouchGestures } from "../hooks/useTouchGestures";
import { SHEETS, useUiLayout } from "../hooks/useUiLayout";
import { useViewportSize } from "../hooks/useViewportSize";
import { useWhiteboard } from "../hooks/useWhiteboard";
import { getBaseShapeStyle } from "../utils/styleUtils";

/** Inspector top edge: 12px inset + 44px header island + 12px gap. */
const INSPECTOR_TOP = 68;
/** Space kept under the inspector: the minimap (12 + 122 + 8) or the bottom row. */
const INSPECTOR_BOTTOM_WITH_MINIMAP = 142;
const INSPECTOR_BOTTOM = 68;

/** Tools that place something at a point, and so get a precise cursor. */
const CROSSHAIR_TOOLS = new Set([
  TOOLS.RECT,
  TOOLS.CIRCLE,
  TOOLS.DIAMOND,
  TOOLS.LINE,
  TOOLS.ARROW,
  TOOLS.PEN,
  TOOLS.NOTE,
  TOOLS.IMAGE,
  TOOLS.LASER,
  TOOLS.ERASER,
]);

function getCanvasCursor(tool, isPanMode) {
  if (isPanMode) return "grab";
  if (tool === TOOLS.TEXT) return "text";
  if (CROSSHAIR_TOOLS.has(tool)) return "crosshair";
  return undefined;
}

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

  // Joining asks for the microphone and opens signalling, which takes a moment
  // and can fail; both are UI state the voice manager does not track.
  const [isJoining, setIsJoining] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);

  const onJoinVoice = useCallback(() => {
    setIsJoining(true);
    setJoinFailed(false);

    joinVoice()
      .then(() => setJoinFailed(false))
      .catch(() => setJoinFailed(true))
      .finally(() => setIsJoining(false));
  }, [joinVoice]);

  return useMemo(
    () => ({
      isJoined,
      isMuted,
      connectionState,
      localSpeaking,
      participants,
      error,
      isJoining,
      joinFailed,
      onJoinVoice,
      onLeaveVoice: () => leaveVoice().catch(() => {}),
      onToggleMute: () => (isMuted ? unmute() : mute()),
    }),
    [
      connectionState,
      error,
      isJoined,
      isJoining,
      isMuted,
      joinFailed,
      leaveVoice,
      localSpeaking,
      mute,
      onJoinVoice,
      participants,
      unmute,
    ],
  );
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
 *     row of view controls, tool dock and minimap, right-click canvas menu
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
    activeStyle,
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
    clipboard,
    layerActions,
    groupActions,
    alignmentActions,
    deleteSelection,
    selectAll,
    fitToScreen,
    resetZoom,
    handleStyleChange,
    setViewTransform,
    cancelPointerInteraction,
  } = board;

  const voice = useVoice({
    // Voice waits for a display name, so peers never see a nameless participant.
    roomId: collaboration.username ? collaboration.roomId : null,
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
  const hasSelection = selectedShapes.length > 0;
  const { startCollaboration, copyCollaborationLink, isEnabled: isShared } = collaboration;

  useConnectionToasts(collaboration.status);

  // Two fingers pan and pinch the canvas; one finger still draws.
  const canvasRef = useRef(null);
  useTouchGestures(canvasRef, {
    transform,
    onTransform: setViewTransform,
    onGestureStart: cancelPointerInteraction,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
  });

  // ── Keyboard shortcuts dialog ──────────────────────────────────────────
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);

  // "?" is Shift+/ on most layouts, and modifier matching is strict.
  const shellShortcuts = useMemo(
    () => [
      {
        key: SHOW_SHORTCUTS_COMBO,
        shift: true,
        description: "Keyboard shortcuts",
        handler: openShortcuts,
      },
    ],
    [openShortcuts],
  );
  useShortcuts(shellShortcuts);

  // ── Board actions with feedback ────────────────────────────────────────
  /** Create the room and copy its link; the join dialog follows for a name. */
  const handleCreateLink = useCallback(async () => {
    const { copied } = await startCollaboration();

    toast(
      copied
        ? {
            id: "share",
            tone: "success",
            title: "Live link copied",
            description: "Anyone with the link can join and edit.",
          }
        : {
            id: "share",
            tone: "warning",
            title: "Live link created",
            description: "Copy it from Share, or from your browser's address bar.",
          },
    );
  }, [startCollaboration, toast]);

  /** Copy confirms in place on the button; only a failure needs a toast. */
  const handleCopyLink = useCallback(async () => {
    const copied = await copyCollaborationLink();

    if (!copied) {
      toast({
        id: "share",
        tone: "warning",
        title: "Couldn't copy the link",
        description: "Select the link and copy it yourself.",
      });
    }
  }, [copyCollaborationLink, toast]);

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
        // Keyboard shortcuts only mean something where a keyboard is likely.
        onShowShortcuts: isTabletUp ? openShortcuts : undefined,
        onClearBoard: handleClearBoard,
        // Touch has no keyboard or right-click; phones also have no view island.
        touchActions:
          isCoarsePointer || !isTabletUp
            ? {
                onSelectAll: selectAll,
                onPaste: clipboard.paste,
                onFitToScreen: isTabletUp ? undefined : fitToScreen,
                onResetView: isTabletUp ? undefined : resetZoom,
              }
            : undefined,
      }),
    [
      clipboard.paste,
      fitToScreen,
      gridEnabled,
      handleClearBoard,
      handleExport,
      hasShapes,
      isCoarsePointer,
      isDark,
      isDesktop,
      isTabletUp,
      minimapVisible,
      openShortcuts,
      resetZoom,
      selectAll,
      toggleGrid,
      toggleMinimap,
      toggleTheme,
    ],
  );

  // ── Canvas context menu (pointer devices) ──────────────────────────────
  const [contextMenuPoint, setContextMenuPoint] = useState(null);
  const closeContextMenu = useCallback(() => setContextMenuPoint(null), []);

  const handleContextMenu = useCallback(
    (event) => {
      event.preventDefault();
      // A touch long-press is not a right-click; phones and tablets get
      // visible selection actions instead.
      if (isCoarsePointer) return;
      setContextMenuPoint({ x: event.clientX, y: event.clientY });
    },
    [isCoarsePointer],
  );

  const canvasMenuItems = buildCanvasMenuItems({
    hasSelection,
    hasShapes,
    clipboard,
    layerActions,
    groupActions,
    onDelete: deleteSelection,
    onSelectAll: selectAll,
    onFitToScreen: fitToScreen,
    gridEnabled,
    onToggleGrid: toggleGrid,
  });

  // ── Sheets (phone) ─────────────────────────────────────────────────────
  const openMenuSheet = useCallback(() => openSheet(SHEETS.MENU), [openSheet]);
  const openPeopleSheet = useCallback(() => openSheet(SHEETS.PEOPLE), [openSheet]);
  const openStyleSheet = useCallback(() => openSheet(SHEETS.STYLE), [openSheet]);
  const openShareSheet = useCallback(() => openSheet(SHEETS.SHARE), [openSheet]);

  // As on desktop, close the sheet before the join dialog asks for a name.
  const createLinkFromSheet = useCallback(async () => {
    closeSheet();
    await handleCreateLink();
  }, [closeSheet, handleCreateLink]);

  const deleteAndCloseSheet = useCallback(() => {
    deleteSelection();
    closeSheet();
  }, [closeSheet, deleteSelection]);

  // ── Inspector ──────────────────────────────────────────────────────────
  const inspectorModel = useMemo(
    () => getInspectorModel({ tool, selectedShapes }),
    [selectedShapes, tool],
  );

  // Stored style, not the theme-adjusted render style, so swatches match.
  const shapeStyle = useMemo(
    () => (selectedShape ? getBaseShapeStyle(selectedShape) : activeStyle),
    [activeStyle, selectedShape],
  );

  const showMinimap = isDesktop && minimapVisible && hasShapes;

  const inspectorPosition = useMemo(
    () => ({
      top: INSPECTOR_TOP,
      maxHeight: `calc(100dvh - ${
        INSPECTOR_TOP + (showMinimap ? INSPECTOR_BOTTOM_WITH_MINIMAP : INSPECTOR_BOTTOM)
      }px)`,
    }),
    [showMinimap],
  );

  const showEmptyHint =
    !hasShapes && !board.editingTextShape && (tool === TOOLS.SELECT || tool === TOOLS.PAN);

  const toolbar = (
    <Toolbar
      variant={isDesktop ? "full" : isTabletUp ? "compact" : "touch"}
      touch={isCoarsePointer}
      tool={tool}
      setTool={board.setTool}
      toolLocked={board.toolLocked}
      setToolLocked={board.setToolLocked}
      pendingImageAsset={board.pendingImageAsset}
      onImageFileSelected={board.handleImageFileSelected}
      onCancelImage={board.cancelPendingImage}
    />
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-canvas text-text">
      {/* ── Canvas ───────────────────────────────────────────────── */}
      {/* touch-none: the browser must not pan or zoom the page over the canvas. */}
      <div
        ref={canvasRef}
        className="absolute inset-0 z-0 touch-none"
        style={{ cursor: getCanvasCursor(tool, board.isPanMode) }}
        onContextMenu={handleContextMenu}
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
          palette={palette}
          isCoarsePointer={isCoarsePointer}
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
            isShared={isShared}
            link={collaboration.link}
            linkCopied={collaboration.linkCopied}
            menuItems={menuItems}
            onCreateLink={handleCreateLink}
            onCopyLink={handleCopyLink}
          />

          {/* ── Inspector — only when there is something to style ──── */}
          {inspectorModel && inspectorOpen ? (
            <Inspector
              model={inspectorModel}
              shapeStyle={shapeStyle}
              onStyleChange={handleStyleChange}
              layerActions={layerActions}
              groupActions={groupActions}
              alignmentActions={alignmentActions}
              onDuplicate={clipboard.duplicate}
              onDelete={deleteSelection}
              onHide={toggleInspector}
              style={inspectorPosition}
            />
          ) : null}

          {inspectorModel && !inspectorOpen ? (
            <Island className="fixed right-3 z-40 p-1" style={{ top: INSPECTOR_TOP }}>
              <IconButton label="Show inspector" tooltipPlacement="left" onClick={toggleInspector}>
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
              onFitToScreen={fitToScreen}
              canFitToScreen={hasShapes}
              showZoomButtons={isDesktop}
              touch={isCoarsePointer}
            />
          </div>

          <div className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2">{toolbar}</div>

          {isCoarsePointer && hasSelection && !board.editingTextShape ? (
            <div className="fixed bottom-17 left-1/2 z-40 -translate-x-1/2">
              <SelectionBar
                count={selectedShapes.length}
                menuItems={canvasMenuItems}
                onDuplicate={clipboard.duplicate}
                onDelete={deleteSelection}
              />
            </div>
          ) : null}

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

          <Menu
            open={Boolean(contextMenuPoint)}
            onClose={closeContextMenu}
            anchorPoint={contextMenuPoint ?? undefined}
            placement="bottom-start"
            label="Canvas actions"
            items={canvasMenuItems}
          />
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
            onOpenShare={openShareSheet}
          />

          {/* Row above the dock: selection actions on the left, voice on the right. */}
          {hasSelection && !board.editingTextShape ? (
            <div className="fixed left-2 bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+4rem)] z-40">
              <SelectionBar
                count={selectedShapes.length}
                menuItems={canvasMenuItems}
                onDuplicate={clipboard.duplicate}
                onDelete={deleteSelection}
              />
            </div>
          ) : null}

          {voiceModel.isJoined || voiceModel.isJoining ? (
            <div className="fixed right-2 bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+4rem)] z-40">
              <VoicePill voice={voiceModel} onOpenPeople={openPeopleSheet} />
            </div>
          ) : null}

          <div className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 flex items-center justify-center gap-2">
            {toolbar}
            <Island className="shrink-0 rounded-xl p-0.5">
              <IconButton label="Style" size="xl" tooltip={false} onClick={openStyleSheet}>
                <Palette size={20} strokeWidth={1.75} />
              </IconButton>
            </Island>
          </div>

          <Sheet
            open={sheet === SHEETS.STYLE}
            onClose={closeSheet}
            title={inspectorModel?.title ?? "Style"}
            description={inspectorModel?.subtitle}
            headerAction={
              inspectorModel?.mode === "selection" ? (
                <SelectionActions
                  touch
                  onDuplicate={clipboard.duplicate}
                  onDelete={deleteAndCloseSheet}
                />
              ) : null
            }
          >
            {inspectorModel ? (
              <InspectorPanel
                touch
                model={inspectorModel}
                shapeStyle={shapeStyle}
                onStyleChange={handleStyleChange}
                layerActions={layerActions}
                groupActions={groupActions}
                alignmentActions={alignmentActions}
              />
            ) : (
              <p className="py-6 text-center text-body text-text-muted">
                Select a shape, or pick a drawing tool, to style it.
              </p>
            )}
          </Sheet>

          <Sheet
            open={sheet === SHEETS.PEOPLE}
            onClose={closeSheet}
            title="People"
            description={`${collaborators.length} on this board`}
          >
            <PeoplePanel
              touch
              collaborators={collaborators}
              voice={voiceModel}
              isShared={isShared}
              onShare={openShareSheet}
            />
          </Sheet>

          <Sheet
            open={sheet === SHEETS.SHARE}
            onClose={closeSheet}
            title="Share this board"
            description={
              isShared
                ? "Anyone with the link can join and edit."
                : "Draw and talk with others in real time."
            }
          >
            <SharePanel
              touch
              showTitle={false}
              isShared={isShared}
              link={collaboration.link}
              linkCopied={collaboration.linkCopied}
              status={collaboration.status}
              collaborators={collaborators}
              onCreateLink={createLinkFromSheet}
              onCopyLink={handleCopyLink}
            />
          </Sheet>

          <Sheet open={sheet === SHEETS.MENU} onClose={closeSheet} title="Board">
            <ActionList items={menuItems} onAction={closeSheet} />
          </Sheet>
        </>
      )}

      <ShortcutsDialog open={shortcutsOpen} onClose={closeShortcuts} />

      <JoinRoomDialog
        key={collaboration.roomId ?? "no-room"}
        open={collaboration.needsDisplayName}
        isRoomOwner={collaboration.isRoomOwner}
        suggestedName={collaboration.suggestedDisplayName}
        color={collaboration.userColor}
        onSubmit={collaboration.setDisplayName}
      />
    </div>
  );
}
