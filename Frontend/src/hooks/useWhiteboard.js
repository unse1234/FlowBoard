import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_STYLE } from "../constants/canvas";
import { TOOLS } from "../constants/tools";
import {
  deleteShapeById,
  updateShapeById,
} from "../domain/board/shapeMutations";
import { loadImageAsset } from "../domain/images/imageAssets";
import { updateShapeStyle } from "../domain/shapes/shapeOperations";
import { PersistenceManager } from "../features/persistence/PersistenceManager.js";
import { LocalStorageAdapter } from "../features/persistence/storage/LocalStorageAdapter.js";
import {
  buildCollaborationLink,
  createCollaborationRoomId,
  resolveCollaborationRoomId,
  resolveLocalBoardId,
} from "../features/realtime/config/realtimeConfig.js";
import { useRealtimeCollaboration } from "../features/realtime/hooks/useRealtimeCollaboration.js";
import { OPERATION_TYPES } from "../features/realtime/operations/operationTypes.js";
import { useBoardSelection } from "./useBoardSelection";
import { useHistory } from "./useHistory";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useShapeRegistry } from "./useShapeRegistry";
import { useWhiteboardEvents } from "./useWhiteboardEvents";

export function useWhiteboard() {
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const laserClearTimeout = useRef(null);
  const localBoardId = useMemo(() => resolveLocalBoardId(), []);
  const [collaborationRoomId, setCollaborationRoomId] = useState(() =>
    resolveCollaborationRoomId(),
  );
  const boardId = collaborationRoomId ?? localBoardId;
  const pendingCollaborationSeedRef = useRef(null);
  const [collaborationLink, setCollaborationLink] = useState(() =>
    collaborationRoomId ? buildCollaborationLink(collaborationRoomId) : "",
  );
  const [collaborationLinkCopied, setCollaborationLinkCopied] = useState(false);
  const persistenceManager = useMemo(
    () =>
      new PersistenceManager({
        storage: new LocalStorageAdapter(),
      }),
    [],
  );

  const [tool, setTool] = useState(TOOLS.SELECT);
  const [activeStyle, setActiveStyle] = useState(DEFAULT_STYLE);
  const [font, setFont] = useState(DEFAULT_STYLE.fontFamily);
  const [toolLocked, setToolLocked] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [shapes, setShapesState] = useState(
    () => persistenceManager.loadBoard(boardId)?.shapes ?? [],
  );
  const shapesRef = useRef(shapes);
  const [pendingImageAsset, setPendingImageAsset] = useState(null);
  const [laserPoints, setLaserPoints] = useState([]);
  const [eraserPoints, setEraserPoints] = useState([]);
  const [erasingIds, setErasingIds] = useState([]);

  const setShapes = useCallback((updater) => {
    const current = shapesRef.current;
    const next = typeof updater === "function" ? updater(current) : updater;

    if (next === current) return;

    shapesRef.current = next;
    setShapesState(next);
  }, []);

  const {
    userId,
    username: collaborationUsername,
    status: collaborationStatus,
    remotePresence,
    publishLocalOperation,
    publishPresence,
  } = useRealtimeCollaboration({ roomId: collaborationRoomId, setShapes });

  useEffect(() => {
    if (!collaborationRoomId || !pendingCollaborationSeedRef.current) return;

    pendingCollaborationSeedRef.current.forEach((shape) => {
      publishLocalOperation(OPERATION_TYPES.CREATE_SHAPE, { shape });
    });
    pendingCollaborationSeedRef.current = null;
  }, [collaborationRoomId, publishLocalOperation]);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      persistenceManager.saveBoard({
        boardId,
        shapes,
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [boardId, persistenceManager, shapes]);

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

  const { setShapesWithHistory, saveHistoryCheckpoint, undo, redo } =
    useHistory({
      shapes,
      setShapes,
      setSelectedId,
    });

  const updateShape = useCallback(
    (id, updater, operationType = OPERATION_TYPES.UPDATE_SHAPE) => {
      let updatedShape = null;

      setShapesWithHistory((prev) =>
        updateShapeById(prev, id, (shape) => {
          updatedShape = updater(shape);
          return updatedShape;
        }),
      );

      if (!updatedShape) return;

      publishLocalOperation(operationType, {
        shapeId: id,
        patch: updatedShape,
      });
    },
    [publishLocalOperation, setShapesWithHistory],
  );

  const deleteSelectedShape = useCallback(() => {
    if (!selectedId) return;

    setShapesWithHistory((prev) => deleteShapeById(prev, selectedId));
    publishLocalOperation(OPERATION_TYPES.DELETE_SHAPE, {
      shapeId: selectedId,
    });
    clearSelection();
  }, [clearSelection, publishLocalOperation, selectedId, setShapesWithHistory]);

  useKeyboardShortcuts({ undo, redo, onDelete: deleteSelectedShape });

  const handleStyleChange = useCallback(
    (key, value) => {
      setActiveStyle((prev) => ({
        ...prev,
        [key]: value,
      }));

      if (key === "fontFamily") setFont(value);
      if (!selectedId) return;

      updateShape(
        selectedId,
        (shape) => updateShapeStyle(shape, { [key]: value }),
        OPERATION_TYPES.CHANGE_STYLE,
      );
    },
    [selectedId, updateShape],
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

      return shapeNode.id() || null;
    },
    [findErasableNode],
  );

  const handleImageFileSelected = useCallback(
    async (file) => {
      if (!file?.type?.startsWith("image/")) return;

      const asset = await loadImageAsset(file);
      setPendingImageAsset(asset);
      setTool(TOOLS.IMAGE);
      clearSelection();
    },
    [clearSelection],
  );

  const copyCollaborationLink = useCallback(async () => {
    if (!collaborationLink) return false;

    try {
      await navigator.clipboard?.writeText(collaborationLink);
      setCollaborationLinkCopied(true);
      window.setTimeout(() => setCollaborationLinkCopied(false), 1600);
      return true;
    } catch {
      return false;
    }
  }, [collaborationLink]);

  const startCollaboration = useCallback(async () => {
    if (collaborationRoomId) {
      await copyCollaborationLink();
      return collaborationLink;
    }

    const roomId = createCollaborationRoomId();
    const link = buildCollaborationLink(roomId);

    pendingCollaborationSeedRef.current = shapesRef.current.map((shape) =>
      structuredClone(shape),
    );
    setCollaborationRoomId(roomId);
    setCollaborationLink(link);
    setCollaborationLinkCopied(false);
    window.history.replaceState(null, "", link);

    try {
      await navigator.clipboard?.writeText(link);
      setCollaborationLinkCopied(true);
      window.setTimeout(() => setCollaborationLinkCopied(false), 1600);
    } catch {
      // The link is still shown in the UI if clipboard access is unavailable.
    }

    return link;
  }, [collaborationLink, collaborationRoomId, copyCollaborationLink]);

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
    publishLocalOperation,
    publishPresence,
  });

  const liveCursors = useMemo(
    () =>
      Object.values(remotePresence)
        .map((event) => ({
          userId: event.userId,
          username: event.username ?? "Guest",
          color: event.color ?? event.presence?.color ?? "#2563eb",
          x: event.presence?.cursor?.x,
          y: event.presence?.cursor?.y,
          updatedAt: event.updatedAt,
        }))
        .filter(
          (cursor) => Number.isFinite(cursor.x) && Number.isFinite(cursor.y),
        ),
    [remotePresence],
  );

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
    liveCursors,
    undo,
    redo,
    collaboration: {
      boardId,
      localBoardId,
      roomId: collaborationRoomId,
      isEnabled: Boolean(collaborationRoomId),
      link: collaborationLink,
      linkCopied: collaborationLinkCopied,
      userId,
      username: collaborationUsername,
      status: collaborationStatus,
      startCollaboration,
      copyCollaborationLink,
    },
    handleStyleChange,
    handleImageFileSelected,
    ...events,
  };
}
