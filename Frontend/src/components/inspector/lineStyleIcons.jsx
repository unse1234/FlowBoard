/**
 * Line-style glyphs on Lucide's 24px grid, since Lucide has no dashed or dotted
 * line icon. They take the same props a Lucide icon does, but never draw
 * thinner than 2.5 — at icon size a hairline dash pattern stops reading as one.
 */
const MIN_GLYPH_STROKE = 2.5;

function LineGlyph({ size = 16, strokeWidth = 1.75, dash, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={Math.max(strokeWidth, MIN_GLYPH_STROKE)}
      strokeLinecap="round"
      {...props}
    >
      <path d="M2.5 12h19" strokeDasharray={dash} />
    </svg>
  );
}

export function SolidLineIcon(props) {
  return <LineGlyph {...props} />;
}

export function DashedLineIcon(props) {
  return <LineGlyph {...props} dash="4.5 4" />;
}

export function DottedLineIcon(props) {
  return <LineGlyph {...props} dash="0.01 4.75" />;
}
