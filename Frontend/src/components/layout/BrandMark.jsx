/**
 * BrandMark — the FlowBoard logo lockup.
 *
 * The glyph is inline SVG rather than an icon-font lookup so the mark renders
 * identically regardless of which icon package version is installed.
 */
export default function BrandMark({ showWordmark = true, className = "" }) {
  return (
    <span
      className={["flex items-center gap-2 select-none", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-white shadow-raised">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          {/* Two nodes joined by a flow line — a board reduced to its idea. */}
          <rect x="3" y="4" width="8" height="6" rx="2" fill="currentColor" />
          <rect
            x="13"
            y="14"
            width="8"
            height="6"
            rx="2"
            fill="currentColor"
            opacity="0.75"
          />
          <path
            d="M7 10v3a4 4 0 0 0 4 4h2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>

      {showWordmark && (
        <span className="text-[15px] font-bold tracking-[-0.01em] text-text">
          FlowBoard
        </span>
      )}
    </span>
  );
}
