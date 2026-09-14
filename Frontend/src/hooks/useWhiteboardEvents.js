import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_SCALE,
  MIN_SCALE,
  SCALE_BY,
  SNAP_THRESHOLD,
} from "../constants/canvas";
import { TOOLS } from "../constants/tools";
import { createClientId } from "../features/shared/id/createClientId.js";
import { OPERATION_TYPES } from "../features/realtime/operations/operationTypes.js";
import {
  appendShape,
  deleteShapeById,
  deleteShapesById,
  getShapeById,
  updateShapeById,
} from "../domain/board/shapeMutations";
import {
  boundsFromPoints,
  boundsIntersect,
  getShapeBounds,
  getShapesBoundingBox,
} from "../domain/geometry/bounds.js";
import {
  buildSnapCandidates,
  resolveSnap,
  withGridCandidates,
} from "../domain/geometry/snapping.js";
import {
  createImageShape,
  createNoteShape,
  createShape,
  createTextShape,
} from "../domain/shapes/shapeFactory";
import {
  moveShapeTo,
  moveShapeToNode,
  normalizeShape,
  transformShapeFromNode,
  updateShapeDuringDraw,
  updateShapeText,
} from "../domain/shapes/shapeOperations";
import { DRAWABLE_TOOLS, TEXT_EDITABLE_SHAPES } from "../domain/shapes/shapeTypes";
import { insertBreakpoint } from "../utils/shapeUtils";

