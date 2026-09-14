import { useCallback, useEffect, useRef, useState } from "react";

export function useHistory({
  shapes,
  setShapes,
  clearSelection,
  maxLength = 50,
}) {
  const history = useRef([]);
  const redoStack = useRef([]);
  const shapesRef = useRef(shapes);

  // Stack depths mirrored into state only so undo and redo controls can show a
  // disabled state. They change in the same batch as the shapes they record,
  // and bail out when unchanged, so they add no render of their own.
  const [depths, setDepths] = useState({ undo: 0, redo: 0 });

  const syncDepths = useCallback(() => {
    const undoDepth = history.current.length;
    const redoDepth = redoStack.current.length;

    setDepths((current) =>
      current.undo === undoDepth && current.redo === redoDepth
        ? current
        : { undo: undoDepth, redo: redoDepth },
    );
  }, []);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  const pushShapesHistory = useCallback(
    (snapshot) => {
      history.current.push(structuredClone(snapshot));
      if (history.current.length > maxLength) history.current.shift();
      redoStack.current = [];
      syncDepths();
    },
    [maxLength, syncDepths],
  );

  const setShapesWithHistory = useCallback(
    (updater) => {
      const current = shapesRef.current;
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next === current) return;

      pushShapesHistory(current);
      setShapes(next);
    },
    [pushShapesHistory, setShapes],
  );

  const saveHistoryCheckpoint = useCallback(() => {
    pushShapesHistory(shapesRef.current);
  }, [pushShapesHistory]);

  /**
   * Forget the most recent checkpoint, for an interaction abandoned before it
   * produced anything worth undoing (a stroke cut short by a pinch). Without
   * this, the next undo would restore the board exactly as it already is.
   */
  const discardLastCheckpoint = useCallback(() => {
    history.current.pop();
    syncDepths();
  }, [syncDepths]);

  const undo = useCallback(() => {
    if (!history.current.length) return;

    const previous = history.current.pop();
    const current = shapesRef.current;

    redoStack.current.push(structuredClone(current));
    setShapes(previous);
    clearSelection();
    syncDepths();
  }, [clearSelection, setShapes, syncDepths]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return;

    const next = redoStack.current.pop();
    const current = shapesRef.current;

    history.current.push(structuredClone(current));
    setShapes(next);
    clearSelection();
    syncDepths();
  }, [clearSelection, setShapes, syncDepths]);

  return {
    setShapesWithHistory,
    saveHistoryCheckpoint,
    discardLastCheckpoint,
    undo,
    redo,
    canUndo: depths.undo > 0,
    canRedo: depths.redo > 0,
  };
}
