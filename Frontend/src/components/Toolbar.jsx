// Toolbar component - displays drawing tool buttons at the top of the whiteboard
import { TOOLS } from "../constants/tools.js";

/**
 * Toolbar Component
 *
 * Fixed toolbar positioned at the top-center of the whiteboard that allows users to
 * select different drawing tools. The active tool is highlighted in black.
 *
 * @param {string} tool - The currently selected tool
 * @param {Function} setTool - Callback function to change the selected tool
 * @returns {JSX.Element} The toolbar UI with tool selection buttons
 */
export default function Toolbar({ tool, setTool, toolLocked, setToolLocked }) {
  // Define all available drawing tools with their labels
  const buttons = [
    { id: TOOLS.SELECT, label: "Select" }, // Select and move shapes
    { id: TOOLS.RECT, label: "Rect" }, // Draw rectangles
    { id: TOOLS.CIRCLE, label: "Circle" }, // Draw circles/ellipses
    { id: TOOLS.LINE, label: "Line" }, // Draw straight lines
    { id: TOOLS.ARROW, label: "Arrow" }, // Draw arrows
    { id: TOOLS.PEN, label: "Pen" }, // Freehand drawing
    { id: TOOLS.LASER, label: "Laser" }, // Laser pointer tool
    { id: TOOLS.ERASER, label: "Erase" }, // Erase shapes
  ];

  return (
    // Fixed toolbar positioned at top-center, styled with shadow and border
    <div className="fixed top-3 right-1/2 translate-x-1/2 bg-white shadow-lg rounded-lg p-2 flex gap-2 z-50  border border-gray-100">
      {/* Render button for each tool */}
      {buttons.map((btn) => (
        <button
          key={btn.id}
          onClick={() => setTool(btn.id)}
          // Highlight active tool with black background
          className={`px-3 py-1 text-sm rounded transition ${
            tool === btn.id
              ? "bg-black text-white"
              : "bg-gray-100 hover:bg-gray-200"
          }`}
        >
          {btn.label}
        </button>
      ))}

      {/* Lock/unlock tool button */}
      <button
        type="button"
        onClick={() => setToolLocked((prev) => !prev)}
        className={`px-3 py-1 text-sm rounded transition ${
          toolLocked ? "bg-black text-white" : "bg-gray-200 hover:bg-gray-200"
        }`}
        title={
          toolLocked
            ? "Locked: keep tool active after drawing"
            : "Unlocked: switch to select after drawing"
        }
      >
        {toolLocked ? "🔒" : "🔓"}
      </button>
    </div>
  );
}
