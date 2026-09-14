import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_STYLE,
  GRID_SIZE,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_BY,
} from "../constants/canvas";
import { TOOLS } from "../constants/tools";
import { normalizeShapeIdSet } from "../domain/board/shapeIdentity.js";
import {
  assignGroupId,
  clearGroupId,
  hasGroupedShape,
} from "../domain/board/shapeGrouping.js";
import { createClientId } from "../features/shared/id/createClientId.js";
import {
  bringShapesToFront,
  moveShapesBackward,
  moveShapesForward,
  sendShapesToBack,
} from "../domain/board/shapeOrdering.js";
import {
  deleteShapesById,
  updateShapeById,
} from "../domain/board/shapeMutations";
import {
  getAlignmentPositions,
  getDistributionPositions,
} from "../domain/geometry/alignment.js";
import { getShapesBoundingBox } from "../domain/geometry/bounds.js";
import { loadImageAsset } from "../domain/images/imageAssets";
import { applyStylePatch, moveShapeTo } from "../domain/shapes/shapeOperations";
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
import { useCanvasPan } from "./useCanvasPan";
import { useHistory } from "./useHistory";
import { useClipboard } from "./useClipboard";
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

  const { isSpaceHeld, isSpaceHeldRef } = useCanvasPan();
  const [gridEnabled, setGridEnabled] = useState(false);

  // Read from inside the drag handlers, which stay stable across renders.
  const gridSizeRef = useRef(0);
  useEffect(() => {
    gridSizeRef.current = gridEnabled ? GRID_SIZE : 0;
  }, [gridEnabled]);
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
    userColor,
    username: collaborationUsername,
    status: collaborationStatus,
    remotePresence,
    publishLocalOperation,
    publishPresence,
    needsDisplayName,
    suggestedDisplayName,
    setDisplayName,
  } = useRealtimeCollaboration({ roomId: collaborationRoomId, setShapes });

  // Send the board's existing shapes into a newly created room.
  //
  // The connection only exists once a display name is chosen, which happens a
  // render or more after the room id is set, so the seed is kept until a send
  // actually goes out. Re-running on status changes catches the moment the
  // connection is created; the realtime manager queues the operation until the
  // room is joined.
  useEffect(() => {
    const seed = pendingCollaborationSeedRef.current;
    if (!collaborationRoomId || !seed) return;

    if (seed.length === 0) {
      pendingCollaborationSeedRef.current = null;
      return;
    }

    const operation = publishLocalOperation(OPERATION_TYPES.CREATE_SHAPES, {
      shapes: seed,
    });
    if (operation) pendingCollaborationSeedRef.current = null;
  }, [collaborationRoomId, collaborationStatus, publishLocalOperation]);

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
    selectedShapeIds,
    selectedShape,
    selectedShapes,
    editingTextId,
    editingTextShape,
    selectShape,
    selectShapes,
    toggleShapeSelection,
    addShapesToSelection,
    removeShapesFromSelection,
    clearSelection,
    activateTextEditing,
    finishTextEditing,
  } = useBoardSelection(shapes);

  const { registerShapeRef } = useShapeRegistry({
    selectedShapeIds,
    selectedShapes,
    editingTextId,
    transformerRef,
  });

  const {
    setShapesWithHistory,
    saveHistoryCheckpoint,
    discardLastCheckpoint,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory({
      shapes,
      setShapes,
      clearSelection,
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

  /**
   * Edit many shapes as one undoable step and one operation.
   *
   * The updater runs synchronously inside setShapesWithHistory, so the patches
   * it produces are collected before this function returns.
   */
  const updateShapes = useCallback(
    (ids, updater) => {
      const targets = normalizeShapeIdSet(ids);
      if (targets.size === 0) return;

      const patches = [];

      setShapesWithHistory((prev) =>
        prev.map((shape) => {
          if (!targets.has(String(shape.id))) return shape;

          const next = updater(shape);
          patches.push({ shapeId: String(shape.id), patch: next });
          return next;
        }),
      );

      if (patches.length === 0) return;

      publishLocalOperation(OPERATION_TYPES.UPDATE_SHAPES, { patches });
    },
    [publishLocalOperation, setShapesWithHistory],
  );

  const deleteSelectedShapes = useCallback(() => {
    if (selectedShapeIds.length === 0) return;

    setShapesWithHistory((prev) => deleteShapesById(prev, selectedShapeIds));
    publishLocalOperation(OPERATION_TYPES.DELETE_SHAPES, {
      shapeIds: selectedShapeIds,
    });
    clearSelection();
  }, [clearSelection, publishLocalOperation, selectedShapeIds, setShapesWithHistory]);

  /**
   * Move the selection through the z-order.
   *
   * Draw order is array order, so this rearranges the array rather than writing
   * a z-index onto shapes. The ordering helpers return the original array when
   * nothing could move, which both keeps the change out of the undo history and
   * suppresses a pointless operation to peers.
   */
  const reorderSelection = useCallback(
    (operationType) => {
      if (selectedShapeIds.length === 0) return;

      const reorder = {
        [OPERATION_TYPES.BRING_FORWARD]: moveShapesForward,
        [OPERATION_TYPES.SEND_BACKWARD]: moveShapesBackward,
        [OPERATION_TYPES.BRING_TO_FRONT]: bringShapesToFront,
        [OPERATION_TYPES.SEND_TO_BACK]: sendShapesToBack,
      }[operationType];

      let changed = false;

      setShapesWithHistory((prev) => {
        const next = reorder(prev, selectedShapeIds);
        changed = next !== prev;
        return next;
      });

      if (!changed) return;

      publishLocalOperation(operationType, { shapeIds: selectedShapeIds });
    },
    [publishLocalOperation, selectedShapeIds, setShapesWithHistory],
  );

  const layerActions = useMemo(
    () => ({
      bringForward: () => reorderSelection(OPERATION_TYPES.BRING_FORWARD),
      sendBackward: () => reorderSelection(OPERATION_TYPES.SEND_BACKWARD),
      bringToFront: () => reorderSelection(OPERATION_TYPES.BRING_TO_FRONT),
      sendToBack: () => reorderSelection(OPERATION_TYPES.SEND_TO_BACK),
    }),
    [reorderSelection],
  );

  /**
   * Group the selection under a fresh id.
   *
   * Grouping is a field on each shape rather than a container, so this is an
   * ordinary multi-shape patch: the array stays flat and z-order is untouched.
   */
  const groupSelection = useCallback(() => {
    if (selectedShapeIds.length < 2) return;

    const groupId = createClientId("grp");
    let changed = false;

    setShapesWithHistory((prev) => {
      const next = assignGroupId(prev, selectedShapeIds, groupId);
      changed = next !== prev;
      return next;
    });

    if (!changed) return;

    publishLocalOperation(OPERATION_TYPES.GROUP, {
      groupId,
      shapeIds: selectedShapeIds,
    });
  }, [publishLocalOperation, selectedShapeIds, setShapesWithHistory]);

  const ungroupSelection = useCallback(() => {
    if (selectedShapeIds.length === 0) return;

    let changed = false;

    setShapesWithHistory((prev) => {
      const next = clearGroupId(prev, { ids: selectedShapeIds });
      changed = next !== prev;
      return next;
    });

    if (!changed) return;

    publishLocalOperation(OPERATION_TYPES.UNGROUP, { shapeIds: selectedShapeIds });
  }, [publishLocalOperation, selectedShapeIds, setShapesWithHistory]);

  const groupActions = useMemo(
    () => ({
      group: groupSelection,
      ungroup: ungroupSelection,
      canGroup: selectedShapeIds.length > 1,
      canUngroup: hasGroupedShape(selectedShapes),
    }),
    [groupSelection, selectedShapeIds.length, selectedShapes, ungroupSelection],
  );

  /**
   * Apply a map of id to position as one undoable step.
   *
   * Both aligning and distributing reduce to exactly this, and an empty map
   * means the shapes were already in place — so nothing is recorded or sent.
   */
  const applyPositions = useCallback(
    (positions) => {
      if (positions.size === 0) return;

      updateShapes([...positions.keys()], (shape) =>
        moveShapeTo(shape, positions.get(String(shape.id))),
      );
    },
    [updateShapes],
  );

  const alignmentActions = useMemo(
    () => ({
      align: (alignment) =>
        applyPositions(getAlignmentPositions(selectedShapes, alignment)),
      distribute: (axis) =>
        applyPositions(getDistributionPositions(selectedShapes, axis)),
      canAlign: selectedShapes.length > 1,
      canDistribute: selectedShapes.length > 2,
    }),
    [applyPositions, selectedShapes],
  );

  const toggleGrid = useCallback(() => setGridEnabled((enabled) => !enabled), []);

  /** Put a world point in the middle of the screen, without changing the zoom. */
  const centerOn = useCallback((point) => {
    setTransform((prev) => ({
      ...prev,
      x: window.innerWidth / 2 - point.x * prev.scale,
      y: window.innerHeight / 2 - point.y * prev.scale,
    }));
  }, []);

  const clipboard = useClipboard({
    shapesRef,
    selectedShapeIds,
    setShapesWithHistory,
    publishLocalOperation,
    selectShapes,
    deleteSelectedShapes,
  });

  const selectAll = useCallback(() => {
    selectShapes(shapesRef.current.map((shape) => shape.id));
  }, [selectShapes]);

  /**
   * Move the selection by a fixed amount.
   *
   * @returns {boolean} false when there was nothing to nudge, so the caller can
   *   fall back to another meaning for the same key.
   */
  const nudgeSelection = useCallback(
    (dx, dy) => {
      if (selectedShapeIds.length === 0) return false;

      updateShapes(selectedShapeIds, (shape) =>
        moveShapeTo(shape, { x: shape.x + dx, y: shape.y + dy }),
      );
      return true;
    },
    [selectedShapeIds, updateShapes],
  );

  /** Remove every shape, as one undoable step and one operation. */
  const clearBoard = useCallback(() => {
    const current = shapesRef.current;
    if (current.length === 0) return;

    setShapesWithHistory([]);
    publishLocalOperation(OPERATION_TYPES.DELETE_SHAPES, {
      shapeIds: current.map((shape) => shape.id),
    });
    clearSelection();
  }, [clearSelection, publishLocalOperation, setShapesWithHistory]);

  /**
   * Pick a tool from the dock, a flyout or a shortcut.
   *
   * A tool that makes or removes something starts fresh, so the selection is
   * let go — otherwise the inspector keeps describing the last shape and a
   * colour picked for the next one lands on it instead. Select and Hand only
   * point and move, so they keep it. Internal switches (back to Select after
   * drawing) call setTool directly and are unaffected.
   */
  const chooseTool = useCallback(
    (nextTool) => {
      setTool(nextTool);
      if (nextTool !== TOOLS.SELECT && nextTool !== TOOLS.PAN) clearSelection();
    },
    [clearSelection],
  );

  useKeyboardShortcuts({
    undo,
    redo,
    onDelete: deleteSelectedShapes,
    onSelectAll: selectAll,
    onClearSelection: clearSelection,
    onNudge: nudgeSelection,
    onBringForward: layerActions.bringForward,
    onSendBackward: layerActions.sendBackward,
    onBringToFront: layerActions.bringToFront,
    onSendToBack: layerActions.sendToBack,
    onGroup: groupSelection,
    onUngroup: ungroupSelection,
    onCopy: clipboard.copy,
    onCut: clipboard.cut,
    onPaste: clipboard.paste,
    onDuplicate: clipboard.duplicate,
    setTool: chooseTool,
  });

  /**
   * Change style — of the selection, and of what the active tool draws next.
   *
   * Takes `(key, value)` or a patch object, so a control that sets several keys
   * at once (a fill swatch sets the colour and turns fill on) is one undo step
   * and one operation.
   */
  const handleStyleChange = useCallback(
    (keyOrPatch, value) => {
      const patch =
        keyOrPatch !== null && typeof keyOrPatch === "object"
          ? keyOrPatch
          : { [keyOrPatch]: value };

      setActiveStyle((prev) => ({
        ...prev,
        ...patch,
      }));

      if (patch.fontFamily !== undefined) setFont(patch.fontFamily);
      if (selectedShapeIds.length === 0) return;

      const apply = (shape) => applyStylePatch(shape, patch);

      // One shape keeps the dedicated CHANGE_STYLE operation it has always used;
      // more than one goes through the batch path as a single edit.
      if (selectedShapeIds.length === 1) {
        updateShape(selectedShapeIds[0], apply, OPERATION_TYPES.CHANGE_STYLE);
        return;
      }

      updateShapes(selectedShapeIds, apply);
    },
    [selectedShapeIds, updateShape, updateShapes],
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

  /** Drop an image that was picked but not yet placed. */
  const cancelPendingImage = useCallback(() => {
    setPendingImageAsset(null);
    setTool(TOOLS.SELECT);
  }, []);

  const copyCollaborationLink = useCallback(async () => {
    if (!collaborationLink || !navigator.clipboard) return false;

    try {
      await navigator.clipboard.writeText(collaborationLink);
      setCollaborationLinkCopied(true);
      window.setTimeout(() => setCollaborationLinkCopied(false), 1600);
      return true;
    } catch {
      return false;
    }
  }, [collaborationLink]);

  /**
   * Create a room for this board (or reuse the current one) and copy its link.
   *
   * @returns {Promise<{ link: string, copied: boolean }>} `copied` is false when
   *   clipboard access is unavailable, so the UI can point at the address bar.
   */
  const startCollaboration = useCallback(async () => {
    if (collaborationRoomId) {
      const copied = await copyCollaborationLink();
      return { link: collaborationLink, copied };
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

    let copied = false;

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        copied = true;
        setCollaborationLinkCopied(true);
        window.setTimeout(() => setCollaborationLinkCopied(false), 1600);
      }
    } catch {
      // The link is already in the address bar, which the UI points to.
    }

    return { link, copied };
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

  /**
   * Frame every shape on the board.
   *
   * A board whose content has no extent in one axis (a single point, a perfectly
   * horizontal line) would divide by zero, so those axes fall back to scale 1
   * and only the centring applies.
   */
  const fitToScreen = useCallback(() => {
    const bounds = getShapesBoundingBox(shapesRef.current);
    if (!bounds) return;

    const padding = 80;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const availableWidth = Math.max(1, viewportWidth - padding * 2);
    const availableHeight = Math.max(1, viewportHeight - padding * 2);

    const scaleX = bounds.width > 0 ? availableWidth / bounds.width : Infinity;
    const scaleY = bounds.height > 0 ? availableHeight / bounds.height : Infinity;
    const fitted = Math.min(scaleX, scaleY);

    const nextScale = Number.isFinite(fitted)
      ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitted))
      : 1;

    setTransform({
      scale: nextScale,
      x: viewportWidth / 2 - (bounds.x + bounds.width / 2) * nextScale,
      y: viewportHeight / 2 - (bounds.y + bounds.height / 2) * nextScale,
    });
  }, []);

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
          idle: Boolean(event.idle),
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
  // Presence events arrive on every remote cursor move, but the roster only
  // changes when someone joins, leaves or renames. Keying the memo on a
  // serialised roster keeps the avatar stack and people list from re-rendering
  // at cursor rate.
  const remoteRosterKey = JSON.stringify(
    Object.values(remotePresence).map((event) => [
      event.userId,
      event.username ?? "Guest",
      event.color ?? event.presence?.color ?? null,
    ]),
  );

  const collaborators = useMemo(() => {
    // The local user carries the same colour peers see on their cursor.
    const local = {
      userId,
      username: collaborationUsername ?? "You",
      isLocal: true,
      color: userColor,
    };

    const remote = JSON.parse(remoteRosterKey).map(
      ([remoteUserId, username, color]) => ({
        userId: remoteUserId,
        username,
        isLocal: false,
        color: color ?? undefined,
      }),
    );

    return [local, ...remote];
  }, [collaborationUsername, remoteRosterKey, userColor, userId]);

  // Memoised so chrome that only reads collaboration state does not re-render
  // with every drawing frame.
  const collaboration = useMemo(
    () => ({
      boardId,
      localBoardId,
      roomId: collaborationRoomId,
      isEnabled: Boolean(collaborationRoomId),
      isRoomOwner: !joinedExistingRoom,
      link: collaborationLink,
      linkCopied: collaborationLinkCopied,
      userId,
      username: collaborationUsername,
      userColor,
      status: collaborationStatus,
      startCollaboration,
      copyCollaborationLink,
      needsDisplayName,
      suggestedDisplayName,
      setDisplayName,
    }),
    [
      boardId,
      collaborationLink,
      collaborationLinkCopied,
      collaborationRoomId,
      collaborationStatus,
      collaborationUsername,
      copyCollaborationLink,
      joinedExistingRoom,
      localBoardId,
      needsDisplayName,
      setDisplayName,
      startCollaboration,
      suggestedDisplayName,
      userColor,
      userId,
    ],
  );

  /** Current shapes without subscribing to them — for one-off actions like export. */
  const getShapes = useCallback(() => shapesRef.current, []);

  /** The live Konva stage, read at call time rather than during render. */
  const getStage = useCallback(() => stageRef.current, []);

  return {
    stageRef,
    transformerRef,
    registerShapeRef,
    tool,
    setTool: chooseTool,
    isPanMode: isSpaceHeld || tool === TOOLS.PAN,
    selectedShape,
    selectedShapes,
    selectedShapeIds,
    editingTextShape,
    activeStyle,
    font,
    setFont,
    toolLocked,
    setToolLocked,
    transform,
    // For gestures that compute a whole transform themselves (pinch, two-finger pan).
    setViewTransform: setTransform,
    shapes,
    pendingImageAsset,
    laserPoints,
    eraserPoints,
    erasingIds,
    liveCursors,
    collaborators,
    undo,
    redo,
    canUndo,
    canRedo,
    clearBoard,
    deleteSelection: deleteSelectedShapes,
    selectAll,
    getShapes,
    getStage,
    layerActions,
    groupActions,
    alignmentActions,
    clipboard,
    gridEnabled,
    gridSize: gridEnabled ? GRID_SIZE : 0,
    toggleGrid,
    centerOn,
    zoomIn,
    zoomOut,
    setZoom,
    resetZoom,
    fitToScreen,
    collaboration,
    handleStyleChange,
    handleImageFileSelected,
    cancelPendingImage,
    ...events,
  };
}
