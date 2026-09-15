import { useCallback, useRef } from "react";
import { PASTE_OFFSET } from "../constants/canvas.js";
import { cloneShapes } from "../domain/board/shapeCloning.js";
import { createClientId } from "../features/shared/id/createClientId.js";

/**
 * An in-app clipboard.
 *
 * Deliberately not the system clipboard: reading it is async and permission
 * gated, and `navigator.clipboard` is already spoken for by the share-link copy.
 * This keeps copy and paste synchronous and reliable inside the board.
 *
 * Nothing in the app mutates a shape in place — every edit builds a new object —
 * so holding references is a safe snapshot and costs nothing, which matters when
 * a copied image carries a base64 payload.
 */
export function useClipboard({
  shapesRef,
  selectedShapeIds,
  insertShapes,
  deleteSelectedShapes,
}) {
  const clipboardRef = useRef([]);
  const pasteCountRef = useRef(0);

  const getSelectedShapes = useCallback(() => {
    const ids = new Set(selectedShapeIds);

    return shapesRef.current.filter((shape) => ids.has(String(shape.id)));
  }, [selectedShapeIds, shapesRef]);

  /**
   * Add clones to the board. insertShapes leaves them selected, so the copy can
   * be moved immediately — which is almost always the next thing the user does.
   */
  const pasteShapes = useCallback(
    (sourceShapes, offsetStep) => {
      if (sourceShapes.length === 0) return;

      const offset = PASTE_OFFSET * offsetStep;
      const clones = cloneShapes(sourceShapes, {
        createShapeId: () => createClientId("shape"),
        createGroupId: () => createClientId("grp"),
        offsetX: offset,
        offsetY: offset,
      });

      insertShapes(clones);
    },
    [insertShapes],
  );

  const copy = useCallback(() => {
    const selected = getSelectedShapes();
    if (selected.length === 0) return false;

    clipboardRef.current = selected;
    pasteCountRef.current = 0;
    return true;
  }, [getSelectedShapes]);

  const cut = useCallback(() => {
    if (!copy()) return;

    deleteSelectedShapes();
  }, [copy, deleteSelectedShapes]);

  /**
   * Repeated pastes step further from the original rather than stacking on one
   * spot, so pasting three times gives three visible copies.
   */
  const paste = useCallback(() => {
    pasteCountRef.current += 1;
    pasteShapes(clipboardRef.current, pasteCountRef.current);
  }, [pasteShapes]);

  /** Duplicate is copy and paste in one action, and leaves the clipboard alone. */
  const duplicate = useCallback(() => {
    pasteShapes(getSelectedShapes(), 1);
  }, [getSelectedShapes, pasteShapes]);

  return { copy, cut, paste, duplicate };
}
