/* eslint-disable react-refresh/only-export-components */
import { Arrow, Ellipse, Group, Line, Rect, Text } from "react-konva";
import { NOTE_DEFAULTS, RENDER_STYLES } from "../../constants/canvas";
import { TOOLS } from "../../constants/tools";
import { getBox, getLinePoints } from "../../utils/shapeUtils";
import {
  getFillColor,
  getStrokeProps as getStrokeNodeProps,
} from "../../domain/render/shapeVisuals.js";
import { getBaseShapeStyle, getReadableInk, getShapeStyle } from "../../utils/styleUtils";
import ImageShape from "./ImageShape";

const hashShapeId = (id) =>
  String(id)
    .split("")
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);

const roughOffset = (shape, index, amount = 1.8) => {
  const seed = (hashShapeId(shape.id) * 97 + index * 37) % 11;
  return ((seed - 5) / 5) * amount;
};

/**
 * What a renderer needs to draw a shape.
 *
 * `strokeProps` deliberately carries no opacity. Opacity belongs to the shape
 * and is set once, on the outermost node, by ShapeRenderer — Konva multiplies a
 * group's opacity into its children, so setting it here too would composite it
 * twice and make a two-stroke sketchy shape darker where the strokes overlap.
 */
const getStrokeProps = (shape, isDark) => {
  const style = getShapeStyle(shape, { isDark });

  return {
    style,
    edgeIsRound: style.edgeStyle === "round",
    fill: getFillColor(shape, { isDark }),
    strokeProps: getStrokeNodeProps(shape, { isDark }),
  };
};

const BoxGroup = ({ shape, nodeProps, children }) => {
  const box = getBox(shape);

  return (
    <Group {...nodeProps} x={box.x} y={box.y} width={box.width} height={box.height}>
      <Rect
        width={box.width}
        height={box.height}
        fill="rgba(0,0,0,0)"
        strokeEnabled={false}
      />
      {children(box)}
    </Group>
  );
};

const CleanRect = ({ shape, nodeProps, isDark }) => {
  const { edgeIsRound, fill, strokeProps } = getStrokeProps(shape, isDark);

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => (
        <Rect
          width={box.width}
          height={box.height}
          fill={fill}
          cornerRadius={edgeIsRound ? 12 : 0}
          {...strokeProps}
        />
      )}
    </BoxGroup>
  );
};

const RoughRect = ({ shape, nodeProps, isDark }) => {
  const { edgeIsRound, fill, strokeProps } = getStrokeProps(shape, isDark);

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => (
        <>
          {fill && (
            <Rect width={box.width} height={box.height} fill={fill} listening={false} />
          )}
          {[0, 1].map((index) => (
            <Rect
              key={index}
              x={roughOffset(shape, index)}
              y={roughOffset(shape, index + 2)}
              width={box.width + roughOffset(shape, index + 4)}
              height={box.height + roughOffset(shape, index + 6)}
              cornerRadius={edgeIsRound ? 12 : 0}
              {...strokeProps}
              fill={undefined}
            />
          ))}
        </>
      )}
    </BoxGroup>
  );
};

