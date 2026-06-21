import { useCallback, useRef } from "react";
import { MAX_SCALE, MIN_SCALE, SCALE_BY } from "../constants/canvas";
import { TOOLS } from "../constants/tools";
import {
  appendShape,
  deleteShapeById,
  deleteShapesById,
  getShapeById,
  updateShapeById,
} from "../domain/board/shapeMutations";
import { createImageShape, createShape, createTextShape } from "../domain/shapes/shapeFactory";
import {
  moveShapeToNode,
  normalizeShape,
  transformShapeFromNode,
  updateShapeDuringDraw,
  updateShapeText,
} from "../domain/shapes/shapeOperations";
import { DRAWABLE_TOOLS } from "../domain/shapes/shapeTypes";
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
  shapes,
  setShapes,
  pendingImageAsset,
  setPendingImageAsset,
  setShapesWithHistory,
  saveHistoryCheckpoint,
  setSelectedId,
  selectShape,
  clearSelection,
  activateTextEditing,
  finishTextEditing,
  setLaserPoints,
  setEraserPoints,
  setErasingIds,
  getErasableShapeId,
  updateShape,
}) {
  const isDrawing = useRef(false);
  const isLaserActive = useRef(false);
  const isErasing = useRef(false);
  const drawingId = useRef(null);
  const nextShapeId = useRef(1);
  const pendingEraseIds = useRef(new Set());

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
    const id = nextShapeId.current;
    nextShapeId.current += 1;
    return id;
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
      setSelectedId(id);
    },
    [setSelectedId, setTool, toolLocked]
  );

  const handleShapeMouseDown = useCallback(
    (e, id) => {
      if (tool !== TOOLS.SELECT) return;

      e.cancelBubble = true;
      selectShape(id);
    },
    [selectShape, tool]
  );

  const handleShapeDoubleClick = useCallback(
    (e, id) => {
      if (tool !== TOOLS.SELECT) return;

      const shape = getShapeById(shapes, id);
      if (shape?.type === TOOLS.TEXT) {
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
      shapes,
      tool,
      updateShape,
    ]
  );

  const handleDragStart = useCallback(() => {
    saveHistoryCheckpoint();
  }, [saveHistoryCheckpoint]);

  const handleDragMove = useCallback(
    (id, e) => {
      const node = e.target;

      setShapes((prev) =>
        updateShapeById(prev, id, (shape) => moveShapeToNode(shape, node))
      );
    },
    [setShapes]
  );

  const handleDragEnd = useCallback(
    (id, e) => {
      handleDragMove(id, e);
    },
    [handleDragMove]
  );

  const handleTransformStart = useCallback(() => {
    saveHistoryCheckpoint();
  }, [saveHistoryCheckpoint]);

  const handleTransformEnd = useCallback((id, e) => {
  const node = e.target;

  const scaleX = node.scaleX();
  const scaleY = node.scaleY();

  setShapes((prev) =>
    updateShapeById(prev, id, (shape) => ({
      ...shape,
      width: node.width() * scaleX,
      height: node.height() * scaleY,
      x: node.x(),
      y: node.y(),
    }))
  );

  node.scaleX(1);
  node.scaleY(1);
}, []);

  const handleAnchorDragStart = useCallback(() => {
    saveHistoryCheckpoint();
  }, [saveHistoryCheckpoint]);

  const handleAnchorDragMove = useCallback(
    (shapeId, pointIndex, e) => {
      const node = e.target;

      setShapes((prev) =>
        updateShapeById(prev, shapeId, (shape) => {
          const points = [...shape.points];
          points[pointIndex] = node.x() - shape.x;
          points[pointIndex + 1] = node.y() - shape.y;

          return {
            ...shape,
            points,
            version: (shape.version ?? 0) + 1,
            updatedAt: Date.now(),
          };
        })
      );
    },
    [setShapes]
  );

  const handleMouseDown = useCallback(
    (e) => {
      if (tool === TOOLS.PAN) return;

      const pos = getWorldPointerPosition();
      if (!pos) return;

      if (tool === TOOLS.SELECT) {
        if (e.target === e.target.getStage()) clearSelection();
        return;
      }

      if (tool === TOOLS.TEXT) {
        const id = createNextShapeId();
        const newShape = createTextShape({ id, point: pos, style: activeStyle });

        setShapesWithHistory((prev) => appendShape(prev, newShape));
        activateTextEditing(id);
        setTool(TOOLS.SELECT);
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
      setEraserPoints,
      setErasingIds,
      setLaserPoints,
      setPendingImageAsset,
      setShapesWithHistory,
      setTool,
      tool,
    ]
  );

  const handleMouseMove = useCallback(() => {
    const pos = getWorldPointerPosition();
    if (!pos) return;

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
  }, [getWorldPointerPosition, markShapeUnderPointer, setEraserPoints, setLaserPoints, setShapes]);

  const handleMouseUp = useCallback(() => {
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
      setSelectedId((prev) => (idsToDelete.has(prev) ? null : prev));
      schedulePointerClear();
      return;
    }

    const finishedId = drawingId.current;
    isDrawing.current = false;
    drawingId.current = null;

    if (!finishedId) return;

    setShapes((prev) =>
      updateShapeById(prev, finishedId, (shape) => normalizeShape(shape))
    );

    finishTransientTool(finishedId);
  }, [
    finishTransientTool,
    schedulePointerClear,
    setErasingIds,
    setSelectedId,
    setShapes,
    setShapesWithHistory,
  ]);

  const handleTextCommit = useCallback(
    (id, text, measuredSize) => {
      const cleanText = text.trimEnd();

      if (!cleanText.trim()) {
        setShapesWithHistory((prev) => deleteShapeById(prev, id));
        clearSelection();
        return;
      }

      updateShape(id, (shape) =>
        updateShapeText(shape, cleanText, {
          width: measuredSize ? measuredSize.width / transform.scale : shape.width,
          height: measuredSize ? measuredSize.height / transform.scale : shape.height,
        })
      );
      finishTextEditing(id);
    },
    [
      clearSelection,
      finishTextEditing,
      setShapesWithHistory,
      transform.scale,
      updateShape,
    ]
  );

  const handleTextCancel = useCallback(
    (id) => {
      const shape = getShapeById(shapes, id);

      if (!shape?.text?.trim()) {
        setShapesWithHistory((prev) => deleteShapeById(prev, id));
        setSelectedId(null);
      }

      finishTextEditing();
    },
    [finishTextEditing, setSelectedId, setShapesWithHistory, shapes]
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
    handleTextCommit,
    handleTextCancel,
    handleWheel,
  };
}
