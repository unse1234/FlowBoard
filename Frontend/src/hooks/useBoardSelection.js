import { useCallback, useMemo, useState } from "react";
import { isShapeIdEqual, normalizeShapeIdSet } from "../domain/board/shapeIdentity.js";
import {
  addToSelection,
  getSelectedShapes,
  toggleSelection,
} from "../domain/selection/selectionModel.js";

/**
 * Board selection.
 *
 * `selectedIds` is the raw click order and can briefly name a shape a peer has
 * just deleted. Actions use `selectedShapeIds` instead, which is derived by
 * matching against the live board — so stale ids resolve away on their own and
 * there is no reconciliation effect to run on every shape change.
 */
export function useBoardSelection(shapes) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingTextId, setEditingTextId] = useState(null);

  const { selectedShapes, selectedShape, editingTextShape } = useMemo(
    () => getSelectedShapes({ shapes, selectedIds, editingTextId }),
    [editingTextId, selectedIds, shapes],
  );

  const selectedShapeIds = useMemo(
    () => selectedShapes.map((shape) => String(shape.id)),
    [selectedShapes],
  );

  const selectShape = useCallback((id) => {
    setSelectedIds(id === null || id === undefined ? [] : [String(id)]);
  }, []);

  const selectShapes = useCallback((ids) => {
    setSelectedIds(Array.from(normalizeShapeIdSet(ids)));
  }, []);

  const toggleShapeSelection = useCallback((id) => {
    setSelectedIds((current) => toggleSelection(current, id));
  }, []);

  const addShapesToSelection = useCallback((ids) => {
    setSelectedIds((current) => addToSelection(current, ids));
  }, []);

  const removeShapesFromSelection = useCallback((ids) => {
    const removed = normalizeShapeIdSet(ids);

    setSelectedIds((current) => {
      const next = current.filter((id) => !removed.has(String(id)));

      return next.length === current.length ? current : next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds((current) => (current.length === 0 ? current : []));
  }, []);

  const isSelected = useCallback(
    (id) => selectedIds.some((selected) => isShapeIdEqual(selected, id)),
    [selectedIds],
  );

  const activateTextEditing = useCallback((id) => {
    setSelectedIds([String(id)]);
    setEditingTextId(id);
  }, []);

  const finishTextEditing = useCallback((id = null) => {
    if (id) setSelectedIds([String(id)]);
    setEditingTextId(null);
  }, []);

  return {
    selectedIds,
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
    isSelected,
    activateTextEditing,
    finishTextEditing,
  };
}
