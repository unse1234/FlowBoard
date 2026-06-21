import { useCallback, useMemo, useState } from "react";
import { getSelectedShapes } from "../domain/selection/selectionModel";

export function useBoardSelection(shapes) {
  const [selectedId, setSelectedId] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);

  const { selectedShape, editingTextShape } = useMemo(
    () => getSelectedShapes({ shapes, selectedId, editingTextId }),
    [editingTextId, selectedId, shapes]
  );

  const selectShape = useCallback((id) => {
    setSelectedId(id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);}, []);

  const activateTextEditing = useCallback((id) => {
    setSelectedId(id);
    setEditingTextId(id);
  }, []);

  const finishTextEditing = useCallback((id = null) => {
    if (id) setSelectedId(id);
    setEditingTextId(null);
  }, []);

  return {
    selectedId,
    setSelectedId,
    selectedShape,
    editingTextId,
    editingTextShape,
    selectShape,
    clearSelection,
    activateTextEditing,
    finishTextEditing,
  };
}
