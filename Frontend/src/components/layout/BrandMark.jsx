import { cx } from "../ui/cx.js";

/**
 * BrandMark — the FlowBoard lockup.
 *
 * An ink tile holding two nodes joined by a flow line: one lemon (the signal),
 * one white. The tile does not theme — it is identity, not chrome — so it reads
 * the same on paper and on graphite.
 */
export default function BrandMark({ showWordmark = true, className = "" }) {
  return (
    <span className={cx("flex select-none items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-tile shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1.5" y="2" width="6.5" height="4.75" rx="1.25" className="fill-brand-glyph" />
          <rect x="8" y="9.25" width="6.5" height="4.75" rx="1.25" className="fill-white" />
          <path
            d="M4.75 6.75v1.5a3.25 3.25 0 0 0 3.25 3.25"
            className="stroke-white"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>

      {showWordmark ? (
        <span className="text-title tracking-[-0.02em] text-text">FlowBoard</span>
      ) : null}
    </span>
  );
}
