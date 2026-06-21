import { DEFAULT_STYLE } from "../../constants/canvas";

export const EMPTY_TEXT_PLACEHOLDER = "";

export function getTextEditorStyle({ shape, transform }) {
  const style = {
    ...DEFAULT_STYLE,
    ...(shape.style ?? {}),
  };

  return {
    left: transform.x + shape.x * transform.scale,
    top: transform.y + shape.y * transform.scale,
    width: Math.max(120, shape.width * transform.scale),
    minHeight: Math.max(36, shape.height * transform.scale),
    fontSize: style.fontSize * transform.scale,
    fontFamily: style.fontFamily,
    color: style.stroke,
    lineHeight: 1.25,
  };
}

export function measureTextArea(textarea) {
  return {
    width: Math.max(120, textarea.scrollWidth + 4),
    height: Math.max(36, textarea.scrollHeight + 4),
  };
}
