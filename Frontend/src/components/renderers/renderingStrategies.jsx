/* eslint-disable react-refresh/only-export-components */
import { Arrow, Ellipse, Group, Line, Rect, Text } from "react-konva";
import { RENDER_STYLES } from "../../constants/canvas";
import { TOOLS } from "../../constants/tools";
import { getBox, getLinePoints } from "../../utils/shapeUtils";
import { getShapeStyle, getStrokeDash } from "../../utils/styleUtils";
import ImageShape from "./ImageShape";

const roughOffset = (shape, index, amount = 1.8) => {
  const seed = (shape.id * 97 + index * 37) % 11;
  return ((seed - 5) / 5) * amount;
};

const getStrokeProps = (shape) => {
  const style = getShapeStyle(shape);
  const edgeIsRound = style.edgeStyle === "round";

  return {
    style,
    edgeIsRound,
    strokeProps: {
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      dash: getStrokeDash(style),
      opacity: style.opacity,
      lineCap: edgeIsRound ? "round" : "butt",
      lineJoin: edgeIsRound ? "round" : "miter",
    },
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

const CleanRect = ({ shape, nodeProps }) => {
  const { style, edgeIsRound, strokeProps } = getStrokeProps(shape);

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => (
        <Rect
          width={box.width}
          height={box.height}
          fill={style.fillEnabled ? style.fill : undefined}
          cornerRadius={edgeIsRound ? 12 : 0}
          {...strokeProps}
        />
      )}
    </BoxGroup>
  );
};

const RoughRect = ({ shape, nodeProps }) => {
  const { style, edgeIsRound, strokeProps } = getStrokeProps(shape);

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => (
        <>
          {style.fillEnabled && (
            <Rect
              width={box.width}
              height={box.height}
              fill={style.fill}
              opacity={style.opacity * 0.18}
              listening={false}
            />
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

const CleanEllipse = ({ shape, nodeProps }) => {
  const { style, strokeProps } = getStrokeProps(shape);

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
            fill={style.fillEnabled ? style.fill : undefined}
            {...strokeProps}
          />
        );
      }}
    </BoxGroup>
  );
};
const RoughEllipse = ({ shape, nodeProps }) => {
  const { style, strokeProps } = getStrokeProps(shape);

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
            {style.fillEnabled && (
              <Ellipse
                x={width / 2}
                y={height / 2}
                radiusX={radiusX}
                radiusY={radiusY}
                fill={style.fill}
                opacity={style.opacity * 0.18}
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

const CleanDiamond = ({ shape, nodeProps }) => {
  const { style, edgeIsRound, strokeProps } = getStrokeProps(shape);

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => (
        <Line
          points={diamondPoints(box)}
          closed
          fill={style.fillEnabled ? style.fill : undefined}
          tension={edgeIsRound ? 0.08 : 0}
          {...strokeProps}
        />
      )}
    </BoxGroup>
  );
};

const RoughDiamond = ({ shape, nodeProps }) => {
  const { style, edgeIsRound, strokeProps } = getStrokeProps(shape);

  return (
    <BoxGroup shape={shape} nodeProps={nodeProps}>
      {(box) => (
        <>
          {style.fillEnabled && (
            <Line
              points={diamondPoints(box)}
              closed
              fill={style.fill}
              opacity={style.opacity * 0.18}
              listening={false}
            />
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

const CleanLine = ({ shape, nodeProps }) => {
  const { style, edgeIsRound, strokeProps } = getStrokeProps(shape);
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

const RoughLine = ({ shape, nodeProps }) => {
  const { style, edgeIsRound, strokeProps } = getStrokeProps(shape);
  const Component = shape.type === TOOLS.ARROW ? Arrow : Line;
  const points = shape.type === TOOLS.PEN ? shape.points : getLinePoints(shape);

  return (
    <Group {...nodeProps} x={shape.x} y={shape.y}>
      {[0, 1].map((index) => (
        <Component
          key={index}
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

const TextShape = ({ shape, nodeProps, isEditing }) => {
  const { style } = getStrokeProps(shape);

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
      opacity={style.opacity}
      lineHeight={1.25}
      padding={2}
    />
  );
};

const SHARED_RENDERERS = {
  [TOOLS.TEXT]: TextShape,
  [TOOLS.IMAGE]: ImageShape,
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
  const style = getShapeStyle(shape);
  const strategy =
    RENDERING_STRATEGIES[style.renderStyle] ??
    RENDERING_STRATEGIES[RENDER_STYLES.CLEAN];

  return strategy[shape.type] ?? null;
}

export function renderShape({ shape, nodeProps, isEditing }) {
  const Renderer = getRendererForShape(shape);
  if (!Renderer) return null;

  return <Renderer shape={shape} nodeProps={nodeProps} isEditing={isEditing} />;
}
