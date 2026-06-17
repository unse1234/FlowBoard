/**
 * Whiteboard Component - Main Drawing Canvas
 *
 * This is the core component that provides a full-featured digital whiteboard/canvas.
 * It uses Konva.js for efficient 2D rendering and React hooks for state management.
 *
 * Features:
 * - Multiple drawing tools (shapes, lines, pen, arrow, laser, eraser)
 * - Shape transformations (move, resize, rotate)
 * - Style customization (stroke, fill, opacity, edge style)
 * - Pan and zoom functionality
 * - Line editing with breakpoint insertion
 */

import { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Ellipse,
  Line,
  Arrow,
  Circle,
  Transformer,
} from "react-konva";
import Toolbar from "./Toolbar";
import { TOOLS } from "../constants/tools";

// Canvas zoom/scale constants
const SCALE_BY = 1.1; // Zoom multiplier for each scroll increment
const MIN_SCALE = 0.1; // Minimum zoom level (10%)
const MAX_SCALE = 5; // Maximum zoom level (500%)

const DEFAULT_STYLE = {
  stroke: "#111827",
  strokeWidth: 2,
  fill: "#ffffff",
  fillEnabled: false,
  opacity: 1,
  edgeStyle: "round",
  strokeStyle: "solid",
  bendStyle: "corner",
};

// Tailwind CSS class for style customization inputs
const STYLE_SELECT_CLASS =
  "h-8 rounded border border-gray-200 bg-white px-2 text-xs";

/**
 * Check if a shape is line-like (line, arrow, or pen)
 * Used to determine if special line handling should be applied
 */
const isLineLike = (shape) =>
  shape?.type === TOOLS.LINE ||
  shape?.type === TOOLS.ARROW ||
  shape?.type === TOOLS.PEN;

/**
 * Check if a shape can have breakpoints (editable joints)
 * Only lines and arrows support bending/editing
 */
const isBendable = (shape) =>
  shape?.type === TOOLS.LINE || shape?.type === TOOLS.ARROW;

/**
 * Get the complete style object for a shape
 * Merges default style with shape's custom style
 */
const getShapeStyle = (shape) => ({
  ...DEFAULT_STYLE,
  ...(shape?.style ?? {}),
});

/**
 * Calculate dash pattern for stroke styles
 * Converts strokeStyle setting to Konva dash array format
 */
const getStrokeDash = (style) => {
  if (style.strokeStyle === "dashed")
    return [style.strokeWidth * 5, style.strokeWidth * 3];
  if (style.strokeStyle === "dotted") return [1, style.strokeWidth * 2.5];
  return [];
};

/**
 * Get the display points for a line
 * Handles different bend styles and geometry
 */
const getLinePoints = (shape) => {
  const style = getShapeStyle(shape);
  if (style.bendStyle !== "straight" || shape.points.length <= 4) {
    return shape.points;
  }

  return [
    shape.points[0],
    shape.points[1],
    shape.points[shape.points.length - 2],
    shape.points[shape.points.length - 1],
  ];
};

/**
 * Calculate the perpendicular distance from a point to a line segment
 * Used for line editing to find the closest segment for breakpoint insertion
 */
const getDistanceToSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
};

/**
 * Insert a breakpoint (joint/vertex) on a line at the closest position to a click
 * Allows users to add corners/bends to lines by double-clicking
 *
 * @param {Object} shape - The line or arrow shape
 * @param {Object} worldPoint - The clicked point in world coordinates
 * @returns {Object} Updated shape with new breakpoint added
 */
const insertBreakpoint = (shape, worldPoint) => {
  if (!isBendable(shape)) return shape;

  // Convert world coordinates to shape-local coordinates
  const localPoint = {
    x: worldPoint.x - shape.x,
    y: worldPoint.y - shape.y,
  };
  let insertIndex = shape.points.length;
  let shortestDistance = Infinity;

  // Find the closest line segment to the click point
  for (let index = 0; index < shape.points.length - 2; index += 2) {
    const start = { x: shape.points[index], y: shape.points[index + 1] };
    const end = { x: shape.points[index + 2], y: shape.points[index + 3] };
    const distance = getDistanceToSegment(localPoint, start, end);

    if (distance < shortestDistance) {
      shortestDistance = distance;
      insertIndex = index + 2;
    }
  }

  // Insert the new point at the closest position
  const points = [...shape.points];
  points.splice(insertIndex, 0, localPoint.x, localPoint.y);

  return {
    ...shape,
    points,
    style: {
      ...getShapeStyle(shape),
      bendStyle:
        shape.style?.bendStyle === "straight"
          ? "corner"
          : getShapeStyle(shape).bendStyle,
    },
  };
};

