import { Stage, Layer, Transformer } from "react-konva";
import ShapeRenderer from "./ShapeRenderer";
import LineEditor from "./LineEditor";
import PointerTrails from "./PointerTrails";

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
 * @param {Object} selectedShape - Currently selected shape
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
  selectedShape,
  editingTextShape,
  laserPoints,
  eraserPoints,
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
    >
      <Layer>
        {shapes.map((shape) => (
          <ShapeRenderer
            key={shape.id}
            shape={shape}
            tool={tool}
            isErasing={erasingIds.includes(shape.id)}
            isEditing={editingTextShape?.id === shape.id}
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
          selectedShape={selectedShape}
          scale={transform.scale}
          onAnchorDragStart={onAnchorDragStart}
          onAnchorDragMove={onAnchorDragMove}
        />

        <PointerTrails
          laserPoints={laserPoints}
          eraserPoints={eraserPoints}
          scale={transform.scale}
        />

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
