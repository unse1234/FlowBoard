import { TOOLS } from "../../constants/tools";
import { getBox, getLinePoints } from "../../utils/shapeUtils";
import { BOX_SHAPES } from "./shapeTypes";

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

export const transformShapeFromNode = (shape, node) => {
  const scaleX = node.scaleX();
  const scaleY = node.scaleY();

  if (shape.type === TOOLS.LINE || shape.type === TOOLS.ARROW || shape.type === TOOLS.PEN) {
    return touchShape(shape, {
      x: node.x(),
      y: node.y(),
      points: getLinePoints(shape).map((point, index) =>
        index % 2 === 0 ? point * scaleX : point * scaleY
      ),
    });
  }

  const parent = node.getParent?.();
  const clientRect = node.getClientRect({
    relativeTo: parent,
    skipShadow: true,
    skipStroke: true,
  });

  if (clientRect) {
    return touchShape(shape, {
      x: clientRect.x,
      y: clientRect.y,
      width: Math.max(MIN_SIZE, clientRect.width),
      height: Math.max(MIN_SIZE, clientRect.height),
    });
  }

  return touchShape(shape, {
    x: node.x(),
    y: node.y(),
    width: Math.max(MIN_SIZE, shape.width * scaleX),
    height: Math.max(MIN_SIZE, shape.height * scaleY),
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
