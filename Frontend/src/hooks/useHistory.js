import { useCallback, useEffect, useRef } from "react";

export function useHistory({
  shapes,
  setShapes,
  setSelectedId,
  maxLength = 50,
}) {
  const history = useRef([]);
  const redoStack = useRef([]);
  const shapesRef = useRef(shapes);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  const pushShapesHistory = useCallback(
    (snapshot) => {
      history.current.push(structuredClone(snapshot));
      if (history.current.length > maxLength) history.current.shift();
      redoStack.current = [];
    },
    [maxLength],
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

  const undo = useCallback(() => {
    if (!history.current.length) return;

    const previous = history.current.pop();
    const current = shapesRef.current;

    redoStack.current.push(structuredClone(current));
    setShapes(previous);
    setSelectedId(null);
  }, [setSelectedId, setShapes]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return;

    const next = redoStack.current.pop();
    const current = shapesRef.current;

    history.current.push(structuredClone(current));
    setShapes(next);
    setSelectedId(null);
  }, [setSelectedId, setShapes]);

  return {
    setShapesWithHistory,
    saveHistoryCheckpoint,
    undo,
    redo,
  };
}