export function useWhiteboardEvents({
  stageRef,
  laserClearTimeoutRef,
  tool,
  setTool,
  toolLocked,
  activeStyle,
  transform,
  setTransform,
  shapesRef,
  setShapes,
  pendingImageAsset,
  setPendingImageAsset,
  setShapesWithHistory,
  saveHistoryCheckpoint,
  discardLastCheckpoint,
  selectedShapeIds,
  selectShape,
  selectShapes,
  toggleShapeSelection,
  addShapesToSelection,
  removeShapesFromSelection,
  clearSelection,
  activateTextEditing,
  finishTextEditing,
  setLaserPoints,
  setEraserPoints,
  setErasingIds,
  getErasableShapeId,
  gridSizeRef,
  isSpaceHeldRef,
  updateShape,
  publishLocalOperation,
  publishPresence,
}) {
  const isDrawing = useRef(false);
  const isLaserActive = useRef(false);
  const isErasing = useRef(false);
  const drawingId = useRef(null);
  const pendingEraseIds = useRef(new Set());

  // Marquee rectangle, in world coordinates. Held in state so it can be drawn,
  // and mirrored into a ref so the pointer handlers stay stable.
  const [marquee, setMarquee] = useState(null);
  const marqueeRef = useRef(null);

  // Where every selected shape sat when a group drag began, so each frame can be
  // computed from the original positions rather than accumulating rounding.
  const dragOriginRef = useRef(null);

  // Konva fires transformend once per node in the transformer; they are
  // collected here and flushed as a single operation on the next tick.
  const pendingTransformRef = useRef([]);
  const transformFlushRef = useRef(null);

  // Selection, readable from stable callbacks without making them depend on it.
  // A changing handler identity would re-render every shape on every click.
  const selectionRef = useRef(selectedShapeIds);
  useEffect(() => {
    selectionRef.current = selectedShapeIds;
  }, [selectedShapeIds]);

  // Panning reads the transform it started from; a ref keeps the pointer
  // handlers stable while the transform changes on every frame of the pan.
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const panRef = useRef(null);

  // Alignment guides for the drag in progress, in world coordinates.
  const [snapGuides, setSnapGuides] = useState([]);

  const getWorldPointerPosition = useCallback(() => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return null;

    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
  }, [stageRef]);

  const schedulePointerClear = useCallback(() => {
    window.clearTimeout(laserClearTimeoutRef.current);
    laserClearTimeoutRef.current = window.setTimeout(() => {
      setLaserPoints([]);
      setEraserPoints([]);
    }, 450);
  }, [laserClearTimeoutRef, setEraserPoints, setLaserPoints]);

  const createNextShapeId = useCallback(() => {
    return createClientId("shape");
  }, []);

  const markShapeForErase = useCallback(
    (node) => {
      const id = getErasableShapeId(node);
      if (!id || pendingEraseIds.current.has(id)) return;

      pendingEraseIds.current.add(id);
      setErasingIds(Array.from(pendingEraseIds.current));
    },
    [getErasableShapeId, setErasingIds]
  );

  const markShapeUnderPointer = useCallback(() => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;

    markShapeForErase(stage.getIntersection(pointer));
  }, [markShapeForErase, stageRef]);

  const finishTransientTool = useCallback(
    (id) => {
      if (!toolLocked) setTool(TOOLS.SELECT);
      selectShape(id);
    },
    [selectShape, setTool, toolLocked]
  );

  /**
   * Click a shape.
   *
   * Shift toggles membership. A plain click on a shape that is *already* part of
   * a multi-shape selection deliberately leaves the selection alone — collapsing
   * it to one would make a selection impossible to drag, since the drag starts
   * with exactly this mousedown.
   */
  const handleShapeMouseDown = useCallback(
    (e, id) => {
      if (tool !== TOOLS.SELECT) return;
      if (isSpaceHeldRef?.current) return;

      e.cancelBubble = true;

      if (e.evt?.shiftKey) {
        toggleShapeSelection(id);
        return;
      }

      if (selectionRef.current.includes(String(id))) return;

      selectShape(id);
    },
    [isSpaceHeldRef, selectShape, toggleShapeSelection, tool]
  );

  const handleShapeDoubleClick = useCallback(
    (e, id) => {
      if (tool !== TOOLS.SELECT) return;

      const shape = getShapeById(shapesRef.current, id);
      if (TEXT_EDITABLE_SHAPES.has(shape?.type)) {
        activateTextEditing(id);
        setTool(TOOLS.SELECT);
        e.cancelBubble = true;
        return;
      }

      const worldPoint = getWorldPointerPosition();
      if (!worldPoint) return;

      updateShape(id, (currentShape) => insertBreakpoint(currentShape, worldPoint));
      e.cancelBubble = true;
    },
    [
      activateTextEditing,
      getWorldPointerPosition,
      setTool,
      shapesRef,
      tool,
      updateShape,
    ]
  );

  /**
   * Begin a drag.
   *
   * Konva only moves the node actually under the pointer, so everything else in
   * the selection is moved by the same delta each frame. The snapping candidates
   * are gathered once here rather than per frame — what you can snap to cannot
   * change mid-drag, and rebuilding it would walk the whole board sixty times a
   * second. Shapes being dragged are excluded, or they would snap to themselves.
   */
  const handleDragStart = useCallback(
    (id) => {
      saveHistoryCheckpoint();

      const selection = selectionRef.current;
      const anchorId = String(id);
      const movingIds =
        selection.length > 1 && selection.includes(anchorId) ? selection : [anchorId];
      const moving = new Set(movingIds);

      const startPositions = new Map();
      const movingShapes = [];
      const stationaryShapes = [];

      for (const shape of shapesRef.current) {
        if (moving.has(String(shape.id))) {
          startPositions.set(String(shape.id), { x: shape.x, y: shape.y });
          movingShapes.push(shape);
        } else {
          stationaryShapes.push(shape);
        }
      }

      const anchor = startPositions.get(anchorId);
      if (!anchor) {
        dragOriginRef.current = null;
        return;
      }

      dragOriginRef.current = {
        anchorId,
        anchor,
        startPositions,
        startBounds: getShapesBoundingBox(movingShapes),
        candidates: buildSnapCandidates(stationaryShapes),
      };
    },
    [saveHistoryCheckpoint, shapesRef]
  );

  /**
   * The offset to apply this frame, with snapping folded in.
   *
   * @returns {{x: number, y: number} | null} null when this node is not the one
   *   that started the drag
   */
  const resolveDragDelta = useCallback(
    (id, node) => {
      const origin = dragOriginRef.current;
      if (!origin || origin.anchorId !== String(id)) return null;

      const raw = {
        x: node.x() - origin.anchor.x,
        y: node.y() - origin.anchor.y,
      };

      if (!origin.startBounds) return raw;

      const proposed = {
        ...origin.startBounds,
        x: origin.startBounds.x + raw.x,
        y: origin.startBounds.y + raw.y,
      };

      // The threshold is in screen pixels, so it is divided by the zoom to keep
      // the pull feeling the same however far in or out the board is.
      const threshold = SNAP_THRESHOLD / (transformRef.current.scale || 1);
      const gridSize = gridSizeRef?.current ?? 0;
      const candidates = gridSize
        ? withGridCandidates(origin.candidates, proposed, gridSize)
        : origin.candidates;

      const snap = resolveSnap(proposed, candidates, threshold);
      setSnapGuides(snap.guides);

      return { x: raw.x + snap.dx, y: raw.y + snap.dy };
    },
    [gridSizeRef]
  );

  const applyDragDelta = useCallback(
    (delta) => {
      const { startPositions } = dragOriginRef.current;

      setShapes((prev) =>
        prev.map((shape) => {
          const start = startPositions.get(String(shape.id));
          if (!start) return shape;

          return moveShapeTo(shape, { x: start.x + delta.x, y: start.y + delta.y });
        })
      );
    },
    [setShapes]
  );

  const handleDragMove = useCallback(
    (id, e) => {
      const node = e.target;
      const delta = resolveDragDelta(id, node);

      if (!delta) {
        setShapes((prev) =>
          updateShapeById(prev, id, (shape) => moveShapeToNode(shape, node))
        );
        return;
      }

      applyDragDelta(delta);
    },
    [applyDragDelta, resolveDragDelta, setShapes]
  );

  const handleDragEnd = useCallback(
    (id, e) => {
      const delta = resolveDragDelta(id, e.target);
      setSnapGuides([]);

      if (!delta) {
        handleDragMove(id, e);

        const currentShape = getShapeById(shapesRef.current, id);
        const movedShape = currentShape ? moveShapeToNode(currentShape, e.target) : null;

        if (movedShape) {
          publishLocalOperation(OPERATION_TYPES.MOVE_SHAPE, {
            shapeId: id,
            patch: movedShape,
          });
        }
        return;
      }

      applyDragDelta(delta);

      const { startPositions } = dragOriginRef.current;
      const patches = [];

      for (const [shapeId, start] of startPositions) {
        patches.push({
          shapeId,
          patch: { x: start.x + delta.x, y: start.y + delta.y },
        });
      }

      dragOriginRef.current = null;

      // One shape keeps the dedicated MOVE_SHAPE operation it has always sent.
      if (patches.length === 1) {
        publishLocalOperation(OPERATION_TYPES.MOVE_SHAPE, {
          shapeId: patches[0].shapeId,
          patch: patches[0].patch,
        });
        return;
      }

      publishLocalOperation(OPERATION_TYPES.UPDATE_SHAPES, { patches });
    },
    [applyDragDelta, handleDragMove, publishLocalOperation, resolveDragDelta, shapesRef]
  );

  const handleTransformStart = useCallback(() => {
    saveHistoryCheckpoint();
  }, [saveHistoryCheckpoint]);

  const flushTransformPatches = useCallback(() => {
    const patches = pendingTransformRef.current;
    pendingTransformRef.current = [];
    transformFlushRef.current = null;

    if (patches.length === 0) return;

    if (patches.length === 1) {
      publishLocalOperation(OPERATION_TYPES.RESIZE_SHAPE, {
        shapeId: patches[0].shapeId,
        patch: patches[0].patch,
      });
      return;
    }

    publishLocalOperation(OPERATION_TYPES.UPDATE_SHAPES, { patches });
  }, [publishLocalOperation]);

  const handleTransformEnd = useCallback(
    (id, e) => {
      const node = e.target;
      let resizedShape = null;

      setShapes((prev) =>
        updateShapeById(prev, id, (shape) => {
          resizedShape = transformShapeFromNode(shape, node);
          return resizedShape;
        })
      );

      // Konva reports the transform as a scale on the node; it has been baked
      // into the shape above, so the node goes back to 1 or it would compound.
      node.scaleX(1);
      node.scaleY(1);

      if (!resizedShape) return;

      pendingTransformRef.current.push({ shapeId: String(id), patch: resizedShape });

      // transformend fires once per node in the transformer, so the patches are
      // gathered and sent as one operation rather than one per shape.
      if (transformFlushRef.current === null) {
        transformFlushRef.current = window.setTimeout(flushTransformPatches, 0);
      }
    },
    [flushTransformPatches, setShapes]
  );

  useEffect(
    () => () => {
      if (transformFlushRef.current !== null) {
        window.clearTimeout(transformFlushRef.current);
      }
    },
    []
  );

  const handleAnchorDragStart = useCallback(() => {
    saveHistoryCheckpoint();
  }, [saveHistoryCheckpoint]);

  const handleAnchorDragMove = useCallback(
    (shapeId, pointIndex, e) => {
      const node = e.target;
      let updatedShape = null;

      setShapes((prev) =>
        updateShapeById(prev, shapeId, (shape) => {
          const points = [...shape.points];
          points[pointIndex] = node.x() - shape.x;
          points[pointIndex + 1] = node.y() - shape.y;

          updatedShape = {
            ...shape,
            points,
            version: (shape.version ?? 0) + 1,
            updatedAt: Date.now(),
          };

          return updatedShape;
        })
      );

      if (updatedShape) {
        publishLocalOperation(OPERATION_TYPES.UPDATE_SHAPE, {
          shapeId,
          patch: updatedShape,
        });
      }
    },
    [publishLocalOperation, setShapes]
  );

  /**
   * Whether this press should pan rather than draw.
   *
   * Three ways in, matching what people already expect from canvas tools: the
   * pan tool, holding space, and the middle mouse button.
   */
  const shouldStartPan = useCallback(
    (e) => {
      if (tool === TOOLS.PAN) return true;
      if (isSpaceHeldRef?.current) return true;

      return e.evt?.button === 1;
    },
    [isSpaceHeldRef, tool],
  );

  const handleMouseDown = useCallback(
    (e) => {
      const stage = stageRef.current;

      if (shouldStartPan(e)) {
        const pointer = stage?.getPointerPosition();
        if (!pointer) return;

        e.evt?.preventDefault?.();
        panRef.current = {
          startPointer: pointer,
          startTransform: transformRef.current,
        };
        return;
      }

      const pos = getWorldPointerPosition();
      if (!pos) return;

      if (tool === TOOLS.SELECT) {
        // Only a press on empty canvas begins a marquee; a press on a shape is
        // the start of a drag and is handled by handleShapeMouseDown.
        if (e.target !== e.target.getStage()) return;

        const additive = Boolean(e.evt?.shiftKey);
        if (!additive) clearSelection();

        marqueeRef.current = { origin: pos, additive, bounds: null };
        setMarquee({ x: pos.x, y: pos.y, width: 0, height: 0 });
        return;
      }

      if (tool === TOOLS.TEXT) {
        const id = createNextShapeId();
        const newShape = createTextShape({ id, point: pos, style: activeStyle });

        setShapesWithHistory((prev) => appendShape(prev, newShape));
        publishLocalOperation(OPERATION_TYPES.CREATE_SHAPE, { shape: newShape });
        activateTextEditing(id);
        setTool(TOOLS.SELECT);
        return;
      }

      if (tool === TOOLS.NOTE) {
        const id = createNextShapeId();
        const newShape = createNoteShape({ id, point: pos, style: activeStyle });

        setShapesWithHistory((prev) => appendShape(prev, newShape));
        publishLocalOperation(OPERATION_TYPES.CREATE_SHAPE, { shape: newShape });
        activateTextEditing(id);
        if (!toolLocked) setTool(TOOLS.SELECT);
        return;
      }

      if (tool === TOOLS.IMAGE) {
        if (!pendingImageAsset) return;

        const id = createNextShapeId();
        const newShape = createImageShape({
          id,
          point: pos,
          asset: pendingImageAsset,
          style: activeStyle,
        });

        setShapesWithHistory((prev) => appendShape(prev, newShape));
        publishLocalOperation(OPERATION_TYPES.CREATE_SHAPE, { shape: newShape });
        setPendingImageAsset(null);
        finishTransientTool(id);
        return;
      }

      if (tool === TOOLS.LASER) {
        window.clearTimeout(laserClearTimeoutRef.current);
        isLaserActive.current = true;
        clearSelection();
        setLaserPoints([pos.x, pos.y]);
        return;
      }

      if (tool === TOOLS.ERASER) {
        isErasing.current = true;
        pendingEraseIds.current = new Set();
        setErasingIds([]);
        clearSelection();
        setEraserPoints([pos.x, pos.y]);
        markShapeForErase(e.target);
        markShapeUnderPointer();
        return;
      }

      if (!DRAWABLE_TOOLS.has(tool)) return;

      isDrawing.current = true;
      const id = createNextShapeId();
      drawingId.current = id;
      clearSelection();

      const newShape = createShape({
        id,
        type: tool,
        point: pos,
        style: activeStyle,
      });

      setShapesWithHistory((prev) => appendShape(prev, newShape));
    },
    [
      activateTextEditing,
      activeStyle,
      clearSelection,
      createNextShapeId,
      finishTransientTool,
      getWorldPointerPosition,
      laserClearTimeoutRef,
      markShapeForErase,
      markShapeUnderPointer,
      pendingImageAsset,
      publishLocalOperation,
      setEraserPoints,
      toolLocked,
      setErasingIds,
      setLaserPoints,
      setPendingImageAsset,
      setShapesWithHistory,
      setTool,
      shouldStartPan,
      stageRef,
      tool,
    ]
  );

  const handleMouseMove = useCallback(() => {
    const pan = panRef.current;
    if (pan) {
      const pointer = stageRef.current?.getPointerPosition();
      if (!pointer) return;

      // The pointer position is in unscaled container pixels, so the drag
      // distance is the translation directly — no division by the zoom.
      setTransform({
        scale: pan.startTransform.scale,
        x: pan.startTransform.x + (pointer.x - pan.startPointer.x),
        y: pan.startTransform.y + (pointer.y - pan.startPointer.y),
      });
      return;
    }

    const pos = getWorldPointerPosition();
    if (!pos) return;

    publishPresence({
      cursor: pos,
      status: "online",
    });

    if (marqueeRef.current) {
      const bounds = boundsFromPoints(marqueeRef.current.origin, pos);
      marqueeRef.current.bounds = bounds;
      setMarquee(bounds);
      return;
    }

    if (isLaserActive.current) {
      setLaserPoints((prev) => [...prev, pos.x, pos.y]);
      return;
    }

    if (isErasing.current) {
      setEraserPoints((prev) => [...prev, pos.x, pos.y]);
      markShapeUnderPointer();
      return;
    }

    if (!isDrawing.current) return;

    setShapes((prev) =>
      updateShapeById(prev, drawingId.current, (shape) =>
        updateShapeDuringDraw(shape, pos)
      )
    );
  }, [
    getWorldPointerPosition,
    markShapeUnderPointer,
    publishPresence,
    setEraserPoints,
    setLaserPoints,
    setShapes,
    setTransform,
    stageRef,
  ]);

  const handleMouseUp = useCallback(() => {
    if (panRef.current) {
      panRef.current = null;
      return;
    }

    const marqueeGesture = marqueeRef.current;
    if (marqueeGesture) {
      marqueeRef.current = null;
      setMarquee(null);

      const bounds = marqueeGesture.bounds;
      // A press with no drag is a plain deselect, already done on mousedown.
      if (!bounds || (bounds.width < 2 && bounds.height < 2)) return;

      const hits = shapesRef.current
        .filter((shape) => {
          const shapeBounds = getShapeBounds(shape);
          return shapeBounds !== null && boundsIntersect(bounds, shapeBounds);
        })
        .map((shape) => String(shape.id));

      if (hits.length === 0) return;

      if (marqueeGesture.additive) addShapesToSelection(hits);
      else selectShapes(hits);
      return;
    }

    if (isLaserActive.current) {
      isLaserActive.current = false;
      schedulePointerClear();
      return;
    }

    if (isErasing.current) {
      isErasing.current = false;
      const idsToDelete = new Set(pendingEraseIds.current);
      pendingEraseIds.current = new Set();
      setErasingIds([]);
      setShapesWithHistory((prev) => deleteShapesById(prev, idsToDelete));
      if (idsToDelete.size > 0) {
        publishLocalOperation(OPERATION_TYPES.DELETE_SHAPES, {
          shapeIds: Array.from(idsToDelete),
        });
      }
      removeShapesFromSelection(idsToDelete);
      schedulePointerClear();
      return;
    }

    const finishedId = drawingId.current;
    isDrawing.current = false;
    drawingId.current = null;

    if (!finishedId) return;

    let normalizedShape = null;

    setShapes((prev) =>
      updateShapeById(prev, finishedId, (shape) => {
        normalizedShape = normalizeShape(shape);
        return normalizedShape;
      })
    );

    if (normalizedShape) {
      publishLocalOperation(OPERATION_TYPES.CREATE_SHAPE, { shape: normalizedShape });
    }

    finishTransientTool(finishedId);
  }, [
    addShapesToSelection,
    finishTransientTool,
    publishLocalOperation,
    removeShapesFromSelection,
    schedulePointerClear,
    selectShapes,
    setErasingIds,
    setShapes,
    setShapesWithHistory,
    shapesRef,
  ]);

  /**
   * Abandon whatever a pointer press started, without committing it.
   *
   * Called when a second finger turns a one-finger touch into a pinch: the
   * first finger may already have begun a stroke, a marquee, an erase or a
   * shape drag. A stroke was appended locally but not yet sent to peers (that
   * happens on release), so removing it and its history checkpoint leaves no
   * trace. Text and notes are created on press and are left as they are.
   */
  const cancelPointerInteraction = useCallback(() => {
    panRef.current = null;

    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarquee(null);
    }

    if (isLaserActive.current) {
      isLaserActive.current = false;
      setLaserPoints([]);
    }

    if (isErasing.current) {
      isErasing.current = false;
      pendingEraseIds.current = new Set();
      setErasingIds([]);
      setEraserPoints([]);
    }

    const strokeId = drawingId.current;
    if (isDrawing.current && strokeId) {
      isDrawing.current = false;
      drawingId.current = null;
      setShapes((prev) => deleteShapeById(prev, strokeId));
      discardLastCheckpoint?.();
    }

    setSnapGuides([]);

    stageRef.current?.find(".shape").forEach((node) => {
      if (node.isDragging()) node.stopDrag();
    });
  }, [
    discardLastCheckpoint,
    setEraserPoints,
    setErasingIds,
    setLaserPoints,
    setShapes,
    stageRef,
  ]);

  /**
   * Commit the text overlay.
   *
   * Two shape families share this path and want opposite things. A bare text
   * shape has no body of its own, so emptying it deletes it and its box grows to
   * fit what was typed. A note is a card that happens to hold text: a blank one
   * is still a note, and its size is the user's, set by dragging the handles —
   * so it is never deleted or resized from the measured text.
   */
  const handleTextCommit = useCallback(
    (id, text, measuredSize) => {
      const cleanText = text.trimEnd();
      const isNote = getShapeById(shapesRef.current, id)?.type === TOOLS.NOTE;

      if (!cleanText.trim() && !isNote) {
        setShapesWithHistory((prev) => deleteShapeById(prev, id));
        publishLocalOperation(OPERATION_TYPES.DELETE_SHAPE, { shapeId: id });
        clearSelection();
        return;
      }

      updateShape(id, (shape) =>
        updateShapeText(
          shape,
          cleanText,
          isNote || !measuredSize
            ? { width: shape.width, height: shape.height }
            : {
                width: measuredSize.width / transform.scale,
                height: measuredSize.height / transform.scale,
              },
        )
      );
      finishTextEditing(id);
    },
    [
      clearSelection,
      finishTextEditing,
      publishLocalOperation,
      setShapesWithHistory,
      shapesRef,
      transform.scale,
      updateShape,
    ]
  );

  const handleTextCancel = useCallback(
    (id) => {
      const shape = getShapeById(shapesRef.current, id);

      // An escaped blank note stays on the board; an escaped blank text shape
      // would be invisible, so it is removed instead.
      if (!shape?.text?.trim() && shape?.type !== TOOLS.NOTE) {
        setShapesWithHistory((prev) => deleteShapeById(prev, id));
        publishLocalOperation(OPERATION_TYPES.DELETE_SHAPE, { shapeId: id });
        clearSelection();
      }

      finishTextEditing();
    },
    [
      clearSelection,
      finishTextEditing,
      publishLocalOperation,
      setShapesWithHistory,
      shapesRef,
    ]
  );

  const handleWheel = useCallback(
    (e) => {
      e.evt.preventDefault();

      const stage = stageRef.current;
      const pointer = stage?.getPointerPosition();
      if (!stage || !pointer) return;

      const oldScale = transform.scale;

      if (e.evt.ctrlKey) {
        let newScale =
          e.evt.deltaY > 0 ? oldScale / SCALE_BY : oldScale * SCALE_BY;

        newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

        const mousePointTo = {
          x: (pointer.x - transform.x) / oldScale,
          y: (pointer.y - transform.y) / oldScale,
        };

        setTransform({
          scale: newScale,
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        });

        return;
      }

      if (!e.evt.shiftKey) {
        setTransform((prev) => ({
          ...prev,
          y: prev.y - e.evt.deltaY,
        }));
        return;
      }

      setTransform((prev) => ({
        ...prev,
        x: prev.x - e.evt.deltaY,
      }));
    },
    [setTransform, stageRef, transform]
  );

  return {
    marquee,
    snapGuides,
    handleShapeMouseDown,
    handleShapeDoubleClick,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleTransformStart,
    handleTransformEnd,
    handleAnchorDragStart,
    handleAnchorDragMove,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    cancelPointerInteraction,
    handleTextCommit,
    handleTextCancel,
    handleWheel,
  };
}
