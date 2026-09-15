import { memo, useId } from "react";
import { DEFAULT_STYLE, NOTE_DEFAULTS } from "../../constants/canvas.js";
import { TOOLS } from "../../constants/tools.js";

const PADDING = 16;
const ARROW_HEAD = 10;

/** Ink strokes follow the theme, as they do on the canvas; chosen colours stay as they are. */
function previewStroke(stroke) {
  return !stroke || stroke === DEFAULT_STYLE.stroke ? "var(--fb-text)" : stroke;
}

/**
 * DiagramPreview — a static drawing of the shapes Insert will add.
 *
 * It draws the same shape objects an insert creates, only at the origin, so
 * the preview is what the board will get. SVG rather than a second Konva stage:
 * it is small, needs no interaction and costs nothing to throw away. Labels
 * are React text children, so nothing the model wrote is parsed as markup.
 */
function DiagramPreview({ shapes, bounds, title }) {
  const markerId = `ai-preview-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const viewBox = [
    bounds.x - PADDING,
    bounds.y - PADDING,
    bounds.width + PADDING * 2,
    bounds.height + PADDING * 2,
  ].join(" ");

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-canvas">
      <svg
        role="img"
        aria-label={`Preview of ${title || "the generated diagram"}`}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="block h-48 w-full"
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth={ARROW_HEAD}
            markerHeight={ARROW_HEAD}
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="var(--fb-text)" />
          </marker>
        </defs>
        {shapes.map((shape) => (
          <PreviewShape key={shape.id} shape={shape} markerId={markerId} />
        ))}
      </svg>
    </div>
  );
}

function PreviewShape({ shape, markerId }) {
  const style = shape.style ?? {};
  const stroke = previewStroke(style.stroke);
  const outline = {
    fill: "none",
    stroke,
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke",
  };

  switch (shape.type) {
    case TOOLS.RECT:
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={style.edgeStyle === "round" ? 12 : 0}
          {...outline}
        />
      );
    case TOOLS.CIRCLE:
      return (
        <ellipse
          cx={shape.x + shape.width / 2}
          cy={shape.y + shape.height / 2}
          rx={shape.width / 2}
          ry={shape.height / 2}
          {...outline}
        />
      );
    case TOOLS.DIAMOND: {
      const { x, y, width, height } = shape;
      const points = [
        [x + width / 2, y],
        [x + width, y + height / 2],
        [x + width / 2, y + height],
        [x, y + height / 2],
      ];
      return <polygon points={points.map((point) => point.join(",")).join(" ")} {...outline} />;
    }
    case TOOLS.NOTE:
      return (
        <g>
          <rect
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx={2}
            fill={style.fill ?? NOTE_DEFAULTS.fill}
          />
          <PreviewText shape={shape} fill="#111827" inset={NOTE_DEFAULTS.padding} lineHeight={1.3} />
        </g>
      );
    case TOOLS.ARROW: {
      const points = [];
      for (let index = 0; index + 1 < shape.points.length; index += 2) {
        points.push(`${shape.x + shape.points[index]},${shape.y + shape.points[index + 1]}`);
      }
      return (
        <polyline
          points={points.join(" ")}
          {...outline}
          strokeDasharray={style.strokeStyle === "dashed" ? "8 5" : undefined}
          markerEnd={`url(#${markerId})`}
        />
      );
    }
    case TOOLS.TEXT:
      return <PreviewText shape={shape} fill={stroke} inset={2} lineHeight={1.25} />;
    default:
      return null;
  }
}

function PreviewText({ shape, fill, inset, lineHeight }) {
  const fontSize = shape.style?.fontSize ?? DEFAULT_STYLE.fontSize;
  const lines = String(shape.text ?? "").split("\n");
  const x = shape.x + inset;

  return (
    <text
      x={x}
      y={shape.y + inset}
      fontFamily={shape.style?.fontFamily ?? DEFAULT_STYLE.fontFamily}
      fontSize={fontSize}
      fill={fill}
    >
      {lines.map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? fontSize * lineHeight * 0.8 : fontSize * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export default memo(DiagramPreview);
