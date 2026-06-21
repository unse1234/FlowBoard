import Toolbar from "../components/Toolbar";
import StylePanel from "../components/StylePanel";
import WhiteboardCanvas from "../components/WhiteboardCanvas";
import ZoomControls from "../components/ZoomControls";
import TextEditorOverlay from "../components/TextEditorOverlay";
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
  const viewportSize = useViewportSize();

  return (
    <>
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

      <TextEditorOverlay
        key={board.editingTextShape?.id ?? "idle-text-editor"}
        shape={board.editingTextShape}
        transform={board.transform}
        onCommit={board.handleTextCommit}
        onCancel={board.handleTextCancel}
      />
    </>
  );
}
