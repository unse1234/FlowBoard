import { useCallback } from "react";
import { Group, Stage, Layer, Transformer } from "react-konva";
import { OVERLAY_NAME } from "../features/export/exportBoardImage.js";
import ShapeRenderer from "./ShapeRenderer";
import LineEditor from "./LineEditor";
import PointerTrails from "./PointerTrails";
import LiveCursors from "../features/realtime/components/LiveCursors";
import CanvasGrid from "./canvas/CanvasGrid";
import SelectionRect from "./canvas/SelectionRect";
import SnapGuides from "./canvas/SnapGuides";
import { getBendableSelection } from "../domain/selection/selectionModel.js";
import {
  isShapeIdEqual,
  normalizeShapeIdSet,
} from "../domain/board/shapeIdentity.js";

/** Minimum on-screen size a transform may shrink a shape to. */
const MIN_TRANSFORM_SIZE = 5;

/**
 * WhiteboardCanvas Component
 *
 * Main Konva stage rendering all shapes, editor UI, and pointer trails.
 * Handles canvas events (wheel, mouse) and delegates shape interaction to handlers.
 * Transformer is constrained to prevent micro-shapes (< 5px).
 *
 * Interaction chrome (selection handles, marquee, guides, grid, trails) is
 * painted from `palette` — the theme's canvas tokens — and handles grow on
 * coarse pointers so they can be grabbed with a finger.
 *
 * @param {Object} stageRef - React ref to Konva Stage node
 * @param {Object} transformerRef - React ref to Konva Transformer node
 * @param {Object} transform - Canvas transform {x, y, scale}
 * @param {Array} shapes - Array of shapes to render
 * @param {string} tool - Currently selected tool
 * @param {Array} erasingIds - IDs of shapes marked for erasure
 * @param {Array} selectedShapes - Currently selected shapes
 * @param {Object} marquee - Drag-selection rectangle in world space, or null
 * @param {Array} laserPoints - Laser pointer trail points
 * @param {Array} eraserPoints - Eraser trail points
 * @param {Object} palette - Canvas colour tokens (design/canvasTokens.js)
 * @param {boolean} isCoarsePointer - Enlarge handles for touch
 * @param {Function} registerShapeRef - Register shape node references
 * @param {Function} onWheel - Scroll event handler (zoom)
 * @param {Function} onMouseDown - Canvas mouse down handler
 * @param {Function} onMouseMove - Canvas mouse move handler
 * @param {Function} onMouseUp - Canvas mouse up handler
 * @param {Function} onShapeMouseDown - Shape click handler
 * @param {Function} onShapeDoubleClick - Shape double-click handler
 * @param {Function} onDragEnd - Shape drag completion handler
 * @param {Function} onTransformEnd - Shape transform completion handler
 * @param {Function} onAnchorDragMove - Line breakpoint drag handler
 */
export default function WhiteboardCanvas({
  stageRef,
  transformerRef,
  viewportSize,
  transform,
  shapes,
  tool,
  erasingIds,
  selectedShapes,
  editingTextShape,
  marquee,
  snapGuides,
  gridSize,
  isPanMode,
  laserPoints,
  eraserPoints,
  liveCursors,
  palette,
  isCoarsePointer = false,
  registerShapeRef,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onShapeMouseDown,
  onShapeDoubleClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformStart,
  onTransformEnd,
  onAnchorDragStart,
  onAnchorDragMove,
}) {
  const erasingShapeIds = normalizeShapeIdSet(erasingIds);

  // Breakpoint handles belong to a lone line or arrow. Once it is part of a
  // wider selection the Transformer is driving it instead, and showing both
  // sets of handles at once would be ambiguous.
  const bendableShape = getBendableSelection(selectedShapes);

  // The stage listens to pointer events, which Konva maps for mouse, pen and
  // touch alike; mouse events alone never fire for a touch drag.
  //
  // A touch press is cancelled so the browser does not follow it with emulated
  // mouse events, which would blur a text editor the press has just opened.
  // Cancelling also skips the focus change a press normally causes, so it is
  // done by hand first: whatever had focus (an open text editor) lets go and
  // commits, exactly as it would under a mouse.
  const handlePointerDown = useCallback(
    (event) => {
      if (event.evt?.pointerType === "touch") {
        event.evt.preventDefault();

        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
      }

      onMouseDown(event);
    },
    [onMouseDown],
  );

  return (
    <Stage
      ref={stageRef}
      width={viewportSize.width}
      height={viewportSize.height}
      x={transform.x}
      y={transform.y}
      scaleX={transform.scale}
      scaleY={transform.scale}
      onWheel={onWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={onMouseMove}
      onPointerUp={onMouseUp}
      onPointerCancel={onMouseUp}
      // The stage stays transparent; the wrapping element paints `bg-canvas`,
      // so the canvas follows the theme tokens like the rest of the shell.
      style={{ backgroundColor: "transparent" }}
    >
      <Layer>
        {/* Interaction chrome is grouped under OVERLAY_NAME so image export can
            hide it; the groups sit at the origin, so nothing inside moves. */}
        <Group name={OVERLAY_NAME}>
          <CanvasGrid
            transform={transform}
            viewportSize={viewportSize}
            gridSize={gridSize}
            color={palette.grid}
          />
        </Group>

        {shapes.map((shape) => (
          <ShapeRenderer
            key={shape.id}
            shape={shape}
            tool={tool}
            isPanMode={isPanMode}
            isErasing={erasingShapeIds.has(String(shape.id))}
            isEditing={isShapeIdEqual(editingTextShape?.id, shape.id)}
            registerShapeRef={registerShapeRef}
            onShapeMouseDown={onShapeMouseDown}
            onShapeDoubleClick={onShapeDoubleClick}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onTransformStart={onTransformStart}
            onTransformEnd={onTransformEnd}
          />
        ))}

        <Group name={OVERLAY_NAME}>
          <LineEditor
            selectedShape={bendableShape}
            scale={transform.scale}
            palette={palette}
            touch={isCoarsePointer}
            onAnchorDragStart={onAnchorDragStart}
            onAnchorDragMove={onAnchorDragMove}
          />

          <SelectionRect bounds={marquee} scale={transform.scale} palette={palette} />

          <SnapGuides
            guides={snapGuides}
            transform={transform}
            viewportSize={viewportSize}
            color={palette.guide}
          />

          <PointerTrails
            laserPoints={laserPoints}
            eraserPoints={eraserPoints}
            scale={transform.scale}
            laserColor={palette.laser}
            eraserColor={palette.eraserTrail}
          />

          <LiveCursors
            cursors={liveCursors}
            scale={transform.scale}
            outlineColor={palette.cursorOutline}
            labelTextColor={palette.cursorLabelText}
          />
        </Group>

        {/* Transformer for shape scaling, constrained to at least 5px. */}
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          flipEnabled={false}
          ignoreStroke
          borderStroke={palette.selection}
          borderStrokeWidth={1.5}
          anchorStroke={palette.selection}
          anchorFill={palette.handleFill}
          anchorStrokeWidth={1.5}
          anchorSize={isCoarsePointer ? 14 : 9}
          anchorCornerRadius={isCoarsePointer ? 7 : 2}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < MIN_TRANSFORM_SIZE || newBox.height < MIN_TRANSFORM_SIZE
              ? oldBox
              : newBox
          }
        />
      </Layer>
    </Stage>
  );
}
