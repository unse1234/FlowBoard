// @ts-check

import { getCanvasPalette } from "../design/canvasTokens.js";

/**
 * Colour maths for shape colours drawn on a themed canvas. Pure — no DOM.
 */

/**
 * The contrast against the dark canvas below which a stroke all but vanishes.
 * Near-black inks sit below it (the default ink is about 1:1) and are drawn
 * white instead; every coloured palette swatch sits well above it.
 */
export const MIN_DARK_CANVAS_CONTRAST = 2;

const DARK_CANVAS = getCanvasPalette("dark").background;

/**
 * @param {unknown} color - "#rgb" or "#rrggbb", with or without the hash
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function parseHexColor(color) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color ?? "").trim());
  if (!match) return null;

  const digits = match[1];
  const hex =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  const value = Number.parseInt(hex, 16);

  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/**
 * WCAG relative luminance: 0 for black, 1 for white.
 *
 * @param {unknown} color
 * @returns {number | null}
 */
export function getRelativeLuminance(color) {
  const rgb = parseHexColor(color);
  if (!rgb) return null;

  /** @param {number} value */
  const linear = (value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
}

/**
 * WCAG contrast ratio between two colours, from 1 (none) to 21.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number | null}
 */
export function getContrastRatio(a, b) {
  const first = getRelativeLuminance(a);
  const second = getRelativeLuminance(b);
  if (first === null || second === null) return null;

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * Whether a stroke would all but vanish on the dark canvas, and so should be
 * drawn white there.
 *
 * Only near-black inks qualify: a colour the user picked — blue, red, green —
 * keeps its colour. Values this cannot read (names, "transparent") are left
 * alone.
 *
 * @param {unknown} color
 * @returns {boolean}
 */
export function needsLightInkOnDarkCanvas(color) {
  const contrast = getContrastRatio(color, DARK_CANVAS);
  return contrast !== null && contrast < MIN_DARK_CANVAS_CONTRAST;
}