/**
 * CustomizationPanel Component
 *
 * Left-side panel that allows users to customize the appearance of shapes.
 * Shows different options depending on whether a shape is selected or a tool is active.
 *
 * @param {string} tool - Currently selected drawing tool
 * @param {Object} selectedShape - Currently selected shape (if any)
 * @param {Object} activeStyle - Default style for new shapes
 * @param {Function} onStyleChange - Callback when style properties change
 */
function CustomizationPanel({
  tool,
  selectedShape,
  activeStyle,
  onStyleChange,
}) {
  // Use selected shape's style if available, otherwise use active tool style
  const style = selectedShape ? getShapeStyle(selectedShape) : activeStyle;

  // Determine if current context supports fill (rectangles and circles)
  const canFill = selectedShape
    ? selectedShape.type === TOOLS.RECT || selectedShape.type === TOOLS.CIRCLE
    : tool === TOOLS.RECT || tool === TOOLS.CIRCLE;

  // Determine if current context supports line bending (lines and arrows)
  const canBend = selectedShape
    ? isBendable(selectedShape)
    : tool === TOOLS.LINE || tool === TOOLS.ARROW;

  // Tailwind-based panel that uses the global fonts imported in index.css
  const opacityPct = Math.round((style.opacity ?? 1) * 100);

  return (
    <div className="fixed right-3 top-1/2 -translate-y-1/2 z-50">
      <div className="w-56 bg-white border border-gray-200 rounded-xl p-4 shadow font-syne">
        <div className="text-xs uppercase tracking-widest text-gray-500 mb-4">
          {selectedShape ? "Selection" : "Tool Style"}
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-2 font-syne-mono">
            <div>Stroke</div>
            <div className="text-gray-800">{style.stroke}</div>
          </div>
          <div className="h-8 rounded-md border border-gray-200 overflow-hidden relative">
            <div
              className="absolute inset-0"
              style={{ background: style.stroke }}
            />
            <input
              type="color"
              value={style.stroke}
              onChange={(e) => onStyleChange("stroke", e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-2 font-syne-mono">
            <div>Width</div>
            <div className="text-gray-800">{style.strokeWidth}px</div>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            value={style.strokeWidth}
            onChange={(e) =>
              onStyleChange("strokeWidth", Number(e.target.value))
            }
            className="w-full"
          />
        </div>

        <div className="h-px bg-gray-100 my-3" />

        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-gray-600">Background</div>
          <button
            onClick={() => onStyleChange("fillEnabled", !style.fillEnabled)}
            className={`w-9 h-5 rounded-full flex items-center px-1  ${style.fillEnabled ? "bg-black" : "bg-gray-300"} `}
          >
            <span
              className={`  w-3 h-3 bg-white rounded-full ${style.fillEnabled ? "translate-x-3.5" : ""}`}
            />
          </button>
        </div>

        <div
          className={`${style.fillEnabled ? "opacity-100 pointer-events-auto" : "opacity-30 pointer-events-none"} mb-3`}
        >
          <div className="flex justify-between text-xs text-gray-600 mb-2 font-syne-mono">
            <div>Fill</div>
            <div className="text-gray-800">{style.fill}</div>
          </div>
          <div className="h-8 rounded-md border border-gray-200 overflow-hidden relative">
            <div
              className="absolute inset-0"
              style={{ background: style.fill }}
            />
            <input
              type="color"
              value={style.fill}
              disabled={!style.fillEnabled}
              onChange={(e) => onStyleChange("fill", e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
        </div>

        <div className="h-px bg-gray-100 my-3" />

        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-2 font-syne-mono">
            <div>Opacity</div>
            <div className="text-gray-800">{opacityPct}%</div>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={opacityPct}
            onChange={(e) =>
              onStyleChange("opacity", Number(e.target.value) / 100)
            }
            className="w-full"
          />
        </div>

        <div className="h-px bg-gray-100 my-3" />

        <div className="mb-3">
          <div className="text-xs text-gray-600 mb-2">Edges</div>
          <div className="flex gap-2">
            <button
              onClick={() => onStyleChange("edgeStyle", "round")}
              className={`flex-1 text-xs py-2 rounded-md border ${style.edgeStyle === "round" ? "bg-black text-white" : "border-gray-200"}`}
            >
              Round
            </button>
            <button
              onClick={() => onStyleChange("edgeStyle", "sharp")}
              className={`flex-1 text-xs py-2 rounded-md border ${style.edgeStyle === "sharp" ? "bg-black text-white" : "border-gray-200"}`}
            >
              Sharp
            </button>
          </div>
        </div>

        <div className="mb-3">
          <div className="text-xs text-gray-600 mb-2">Stroke</div>
          <div className="flex gap-2">
            {["solid", "dashed", "dotted"].map((t) => (
              <button
                key={t}
                onClick={() => onStyleChange("strokeStyle", t)}
                className={`flex-1 text-xs py-2 rounded-md border ${style.strokeStyle === t ? "bg-black text-white" : "border-gray-200"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {canBend && (
          <div className="mb-2">
            <div className="text-xs text-gray-600 mb-2">Bend</div>
            <div className="flex gap-2">
              {["curve", "straight", "arc"].map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    onStyleChange("bendStyle", t === "curve" ? "corner" : t)
                  }
                  className={`flex-1 text-xs py-2 rounded-md border ${style.bendStyle === (t === "curve" ? "corner" : t) ? "bg-black text-white" : "border-gray-200"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Main Whiteboard Component
 *
 * The primary drawing canvas component that manages:
 * - Canvas rendering using Konva
 * - Shape creation and management
 * - Selection and transformation
 * - Pan and zoom controls
 * - Style customization
 */
export default function Whiteboard() {
  // ========== REF HOOKS (persist across renders) ==========
  const stageRef = useRef(null); // Reference to Konva Stage
  const transformerRef = useRef(null); // Reference to transformation tool
  const shapeRefs = useRef({}); // Map of shape ID to shape node reference
  const laserClearTimeout = useRef(null); // Timeout for clearing laser pointer

  // ========== STATE HOOKS ==========
  // Current tool selection
  const [tool, setTool] = useState(TOOLS.SELECT);

  // ID of currently selected shape (for editing)
  const [selectedId, setSelectedId] = useState(null);

  // Default style for new shapes (not yet drawn)
  const [activeStyle, setActiveStyle] = useState(DEFAULT_STYLE);
  // Current font selection for text and UI (kept in state so Toolbar can update it)
  const [font, setFont] = useState("Syne");

  // Tool lock state: when unlocked, tool reverts to select after one draw
  const [toolLocked, setToolLocked] = useState(false);

  // Canvas transformation (position and zoom level)
  const [transform, setTransform] = useState({
    x: 0,
    y: 0,
    scale: 1,
  });

  // Array of all shapes currently on canvas
  const [shapes, setShapes] = useState([]);

  // Undo/redo history stacks for shapes
  const history = useRef([]);
  const redoStack = useRef([]);

  const pushShapesHistory = (prevShapes) => {
    history.current.push(prevShapes);
    if (history.current.length > 50) history.current.shift();
    redoStack.current = [];
  };

  const setShapesWithHistory = (updater) => {
    setShapes((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next !== prev) {
        pushShapesHistory(prev);
      }
      return next;
    });
  };

  const undo = () => {
    if (!history.current.length) return;
    const previous = history.current.pop();
    redoStack.current.push(shapes);
    setShapes(previous);
    setSelectedId(null);
  };

  const redo = () => {
    if (!redoStack.current.length) return;
    const next = redoStack.current.pop();
    history.current.push(shapes);
    setShapes(next);
    setSelectedId(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeElement = document.activeElement;
      if (activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName)) {
        return;
      }
      if (e.key === "ArrowLeft") {
        undo();
      }
      if (e.key === "ArrowRight") {
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shapes]);

  // Points for laser pointer trail (temporary visual)
  const [laserPoints, setLaserPoints] = useState([]);

  // Points for eraser trail (temporary visual)
  const [eraserPoints, setEraserPoints] = useState([]);

  // IDs of shapes currently being highlighted for deletion
  // IDs of shapes currently being highlighted for deletion
  const [erasingIds, setErasingIds] = useState([]);

  // ========== MUTABLE REFS (flags and IDs) ==========
  const isDrawing = useRef(false); // Is user currently drawing?
  const isLaserActive = useRef(false); // Is laser pointer tool active?
  const isErasing = useRef(false); // Is eraser tool active?
  const drawingId = useRef(null); // ID of shape currently being drawn
  const nextShapeId = useRef(1); // Counter for generating unique shape IDs
  const pendingEraseIds = useRef(new Set()); // Set of shapes marked for deletion

  // Get the currently selected shape object from the shapes array
  const selectedShape = shapes.find((shape) => shape.id === selectedId);

  // ========== EFFECTS ==========
  /**
   * Update transformer selection when selected shape changes
   * Transformer handles resize/rotate handles for selected shapes
   */
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    // Only show transformer for non-bendable shapes (lines are edited differently)
    const selectedNode = isBendable(selectedShape)
      ? null
      : shapeRefs.current[selectedId];
    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, selectedShape, shapes]);

  // ========== UTILITY FUNCTIONS ==========
  /**
   * Convert mouse pointer position to world coordinates (canvas coordinates)
   * Accounts for canvas pan and zoom
   */
  const getWorldPointerPosition = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return null;

    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
  };

  /**
   * Get bounding box of a shape with correct coordinate order
   * Handles negative dimensions (when drawing from bottom-right to top-left)
   */
  const getBox = (shape) => ({
    x: Math.min(shape.x, shape.x + shape.width),
    y: Math.min(shape.y, shape.y + shape.height),
    width: Math.abs(shape.width),
    height: Math.abs(shape.height),
  });

  /**
   * Normalize box-shaped objects (rectangles and circles)
   * Fixes positions to ensure coordinates are always positive
   * Needed because shapes can be drawn from any corner
   */
  const normalizeBoxShape = (shape) => {
    if (shape.type !== TOOLS.RECT && shape.type !== TOOLS.CIRCLE) return shape;

    const box = getBox(shape);
    return {
      ...shape,
      ...box,
    };
  };

  /**
   * Update a single shape with a callback function
   * Finds the shape by ID and applies the updater function to it
   *
   * @param {number} id - Shape ID
   * @param {Function} updater - Function that takes shape and returns updated shape
   */
  const updateShape = (id, updater) => {
    setShapesWithHistory((prev) =>
      prev.map((shape) => (shape.id === id ? updater(shape) : shape)),
    );
  };

  /**
   * Handle style changes for both active tool and selected shape
   * Updates the default style for new shapes and the selected shape's style
   */
  const handleStyleChange = (key, value) => {
    // Update active style for future shapes
    setActiveStyle((prev) => ({
      ...prev,
      [key]: value,
    }));

    // If a shape is selected, update its style too
    if (!selectedId) return;

    updateShape(selectedId, (shape) => ({
      ...shape,
      style: {
        ...getShapeStyle(shape),
        [key]: value,
      },
    }));
  };

  /**
   * Mark a shape node for erasure in the pending set
   * Used by eraser tool to highlight shapes being erased
   */
  const markShapeForErase = (node) => {
    if (!node?.hasName?.("shape")) return;

    const id = Number(node.id());
    if (!id || pendingEraseIds.current.has(id)) return;

    pendingEraseIds.current.add(id);
    setErasingIds(Array.from(pendingEraseIds.current));
  };

  /**
   * Find and mark the shape under the current pointer position for erasure
   */
  const markShapeUnderPointer = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;

    markShapeForErase(stage.getIntersection(pointer));
  };

  /**
   * Schedule clearing of laser and eraser visual trails
   * They fade away after 450ms of inactivity
   */
  const schedulePointerClear = () => {
    window.clearTimeout(laserClearTimeout.current);
    laserClearTimeout.current = window.setTimeout(() => {
      setLaserPoints([]);
      setEraserPoints([]);
    }, 450);
  };

  // ========== EVENT HANDLERS ==========
  /**
   * Handle mouse down on a shape
   * In SELECT mode, selects the shape; other modes ignore this
   */
  const handleShapeMouseDown = (e, id) => {
    if (tool === TOOLS.SELECT) {
      e.cancelBubble = true;
      setSelectedId(id);
    }
  };

  /**
   * Handle double-click on a shape to edit breakpoints
   * Only works in SELECT mode on bendable shapes (lines/arrows)
   */
  const handleShapeDoubleClick = (e, id) => {
    if (tool !== TOOLS.SELECT) return;

    const worldPoint = getWorldPointerPosition();
    if (!worldPoint) return;

    // Insert a new breakpoint at the closest position on the line
    updateShape(id, (shape) => insertBreakpoint(shape, worldPoint));
    e.cancelBubble = true;
  };

  /**
   * Handle shape drag end - update position when shape is moved
   * Different handling for lines (adjust anchor point) vs other shapes
   */
  const handleDragEnd = (id, e) => {
    const node = e.target;

    updateShape(id, (shape) => {
      // Lines maintain their relative points
      if (isLineLike(shape)) {
        return {
          ...shape,
          x: node.x(),
          y: node.y(),
        };
      }

      // Circles need position offset by half their size (centered)
      if (shape.type === TOOLS.CIRCLE) {
        return {
          ...shape,
          x: node.x() - shape.width / 2,
          y: node.y() - shape.height / 2,
        };
      }

      // Other shapes (rectangles) use direct position
      return {
        ...shape,
        x: node.x(),
        y: node.y(),
      };
    });
  };

  /**
   * Handle transformation end (resize/rotate via transformer handles)
   * Applies scale to shape dimensions and resets transform node scale
   */
  const handleTransformEnd = (id, e) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset the transform node's scale (apply it to shape dimensions instead)
    node.scaleX(1);
    node.scaleY(1);

    updateShape(id, (shape) => {
      // Lines: scale their point coordinates
      if (isLineLike(shape)) {
        return {
          ...shape,
          x: node.x(),
          y: node.y(),
          points: shape.points.map((point, index) =>
            index % 2 === 0 ? point * scaleX : point * scaleY,
          ),
        };
      }

      // Circles: scale size and keep centered
      if (shape.type === TOOLS.CIRCLE) {
        const width = Math.max(5, shape.width * scaleX);
        const height = Math.max(5, shape.height * scaleY);

        return {
          ...shape,
          x: node.x() - width / 2,
          y: node.y() - height / 2,
          width,
          height,
        };
      }

      // Rectangles: scale dimensions directly
      return {
        ...shape,
        x: node.x(),
        y: node.y(),
        width: Math.max(5, shape.width * scaleX),
        height: Math.max(5, shape.height * scaleY),
      };
    });
  };

  /**
   * Handle dragging of line breakpoints (editing joints)
   * Updates the specific point coordinates when breakpoint is moved
   */
  const handleAnchorDragMove = (shapeId, pointIndex, e) => {
    const node = e.target;

    updateShape(shapeId, (shape) => {
      const points = [...shape.points];
      // Update the breakpoint coordinates relative to shape position
      points[pointIndex] = node.x() - shape.x;
      points[pointIndex + 1] = node.y() - shape.y;

      return {
        ...shape,
        points,
      };
    });
  };

  /**
   * Main canvas mouse down handler
   * Routes to appropriate tool handler (select, draw, laser, eraser)
   */
  const handleMouseDown = (e) => {
    if (tool === TOOLS.PAN) return; // Pan not yet implemented

    const pos = getWorldPointerPosition();
    if (!pos) return;

    // SELECT tool: deselect if clicking on empty canvas
    if (tool === TOOLS.SELECT) {
      if (e.target === e.target.getStage()) setSelectedId(null);
      return;
    }

    // LASER tool: initialize laser pointer trail
    if (tool === TOOLS.LASER) {
      window.clearTimeout(laserClearTimeout.current);
      isLaserActive.current = true;
      setSelectedId(null);
      setLaserPoints([pos.x, pos.y]);
      return;
    }

    // ERASER tool: initialize eraser trail
    if (tool === TOOLS.ERASER) {
      isErasing.current = true;
      pendingEraseIds.current = new Set();
      setErasingIds([]);
      setSelectedId(null);
      setEraserPoints([pos.x, pos.y]);
      markShapeForErase(e.target);
      markShapeUnderPointer();
      return;
    }

    // DRAWING tools: initialize new shape
    isDrawing.current = true;
    const id = nextShapeId.current;
    nextShapeId.current += 1;
    drawingId.current = id;
    setSelectedId(null);

    // Create new shape with initial position and active style
    const newShape = {
      id,
      type: tool,
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      points: [0, 0],
      style: { ...activeStyle },
    };

    setShapesWithHistory((prev) => [...prev, newShape]);
  };

  /**
   * Handle canvas mouse move
   * Updates drawing, laser pointer, or eraser based on active tool
   */
  const handleMouseMove = () => {
    const pos = getWorldPointerPosition();
    if (!pos) return;

    // LASER tool: add to pointer trail
    if (isLaserActive.current) {
      setLaserPoints((prev) => [...prev, pos.x, pos.y]);
      return;
    }

    // ERASER tool: add to eraser trail and find shapes to delete
    if (isErasing.current) {
      setEraserPoints((prev) => [...prev, pos.x, pos.y]);
      markShapeUnderPointer();
      return;
    }

    // DRAWING tools: update shape being drawn
    if (!isDrawing.current) return;

    setShapes((prev) => {
      return prev.map((shape) => {
        if (shape.id !== drawingId.current) return shape;

        // RECT/CIRCLE: update width and height based on pointer
        if (shape.type === TOOLS.RECT || shape.type === TOOLS.CIRCLE) {
          return {
            ...shape,
            width: pos.x - shape.x,
            height: pos.y - shape.y,
          };
        }

        // LINE/ARROW: create line from start to end point
        if (shape.type === TOOLS.LINE || shape.type === TOOLS.ARROW) {
          return {
            ...shape,
            points: [0, 0, pos.x - shape.x, pos.y - shape.y],
          };
        }

        // PEN: add to polyline, accumulating points
        if (shape.type === TOOLS.PEN) {
          return {
            ...shape,
            points: [...shape.points, pos.x - shape.x, pos.y - shape.y],
          };
        }

        return shape;
      });
    });
  };

  /**
   * Main canvas mouse up handler
   * Finalizes drawing, laser pointer, or eraser based on active tool
   */
  const handleMouseUp = () => {
    // LASER tool: mark for clearing
    if (isLaserActive.current) {
      isLaserActive.current = false;
      schedulePointerClear();
      return;
    }

    // ERASER tool: delete all marked shapes
    if (isErasing.current) {
      isErasing.current = false;
      const idsToDelete = new Set(pendingEraseIds.current);
      pendingEraseIds.current = new Set();
      setErasingIds([]);
      // Remove all marked shapes from canvas
      setShapesWithHistory((prev) => prev.filter((shape) => !idsToDelete.has(shape.id)));
      setSelectedId((prev) => (idsToDelete.has(prev) ? null : prev));
      schedulePointerClear();
      return;
    }

    // DRAWING tools: finalize the shape
    const finishedId = drawingId.current;
    isDrawing.current = false;
    drawingId.current = null;

    if (!finishedId) return;

    // Normalize box shapes (fix coordinate issues from drawing backwards)
    setShapes((prev) =>
      prev.map((shape) =>
        shape.id === finishedId ? normalizeBoxShape(shape) : shape,
      ),
    );

    // If tool is not locked, switch back to SELECT and select the new shape
    if (!toolLocked) {
      setTool(TOOLS.SELECT);
      setSelectedId(finishedId);
    } else {
      // If locked, keep the shape selected
      setSelectedId(finishedId);
    }
  };

  /**
   * Handle mouse wheel events for zooming and panning
   * Ctrl+Wheel = Zoom
   * Shift+Wheel = Horizontal pan
   * Wheel = Vertical pan
   */
  const handleWheel = (e) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;

    const oldScale = transform.scale;

    // ZOOM: Ctrl+wheel zoom in/out
    if (e.evt.ctrlKey) {
      // Calculate new zoom level
      let newScale =
        e.evt.deltaY > 0 ? oldScale / SCALE_BY : oldScale * SCALE_BY;

      // Clamp to min/max zoom
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

      // Calculate the point that should remain under the cursor
      const mousePointTo = {
        x: (pointer.x - transform.x) / oldScale,
        y: (pointer.y - transform.y) / oldScale,
      };

      // Update transform keeping zoom center
      setTransform({
        scale: newScale,
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });

      return;
    }

    // PAN VERTICALLY: Regular wheel scrolls up/down
    if (!e.evt.shiftKey) {
      setTransform((prev) => ({
        ...prev,
        y: prev.y - e.evt.deltaY,
      }));
      return;
    }

    // PAN HORIZONTALLY: Shift+wheel scrolls left/right
    setTransform((prev) => ({
      ...prev,
      x: prev.x - e.evt.deltaY,
    }));
  };

  // ========== RENDERING FUNCTIONS ==========
  /**
   * Render a shape as a Konva component
   * Handles different shape types with appropriate rendering logic
   *
   * @param {Object} shape - Shape object to render
   * @returns {JSX.Element} Konva shape component
   */
  const renderShape = (shape) => {
    const style = getShapeStyle(shape);
    const dash = getStrokeDash(style);
    const isErasingShape = erasingIds.includes(shape.id);
    const edgeIsRound = style.edgeStyle === "round";

    // Common props shared by all shape types
    const commonProps = {
      id: String(shape.id),
      name: "shape",
      // Store reference to this node for transformer and selection
      ref: (node) => {
        if (node) {
          shapeRefs.current[shape.id] = node;
        } else {
          delete shapeRefs.current[shape.id];
        }
      },
      draggable: tool === TOOLS.SELECT, // Only draggable in select mode
      opacity: isErasingShape ? 0.25 : style.opacity, // Fade when being erased
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      dash, // For dashed/dotted lines
      hitStrokeWidth: isLineLike(shape) ? Math.max(style.strokeWidth, 20) : undefined,
      // Mouse event handlers
      onMouseDown: (e) => handleShapeMouseDown(e, shape.id),
      onTap: (e) => handleShapeMouseDown(e, shape.id),
      onDblClick: (e) => handleShapeDoubleClick(e, shape.id),
      onDblTap: (e) => handleShapeDoubleClick(e, shape.id),
      onDragMove: (e) => handleDragEnd(shape.id, e),
      onDragEnd: (e) => handleDragEnd(shape.id, e),
      onTransformEnd: (e) => handleTransformEnd(shape.id, e),
    };

    // Render different shape types
    if (shape.type === TOOLS.RECT) {
      const box = getBox(shape);

      return (
        <Rect
          key={shape.id}
          {...commonProps}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill={style.fillEnabled ? style.fill : undefined}
          cornerRadius={edgeIsRound ? 12 : 0} // Round or sharp corners
        />
      );
    }

    // CIRCLE: Render as Konva Ellipse (allows non-uniform scaling)
    if (shape.type === TOOLS.CIRCLE) {
      const box = getBox(shape);

      return (
        <Ellipse
          key={shape.id}
          {...commonProps}
          x={box.x + box.width / 2} // Center X
          y={box.y + box.height / 2} // Center Y
          radiusX={box.width / 2}
          radiusY={box.height / 2}
          fill={style.fillEnabled ? style.fill : undefined}
        />
      );
    }

    // ARROW: Line with arrowhead
    if (shape.type === TOOLS.ARROW) {
      return (
        <Arrow
          key={shape.id}
          {...commonProps}
          x={shape.x}
          y={shape.y}
          points={getLinePoints(shape)}
          fill={style.stroke} // Arrowhead color
          pointerLength={Math.max(10, style.strokeWidth * 5)} // Size of arrowhead
          pointerWidth={Math.max(10, style.strokeWidth * 5)}
          lineCap={edgeIsRound ? "round" : "butt"}
          lineJoin={edgeIsRound ? "round" : "miter"}
          tension={style.bendStyle === "arc" ? 0.45 : 0} // Curve for arc style
        />
      );
    }

    // LINE or PEN: Polyline
    if (shape.type === TOOLS.LINE || shape.type === TOOLS.PEN) {
      return (
        <Line
          key={shape.id}
          {...commonProps}
          x={shape.x}
          y={shape.y}
          // PEN accumulates all points; LINE uses simplified geometry
          points={
            shape.type === TOOLS.PEN ? shape.points : getLinePoints(shape)
          }
          lineCap={edgeIsRound ? "round" : "butt"}
          lineJoin={edgeIsRound ? "round" : "miter"}
          // Curved lines use tension; pen drawing stays as-is
          tension={
            shape.type !== TOOLS.PEN && style.bendStyle === "arc" ? 0.45 : 0
          }
        />
      );
    }

    return null;
  };

  /**
   * Render interactive line editor for bendable shapes
   * Shows skeleton line and draggable breakpoints for line/arrow editing
   */
  const renderLineEditor = () => {
    if (!isBendable(selectedShape)) return null;

    // Scale handle size based on zoom level (stays visible when zoomed)
    const handleRadius = 6 / transform.scale;
    const skeletonWidth = 1.5 / transform.scale;
    const style = getShapeStyle(selectedShape);

    return (
      <>
        {/* Skeleton showing line structure */}
        <Line
          x={selectedShape.x}
          y={selectedShape.y}
          points={selectedShape.points}
          stroke="#2563eb" // Blue skeleton
          strokeWidth={skeletonWidth}
          dash={[8 / transform.scale, 6 / transform.scale]} // Dashed pattern
          tension={style.bendStyle === "arc" ? 0.45 : 0}
          listening={false} // Doesn't block clicks
        />
        {/* Draggable breakpoints (joints) on the line */}
        {selectedShape.points.map((point, index) => {
          if (index % 2 !== 0) return null; // Skip Y coordinates (every other index is X)

          return (
            <Circle
              key={`${selectedShape.id}-${index}`}
              x={selectedShape.x + point}
              y={selectedShape.y + selectedShape.points[index + 1]}
              radius={handleRadius}
              fill="#ffffff" // White center
              stroke="#2563eb" // Blue border
              strokeWidth={2 / transform.scale}
              draggable
              onMouseDown={(e) => {
                e.cancelBubble = true;
              }}
              onDragMove={(e) =>
                handleAnchorDragMove(selectedShape.id, index, e)
              }
            />
          );
        })}
      </>
    );
  };

  // ========== MAIN RENDER ==========
  return (
    <>
      {/* Toolbar for tool selection */}
      <Toolbar
        tool={tool}
        setTool={setTool}
        font={font}
        setFont={setFont}
        toolLocked={toolLocked}
        setToolLocked={setToolLocked}
      />

      {/* Left panel for style customization */}
      <CustomizationPanel
        tool={tool}
        selectedShape={selectedShape}
        activeStyle={activeStyle}
        onStyleChange={handleStyleChange}
      />

      {/* Bottom-left zoom percentage display */}
          <div className="fixed bottom-3 left-3 z-50 rounded-md bg-black/70 px-3 py-2 text-sm text-white flex items-center gap-2">
        <div>{Math.round(transform.scale * 100)}%</div>
        <button
          type="button"
          onClick={undo}
          className="rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={redo}
          className="rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
        >
          Redo
        </button>
      </div>

      {/* Main Konva Stage (canvas) */}
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        x={transform.x}
        y={transform.y}
        scaleX={transform.scale}
        scaleY={transform.scale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <Layer>
          {/* Render all shapes */}
          {shapes.map(renderShape)}

          {/* Render line editor UI (skeleton and breakpoints) */}
          {renderLineEditor()}

          {/* Laser pointer trail (temporary visual effect) */}
          {laserPoints.length > 2 && (
            <Line
              points={laserPoints}
              stroke="#ef4444" // Red laser
              strokeWidth={3 / transform.scale}
              opacity={0.85}
              lineCap="round"
              lineJoin="round"
              shadowBlur={10 / transform.scale} // Glow effect
              shadowColor="#ef4444"
              listening={false} // Doesn't interfere with clicks
            />
          )}

          {/* Eraser trail (temporary visual effect while erasing) */}
          {eraserPoints.length > 2 && (
            <Line
              points={eraserPoints}
              stroke="	#C0C0C0" // silver eraser
              strokeWidth={6 / transform.scale} // Thicker than laser
              opacity={0.5} // More transparent
              lineCap="round"
              lineJoin="round"
              shadowBlur={8 / transform.scale}
              shadowColor="	#C0C0C0"
              listening={false}
            />
          )}

          {/* Transformer handles for selected shapes (resize/rotate) */}
          <Transformer
            ref={transformerRef}
            rotateEnabled={false} // Disable rotation
            flipEnabled={false} // Disable flipping
            ignoreStroke // Don't count stroke in size
            // Prevent shapes from becoming too small
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
            }
          />
        </Layer>
      </Stage>
    </>
  );
}
