import { TOOLS } from "../../constants/tools";
import { DEFAULT_STYLE } from "../../constants/canvas";

const now = () => Date.now();

const createBaseShape = ({ id, type, point, style }) => ({
  id,
  type,
  x: point.x,
  y: point.y,
  version: 1,
  createdAt: now(),
  updatedAt: now(),
  style: {
    ...DEFAULT_STYLE,
    ...style,
  },
});

export const createShape = ({ id, type, point, style }) => {
  const base = createBaseShape({ id, type, point, style });

  if (type === TOOLS.LINE || type === TOOLS.ARROW || type === TOOLS.PEN) {
    return {
      ...base,
      points: [0, 0],
    };
  }

  return {
    ...base,
    width: 0,
    height: 0,
  };
};

export const createTextShape = ({ id, point, style, text = "" }) => ({
  ...createBaseShape({ id, type: TOOLS.TEXT, point, style }),
  text,
  width: 240,
  height: Math.max(36, (style?.fontSize ?? DEFAULT_STYLE.fontSize) * 1.5),
});

export const createImageShape = ({ id, point, asset, style }) => {
  const maxInitialWidth = 360;
  const scale = Math.min(1, maxInitialWidth / asset.naturalWidth);
  const width = Math.max(80, Math.round(asset.naturalWidth * scale));
  const height = Math.max(60, Math.round(asset.naturalHeight * scale));

  return {
    ...createBaseShape({ id, type: TOOLS.IMAGE, point, style }),
    width,
    height,
    image: {
      assetId: asset.assetId,
      src: asset.src,
      name: asset.name,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      naturalWidth: asset.naturalWidth,
      naturalHeight: asset.naturalHeight,
      storage: "data-url",
    },
  };
};
