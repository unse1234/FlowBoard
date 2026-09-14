// @ts-check

/**
 * The slice of the board currently on screen, in world coordinates.
 *
 * Screen and world are related by `world = (screen - transform.{x,y}) / scale`,
 * so the visible region is the origin run backwards through that and the window
 * size divided by the zoom. The grid, the alignment guides and the minimap all
 * need exactly this, which is why it lives here rather than in any one of them.
 *
 * @param {{ x: number, y: number, scale: number }} transform
 * @param {{ width: number, height: number }} viewportSize
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function getVisibleWorldBounds(transform, viewportSize) {
  const scale = transform.scale || 1;

  return {
    x: withoutNegativeZero(-transform.x / scale),
    y: withoutNegativeZero(-transform.y / scale),
    width: viewportSize.width / scale,
    height: viewportSize.height / scale,
  };
}

/**
 * Negating zero produces -0, which compares equal to 0 but renders and
 * serialises as "-0". Keep it out of coordinates that reach the canvas.
 *
 * @param {number} value
 * @returns {number}
 */
function withoutNegativeZero(value) {
  return value === 0 ? 0 : value;
}
