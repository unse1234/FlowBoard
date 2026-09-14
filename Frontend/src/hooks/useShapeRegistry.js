import { useCallback, useEffect, useRef } from "react";
import { canUseTransformer } from "../domain/selection/selectionModel.js";

/**
 * Maps shape ids to their live Konva nodes and keeps the Transformer pointed at
 * the current selection.
 *
 * Konva's Transformer takes an array of nodes natively, so multi-select needs
 * nothing from Konva beyond handing it more than one. Ids whose node is missing
 * are filtered out — a shape deleted by a peer can still be named by the local
 * selection for a frame.
 */
export function useShapeRegistry({
  selectedShapeIds,
  selectedShapes,
  editingTextId,
  transformerRef,
}) {
  const shapeRefs = useRef({});

  const registerShapeRef = useCallback((id, node) => {
    if (node) {
      shapeRefs.current[id] = node;
      return;
    }

    delete shapeRefs.current[id];
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    const nodes = canUseTransformer({ selectedShapes, editingTextId })
      ? selectedShapeIds
          .map((id) => shapeRefs.current[id])
          .filter(Boolean)
      : [];

    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [editingTextId, selectedShapeIds, selectedShapes, transformerRef]);

  return { registerShapeRef };
}
