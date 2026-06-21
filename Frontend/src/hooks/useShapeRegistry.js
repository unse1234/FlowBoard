import { useCallback, useEffect, useRef } from "react";
import { canUseTransformer } from "../domain/selection/selectionModel";

export function useShapeRegistry({
  selectedId,
  selectedShape,
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

    const selectedNode = canUseTransformer({
      selectedShape,
      selectedId,
      editingTextId,
    })
      ? shapeRefs.current[selectedId]
      : null;

    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [editingTextId, selectedId, selectedShape, transformerRef]);

  return { registerShapeRef };
}