const CleanEllipse = ({ shape, nodeProps, isDark }) => {
  const { fill, strokeProps } = getStrokeProps(shape, isDark);

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => {
        const width = Math.max(0, box.width ?? 0);
        const height = Math.max(0, box.height ?? 0);

        const radiusX = width / 2;
        const radiusY = height / 2;

        if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY)) return null;
        if (radiusX <= 0 || radiusY <= 0) return null;

        return (
          <Ellipse
            x={width / 2}
            y={height / 2}
            radiusX={radiusX}
            radiusY={radiusY}
            fill={fill}
            {...strokeProps}
          />
        );
      }}
    </BoxGroup>
  );
};
const RoughEllipse = ({ shape, nodeProps, isDark }) => {
  const { fill, strokeProps } = getStrokeProps(shape, isDark);

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => {
        const width = Math.max(0, box.width ?? 0);
        const height = Math.max(0, box.height ?? 0);

        const radiusX = width / 2;
        const radiusY = height / 2;

        if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY)) return null;
        if (radiusX <= 0 || radiusY <= 0) return null;

        return (
          <>
            {fill && (
              <Ellipse
                x={width / 2}
                y={height / 2}
                radiusX={radiusX}
                radiusY={radiusY}
                fill={fill}
                listening={false}
              />
            )}

            {[0, 1].map((index) => (
              <Ellipse
                key={index}
                x={width / 2 + roughOffset(shape, index)}
                y={height / 2 + roughOffset(shape, index + 2)}
                radiusX={radiusX + roughOffset(shape, index + 4)}
                radiusY={radiusY + roughOffset(shape, index + 6)}
                {...strokeProps}
                fill={undefined}
              />
            ))}
          </>
        );
      }}
    </BoxGroup>
  );
};
const diamondPoints = (box) => [
  box.width / 2,
  0,
  box.width,
  box.height / 2,
  box.width / 2,
  box.height,
  0,
  box.height / 2,
];

const CleanDiamond = ({ shape, nodeProps, isDark }) => {
  const { edgeIsRound, fill, strokeProps } = getStrokeProps(shape, isDark);

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => (
        <Line
          points={diamondPoints(box)}
          closed
          fill={fill}
          tension={edgeIsRound ? 0.08 : 0}
          {...strokeProps}
        />
      )}
    </BoxGroup>
  );
};

const RoughDiamond = ({ shape, nodeProps, isDark }) => {
  const { edgeIsRound, fill, strokeProps } = getStrokeProps(shape, isDark);

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => (
        <>
          {fill && (
            <Line points={diamondPoints(box)} closed fill={fill} listening={false} />
          )}
          {[0, 1].map((index) => (
            <Line
              key={index}
              x={roughOffset(shape, index)}
              y={roughOffset(shape, index + 2)}
              points={diamondPoints(box)}
              closed
              tension={edgeIsRound ? 0.08 : 0}
              {...strokeProps}
              fill={undefined}
            />
          ))}
        </>
      )}
    </BoxGroup>
  );
};

const CleanLine = ({ shape, nodeProps, isDark }) => {
  const { style, edgeIsRound, strokeProps } = getStrokeProps(shape, isDark);
  const Component = shape.type === TOOLS.ARROW ? Arrow : Line;

  return (
    <Component
      {...nodeProps}
      x={shape.x}
      y={shape.y}
      points={shape.type === TOOLS.PEN ? shape.points : getLinePoints(shape)}
      fill={style.stroke}
      pointerLength={shape.type === TOOLS.ARROW ? Math.max(10, style.strokeWidth * 5) : undefined}
      pointerWidth={shape.type === TOOLS.ARROW ? Math.max(10, style.strokeWidth * 5) : undefined}
      tension={shape.type !== TOOLS.PEN && style.bendStyle === "arc" ? 0.45 : 0}
      {...strokeProps}
      lineCap={edgeIsRound ? "round" : "butt"}
      lineJoin={edgeIsRound ? "round" : "miter"}
    />
  );
};

const RoughLine = ({ shape, nodeProps, isDark }) => {
  const { style, edgeIsRound, strokeProps } = getStrokeProps(shape, isDark);
  const Component = shape.type === TOOLS.ARROW ? Arrow : Line;
  const points = shape.type === TOOLS.PEN ? shape.points : getLinePoints(shape);
  // A group has no hit width of its own, so both strokes carry the shape's —
  // otherwise a sketchy line is only as easy to tap or erase as it is thick.
  const { hitStrokeWidth } = nodeProps;

  return (
    <Group {...nodeProps} x={shape.x} y={shape.y}>
      {[0, 1].map((index) => (
        <Component
          key={index}
          hitStrokeWidth={hitStrokeWidth}
          points={points.map((point, pointIndex) =>
            point + roughOffset(shape, index + pointIndex, 1.3)
          )}
          fill={style.stroke}
          pointerLength={shape.type === TOOLS.ARROW ? Math.max(10, style.strokeWidth * 5) : undefined}
          pointerWidth={shape.type === TOOLS.ARROW ? Math.max(10, style.strokeWidth * 5) : undefined}
          tension={shape.type !== TOOLS.PEN && style.bendStyle === "arc" ? 0.45 : 0}
          {...strokeProps}
          lineCap={edgeIsRound ? "round" : "butt"}
          lineJoin={edgeIsRound ? "round" : "miter"}
        />
      ))}
    </Group>
  );
};

