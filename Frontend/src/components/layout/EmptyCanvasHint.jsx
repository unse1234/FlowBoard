import { memo } from "react";
import { TOOL_SHORTCUTS, TOOL_LABELS } from "../../constants/toolMeta.js";
import { TOOLS } from "../../constants/tools.js";
import { usePresence } from "../../hooks/usePresence.js";
import { KbdCombo } from "../ui/index.js";

const QUICK_TOOLS = [TOOLS.RECT, TOOLS.PEN, TOOLS.TEXT, TOOLS.NOTE];

/**
 * EmptyCanvasHint — a quiet first step on an empty board.
 *
 * Centred, never interactive (the canvas under it stays fully usable) and gone
 * the moment there is something on the board or a drawing tool is picked.
 * Keyboard users see the real single-key shortcuts; touch users are pointed at
 * the dock instead of at keys they do not have.
 */
function EmptyCanvasHint({ visible, touch = false }) {
  const { mounted, state } = usePresence(visible, 150);
  if (!mounted) return null;

  return (
    <div
      data-state={state}
      className="fb-fade pointer-events-none fixed inset-0 z-10 grid select-none place-items-center px-6"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-heading text-text">Start with a shape, a note or a sketch</p>

        {touch ? (
          <p className="text-body text-text-muted">
            Pick a tool below, then tap or drag on the canvas.
          </p>
        ) : (
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-label text-text-muted">
            {QUICK_TOOLS.map((tool) => (
              <li key={tool} className="flex items-center gap-1.5">
                <KbdCombo combo={TOOL_SHORTCUTS[tool]} />
                <span className="sr-only">Press {TOOL_SHORTCUTS[tool]} for</span>
                {TOOL_LABELS[tool]}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default memo(EmptyCanvasHint);
