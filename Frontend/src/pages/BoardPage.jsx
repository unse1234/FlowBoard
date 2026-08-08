import Toolbar from "../components/Toolbar";
import StylePanel from "../components/StylePanel";
import WhiteboardCanvas from "../components/WhiteboardCanvas";
import ZoomControls from "../components/ZoomControls";
import TextEditorOverlay from "../components/TextEditorOverlay";
import CollaborationStatusBadge from "../features/realtime/components/CollaborationStatusBadge";
import ThemeToggle from "../features/theme/components/ThemeToggle.jsx";
import VoicePanel from "../features/communication/voice/components/VoicePanel.jsx";
import { useThemeContext } from "../features/theme/ThemeProvider.jsx";
import { useVoice } from "../features/communication/voice/useVoice.js";
import { useViewportSize } from "../hooks/useViewportSize";
import { useWhiteboard } from "../hooks/useWhiteboard";

/**
 * BoardPage Component - Main container for the whiteboard application
 *
 * Orchestrates the complete drawing application by composing sub-components
 * and wiring them to state/handlers from the useWhiteboard hook.
 * No local state - all data flows through the centralized hook.
 */
export default function BoardPage() {
  const board = useWhiteboard();
  const voice = useVoice({
    roomId: board.collaboration.roomId,
    userId: board.collaboration.userId,
    username: board.collaboration.username,
  });
  const viewportSize = useViewportSize();
  const { theme } = useThemeContext();

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-black dark:text-white">
      <Toolbar
        tool={board.tool}
        setTool={board.setTool}
        font={board.font}
        setFont={board.setFont}
        toolLocked={board.toolLocked}
        setToolLocked={board.setToolLocked}
        pendingImageAsset={board.pendingImageAsset}
        onImageFileSelected={board.handleImageFileSelected}
      />

      <StylePanel
        tool={board.tool}
        selectedShape={board.selectedShape}
        activeStyle={board.activeStyle}
        onStyleChange={board.handleStyleChange}
      />

      <ZoomControls
        scale={board.transform.scale}
        onUndo={board.undo}
        onRedo={board.redo}
      />

      <CollaborationStatusBadge
        status={board.collaboration.status}
        boardId={board.collaboration.boardId}
        roomId={board.collaboration.roomId}
        isEnabled={board.collaboration.isEnabled}
        linkCopied={board.collaboration.linkCopied}
        onStartCollaboration={board.collaboration.startCollaboration}
        onCopyLink={board.collaboration.copyCollaborationLink}
      />

      <div className="fixed right-4 bottom-20 z-50">
        <ThemeToggle />
      </div>

      <div className="fixed left-4 top-20 z-20">
        <VoicePanel
          isJoined={voice.isJoined}
          isMuted={voice.isMuted}
          connectionState={voice.connectionState}
          localSpeaking={voice.localSpeaking}
          participants={voice.participants}
          error={voice.error}
          onRequestMicrophone={voice.requestMicrophone}
          onConnect={voice.connect}
          onJoinVoice={voice.joinVoice}
          onLeaveVoice={voice.leaveVoice}
          onMute={voice.mute}
          onUnmute={voice.unmute}
        />
      </div>

      <WhiteboardCanvas
        stageRef={board.stageRef}
        transformerRef={board.transformerRef}
        viewportSize={viewportSize}
        transform={board.transform}
        shapes={board.shapes}
        tool={board.tool}
        erasingIds={board.erasingIds}
        selectedShape={board.selectedShape}
        editingTextShape={board.editingTextShape}
        laserPoints={board.laserPoints}
        eraserPoints={board.eraserPoints}
        liveCursors={board.liveCursors}
        registerShapeRef={board.registerShapeRef}
        theme={theme}
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

      <TextEditorOverlay
        key={board.editingTextShape?.id ?? "idle-text-editor"}
        shape={board.editingTextShape}
        transform={board.transform}
        onCommit={board.handleTextCommit}
        onCancel={board.handleTextCancel}
      />
    </div>
  );
}