const TextShape = ({ shape, nodeProps, isEditing, isDark }) => {
  const { style } = getStrokeProps(shape, isDark);

  return (
    <Text
      {...nodeProps}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      text={shape.text || "Text"}
      visible={!isEditing}
      fontFamily={style.fontFamily}
      fontSize={style.fontSize}
      fill={style.stroke}
      lineHeight={1.25}
      padding={2}
    />
  );
};

/**
 * A sticky note: an opaque card that owns its own text.
 *
 * The text colour is derived from the note's fill rather than taken from
 * `style.stroke`, because getShapeStyle flips dark strokes to white in dark
 * mode — which would paint white text onto a pale yellow note.
 *
 * Notes render identically in both the sketchy and clean strategies; a wobbly
 * sticky reads as a mistake rather than a style.
 */
const NoteShape = ({ shape, nodeProps, isEditing }) => {
  const style = getBaseShapeStyle(shape);
  const fill = shape.style?.fill ?? NOTE_DEFAULTS.fill;
  const padding = NOTE_DEFAULTS.padding;

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => (
        <>
          <Rect
            width={box.width}
            height={box.height}
            fill={fill}
            cornerRadius={2}
            shadowColor="#0f172a"
            shadowOpacity={0.18}
            shadowBlur={8}
            shadowOffsetY={3}
          />
          <Text
            x={padding}
            y={padding}
            width={Math.max(0, box.width - padding * 2)}
            height={Math.max(0, box.height - padding * 2)}
            text={shape.text || ""}
            visible={!isEditing}
            fontFamily={style.fontFamily}
            fontSize={style.fontSize}
            fill={getReadableInk(fill)}
            lineHeight={1.3}
            wrap="word"
            ellipsis
            listening={false}
          />
        </>
      )}
    </BoxGroup>
  );
};

const SHARED_RENDERERS = {
  [TOOLS.TEXT]: TextShape,
  [TOOLS.IMAGE]: ImageShape,
  [TOOLS.NOTE]: NoteShape,
};

const CLEAN_RENDERERS = {
  [TOOLS.RECT]: CleanRect,
  [TOOLS.CIRCLE]: CleanEllipse,
  [TOOLS.DIAMOND]: CleanDiamond,
  [TOOLS.LINE]: CleanLine,
  [TOOLS.ARROW]: CleanLine,
  [TOOLS.PEN]: CleanLine,
  ...SHARED_RENDERERS,
};

const ROUGH_RENDERERS = {
  [TOOLS.RECT]: RoughRect,
  [TOOLS.CIRCLE]: RoughEllipse,
  [TOOLS.DIAMOND]: RoughDiamond,
  [TOOLS.LINE]: RoughLine,
  [TOOLS.ARROW]: RoughLine,
  [TOOLS.PEN]: RoughLine,
  ...SHARED_RENDERERS,
};

export const RENDERING_STRATEGIES = {
  [RENDER_STYLES.CLEAN]: CLEAN_RENDERERS,
  [RENDER_STYLES.ROUGH]: ROUGH_RENDERERS,
};

export function getRendererForShape(shape) {
  const style = getBaseShapeStyle(shape);
  const strategy =
    RENDERING_STRATEGIES[style.renderStyle] ??
    RENDERING_STRATEGIES[RENDER_STYLES.CLEAN];

  return strategy[shape.type] ?? null;
}

export function renderShape({ shape, nodeProps, isEditing, isDark = false }) {
  const Renderer = getRendererForShape(shape);
  if (!Renderer) return null;

  return (
    <Renderer shape={shape} nodeProps={nodeProps} isEditing={isEditing} isDark={isDark} />
  );
}
