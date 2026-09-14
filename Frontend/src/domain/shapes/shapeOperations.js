import { DEFAULT_STYLE } from "../../constants/canvas.js";
import { TOOLS } from "../../constants/tools.js";
import { getBox } from "../../utils/shapeUtils.js";
import { BOX_SHAPES, LINE_SHAPES } from "./shapeTypes.js";

const MIN_SIZE = 5;

const touchShape = (shape, patch) => ({
  ...shape,
  ...patch,
  version: (shape.version ?? 0) + 1,
  updatedAt: Date.now(),
});

export const updateShapeDuringDraw = (shape, point) => {
  if (
    shape.type === TOOLS.RECT ||
    shape.type === TOOLS.CIRCLE ||
    shape.type === TOOLS.DIAMOND
  ) {
    return touchShape(shape, {
      width: point.x - shape.x,
      height: point.y - shape.y,
    });
  }

  if (shape.type === TOOLS.LINE || shape.type === TOOLS.ARROW) {
    return touchShape(shape, {
      points: [0, 0, point.x - shape.x, point.y - shape.y],
    });
  }

  if (shape.type === TOOLS.PEN) {
    return touchShape(shape, {
      points: [...shape.points, point.x - shape.x, point.y - shape.y],
    });
  }

  return shape;
};

export const normalizeShape = (shape) => {
  if (!BOX_SHAPES.has(shape.type)) return shape;
  return touchShape(shape, getBox(shape));
};

export const moveShapeToNode = (shape, node) => {
  return touchShape(shape, {
    x: node.x(),
    y: node.y(),
  });
};

/** Move a shape to an absolute position, for dragging a whole selection. */
export const moveShapeTo = (shape, point) =>
  touchShape(shape, {
    x: point.x,
    y: point.y,
  });

/**
 * Read a finished transform back off its Konva node.
 *
 * Konva reports a transform as a scale factor on the node; the shape model has
 * no scale, so the scale is baked into the geometry here and the caller resets
 * the node back to 1. Line shapes keep their geometry in `points` rather than
 * width/height, so scaling their box would silently flatten them — which is
 * exactly what happens once a line joins a multi-shape selection.
 */
export const transformShapeFromNode = (shape, node) => {
  const scaleX = node.scaleX();
  const scaleY = node.scaleY();

  if (LINE_SHAPES.has(shape.type)) {
    return touchShape(shape, {
      x: node.x(),
      y: node.y(),
      points: (shape.points ?? []).map((point, index) =>
        index % 2 === 0 ? point * scaleX : point * scaleY,
      ),
    });
  }

  return touchShape(shape, {
    x: node.x(),
    y: node.y(),
    width: Math.max(MIN_SIZE, node.width() * scaleX),
    height: Math.max(MIN_SIZE, node.height() * scaleY),
  });
};

export const updateShapeText = (shape, text, measuredSize) =>
  touchShape(shape, {
    text,
    width: Math.max(40, measuredSize?.width ?? shape.width),
    height: Math.max(24, measuredSize?.height ?? shape.height),
  });

export const updateShapeStyle = (shape, stylePatch) =>
  touchShape(shape, {
    style: {
      ...shape.style,
      ...stylePatch,
    },
  });

/**
 * Apply a style patch the way the user means it.
 *
 * A text shape's box was measured at its current font size, and Konva stops
 * drawing lines that overflow a fixed-height text node — so growing the font
 * alone would clip the text. Resizing the font therefore scales the box with
 * it. Notes are cards whose size the user chose, so they keep it.
 */
export const applyStylePatch = (shape, stylePatch) => {
  const next = updateShapeStyle(shape, stylePatch);
  if (shape.type !== TOOLS.TEXT || stylePatch.fontSize === undefined) return next;

  const previous = shape.style?.fontSize ?? DEFAULT_STYLE.fontSize;
  const ratio = previous > 0 ? stylePatch.fontSize / previous : 1;
  if (!Number.isFinite(ratio) || ratio === 1) return next;

  return {
    ...next,
    width: shape.width * ratio,
    height: shape.height * ratio,
  };
};
