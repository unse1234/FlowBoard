import { DEFAULT_STYLE, NOTE_DEFAULTS } from "../../constants/canvas.js";
import { TOOLS } from "../../constants/tools.js";
import { getReadableInk } from "../../utils/styleUtils.js";

export const EMPTY_TEXT_PLACEHOLDER = "";

/**
 * Screen-space geometry for the text overlay, in window coordinates.
 *
 * The overlay is a real textarea floating above the stage, so everything is
 * multiplied back into screen space. Notes inset the editor by their padding and
 * clamp it to the card, so typing looks like it is happening on the note rather
 * than over it; a bare text shape instead grows to fit.
 */
export function getTextEditorStyle({ shape, transform }) {
  const style = {
    ...DEFAULT_STYLE,
    ...(shape.style ?? {}),
  };

  const isNote = shape.type === TOOLS.NOTE;
  const padding = isNote ? NOTE_DEFAULTS.padding : 0;

  const left = transform.x + (shape.x + padding) * transform.scale;
  const top = transform.y + (shape.y + padding) * transform.scale;

  if (isNote) {
    const innerWidth = Math.max(20, shape.width - padding * 2);
    const innerHeight = Math.max(20, shape.height - padding * 2);

    return {
      left,
      top,
      width: innerWidth * transform.scale,
      minHeight: innerHeight * transform.scale,
      height: innerHeight * transform.scale,
      autoGrow: false,
      fontSize: style.fontSize * transform.scale,
      fontFamily: style.fontFamily,
      color: getReadableInk(style.fill),
      lineHeight: 1.3,
    };
  }

  return {
    left,
    top,
    width: Math.max(120, shape.width * transform.scale),
    minHeight: Math.max(36, shape.height * transform.scale),
    autoGrow: true,
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
