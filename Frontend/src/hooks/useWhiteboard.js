import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_STYLE,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_BY,
} from "../constants/canvas";
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
  // Arriving with a room already in the URL means joining someone else's board.
  // That is the only ownership signal available, and it drives the Host badge.
  const joinedExistingRoom = useMemo(
    () => Boolean(resolveCollaborationRoomId()),
    [],
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

  /**
   * Remove every shape, as one undoable step.
   *
   * Peers are told shape by shape because DELETE_SHAPE is the only removal
   * operation the protocol has — there is no "clear board" op to send.
   */
  const clearBoard = useCallback(() => {
    const current = shapesRef.current;
    if (current.length === 0) return;

    setShapesWithHistory([]);
    current.forEach((shape) => {
      publishLocalOperation(OPERATION_TYPES.DELETE_SHAPE, {
        shapeId: shape.id,
      });
    });
    clearSelection();
  }, [clearSelection, publishLocalOperation, setShapesWithHistory]);

  useKeyboardShortcuts({
    undo,
    redo,
    onDelete: deleteSelectedShape,
    setTool,
  });

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

  /**
   * Zoom around the viewport centre.
   *
   * The wheel handler zooms around the pointer; the on-screen buttons have no
   * pointer to anchor to, so they hold the centre of the screen fixed instead —
   * the world point under the middle of the canvas stays put.
   */
  const zoomToScale = useCallback((resolveScale) => {
    setTransform((prev) => {
      const requested = resolveScale(prev.scale);
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, requested));
      if (nextScale === prev.scale) return prev;

      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const worldX = (centerX - prev.x) / prev.scale;
      const worldY = (centerY - prev.y) / prev.scale;

      return {
        x: centerX - worldX * nextScale,
        y: centerY - worldY * nextScale,
        scale: nextScale,
      };
    });
  }, []);

  const zoomIn = useCallback(
    () => zoomToScale((scale) => scale * SCALE_BY),
    [zoomToScale],
  );
  const zoomOut = useCallback(
    () => zoomToScale((scale) => scale / SCALE_BY),
    [zoomToScale],
  );
  const setZoom = useCallback(
    (scale) => zoomToScale(() => scale),
    [zoomToScale],
  );
  const resetZoom = useCallback(
    () => setTransform({ x: 0, y: 0, scale: 1 }),
    [],
  );

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

  /**
   * Everyone currently on the board, local user first.
   *
   * Presence is the only roster the app has, so it also feeds the avatar stack
   * and the participants list. Outside a collaboration room this is just the
   * local user, which is what the design's single-avatar state shows.
   */
  const collaborators = useMemo(() => {
    const local = {
      userId,
      username: collaborationUsername ?? "You",
      isLocal: true,
      color: undefined,
    };

    const remote = Object.values(remotePresence).map((event) => ({
      userId: event.userId,
      username: event.username ?? "Guest",
      isLocal: false,
      color: event.color ?? event.presence?.color,
    }));

    return [local, ...remote];
  }, [collaborationUsername, remotePresence, userId]);

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
    collaborators,
    undo,
    redo,
    clearBoard,
    zoomIn,
    zoomOut,
    setZoom,
    resetZoom,
    collaboration: {
      boardId,
      localBoardId,
      roomId: collaborationRoomId,
      isEnabled: Boolean(collaborationRoomId),
      isRoomOwner: !joinedExistingRoom,
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
