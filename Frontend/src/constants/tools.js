/**
 * Tool Constants
 *
 * Defines all available drawing tools and their string identifiers.
 * Used throughout the application to determine which tool is active
 * and how to handle mouse/canvas interactions.
 */
export const TOOLS = {
  SELECT: "select", // Select, move, and transform existing shapes
  PAN: "pan", // Pan around the canvas (reserved for future use)
  RECT: "rect", // Draw rectangles
  CIRCLE: "circle", // Draw circles and ellipses
  LINE: "line", // Draw straight lines
  ARROW: "arrow", // Draw arrows with heads
  PEN: "pen", // Freehand drawing
  LASER: "laser", // Laser pointer (temporary visual indicator)
  ERASER: "eraser", // Erase shapes by clicking/dragging over them
};
