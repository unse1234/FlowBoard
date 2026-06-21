import { useCallback, useRef, useState } from "react";
import { DEFAULT_STYLE } from "../constants/canvas";
import { TOOLS } from "../constants/tools";
import { deleteShapeById, updateShapeById } from "../domain/board/shapeMutations";
import { loadImageAsset } from "../domain/images/imageAssets";
import { updateShapeStyle } from "../domain/shapes/shapeOperations";
import { useBoardSelection } from "./useBoardSelection";
import { useHistory } from "./useHistory";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useShapeRegistry } from "./useShapeRegistry";
import { useWhiteboardEvents } from "./useWhiteboardEvents";

export function useWhiteboard() {
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const laserClearTimeout = useRef(null);

  const [tool, setTool] = useState(TOOLS.SELECT);
  const [activeStyle, setActiveStyle] = useState(DEFAULT_STYLE);
  const [font, setFont] = useState(DEFAULT_STYLE.fontFamily);
  const [toolLocked, setToolLocked] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [shapes, setShapes] = useState([]);
  const [pendingImageAsset, setPendingImageAsset] = useState(null);
  const [laserPoints, setLaserPoints] = useState([]);
  const [eraserPoints, setEraserPoints] = useState([]);
  const [erasingIds, setErasingIds] = useState([]);

  const {
    selectedId,
    setSelectedId,
    selectedShape,
    editingTextId,
    editingTextShape,
    selectShape,
    clearSelection,
    activateTextEditing,
    finishTextEditing,
  } = useBoardSelection(shapes);

  const { registerShapeRef } = useShapeRegistry({
    selectedId,
    selectedShape,
    editingTextId,
    transformerRef,
  });

  const { setShapesWithHistory, saveHistoryCheckpoint, undo, redo } = useHistory({
    shapes,
    setShapes,
    setSelectedId,
  });

  const updateShape = useCallback(
    (id, updater) => {
      setShapesWithHistory((prev) => updateShapeById(prev, id, updater));
    },
    [setShapesWithHistory]
  );

  const deleteSelectedShape = useCallback(() => {
    if (!selectedId) return;

    setShapesWithHistory((prev) => deleteShapeById(prev, selectedId));
    clearSelection();
  }, [clearSelection, selectedId, setShapesWithHistory]);

  useKeyboardShortcuts({ undo, redo, onDelete: deleteSelectedShape });

  const handleStyleChange = useCallback(
    (key, value) => {
      setActiveStyle((prev) => ({
        ...prev,
        [key]: value,
      }));

      if (key === "fontFamily") setFont(value);
      if (!selectedId) return;

      updateShape(selectedId, (shape) => updateShapeStyle(shape, { [key]: value }));
    },
    [selectedId, updateShape]
  );

  const findErasableNode = useCallback((node) => {
    let current = node;
    const stage = stageRef.current;

    while (current && current !== stage) {
      if (current.hasName?.("shape")) return current;
      current = current.getParent?.();
    }

    return null;
  }, []);

  const getErasableShapeId = useCallback(
    (node) => {
      const shapeNode = findErasableNode(node);
      if (!shapeNode) return null;

      const id = Number(shapeNode.id());
      return id || null;
    },
    [findErasableNode]
  );

  const handleImageFileSelected = useCallback(
    async (file) => {
      if (!file?.type?.startsWith("image/")) return;

      const asset = await loadImageAsset(file);
      setPendingImageAsset(asset);
      setTool(TOOLS.IMAGE);
      clearSelection();
    },
    [clearSelection]
  );

  const events = useWhiteboardEvents({
    stageRef,
    laserClearTimeoutRef: laserClearTimeout,
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
  });

  return {
    stageRef,
    transformerRef,
    registerShapeRef,
    tool,
    setTool,
    selectedShape,
    editingTextShape,
    activeStyle,
    font,
    setFont,
    toolLocked,
    setToolLocked,
    transform,
    shapes,
    pendingImageAsset,
    laserPoints,
    eraserPoints,
    erasingIds,
    undo,
    redo,
    handleStyleChange,
    handleImageFileSelected,
    ...events,
  };
}
