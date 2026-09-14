import { Stage, Layer, Transformer } from "react-konva";
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

/**
 * WhiteboardCanvas Component
 *
 * Main Konva stage rendering all shapes, editor UI, and pointer trails.
 * Handles canvas events (wheel, mouse) and delegates shape interaction to handlers.
 * Transformer is constrained to prevent micro-shapes (< 5px).
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
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      // The stage stays transparent; the wrapping element paints `bg-canvas`,
      // so the canvas follows the theme tokens like the rest of the shell.
      style={{ backgroundColor: "transparent" }}
    >
      <Layer>
        <CanvasGrid
          transform={transform}
          viewportSize={viewportSize}
          gridSize={gridSize}
        />

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

        <LineEditor
          selectedShape={bendableShape}
          scale={transform.scale}
          onAnchorDragStart={onAnchorDragStart}
          onAnchorDragMove={onAnchorDragMove}
        />

        <SelectionRect bounds={marquee} scale={transform.scale} />

        <SnapGuides
          guides={snapGuides}
          transform={transform}
          viewportSize={viewportSize}
        />

        <PointerTrails
          laserPoints={laserPoints}
          eraserPoints={eraserPoints}
          scale={transform.scale}
        />

        <LiveCursors cursors={liveCursors} />

        {/* Transformer for shape scaling/rotation, constrained to at least 5px. */}
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          flipEnabled={false}
          ignoreStroke
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
          }
        />
      </Layer>
    </Stage>
  );
}
