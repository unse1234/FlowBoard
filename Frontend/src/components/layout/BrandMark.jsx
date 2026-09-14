import { useId } from "react";
import { cx } from "../ui/cx.js";

/**
 * BrandMark — the FlowBoard lockup.
 *
 * An ink tile holding a diamond outline lit from its top vertex — a single
 * shape catching the selection-blue signal, like a shape just drawn and still
 * glowing on the canvas. The tile does not theme — it is identity, not
 * chrome — so it reads the same on paper and on graphite; only the diamond's
 * own gradient carries the glow, top to bottom.
 */
export default function BrandMark({ showWordmark = true, className = "" }) {
  const gradientId = useId();

  return (
    <span className={cx("flex select-none items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-tile shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
      >
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
          <defs>
            <linearGradient id={gradientId} x1="8.5" y1="2.5" x2="8.5" y2="14.5" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#dbe6ff" />
              <stop offset="30%" stopColor="#7c9dff" />
              <stop offset="70%" stopColor="#3a6df0" />
              <stop offset="100%" stopColor="#17234f" />
            </linearGradient>
          </defs>
          <path
            d="M8.5 2.5 L15 8.5 L8.5 14.5 L2 8.5 Z"
            stroke={`url(#${gradientId})`}
            strokeWidth="1.4"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>

      {showWordmark ? (
        <span className="text-title tracking-[-0.02em] text-text">FlowBoard</span>
      ) : null}
    </span>
  );
}
