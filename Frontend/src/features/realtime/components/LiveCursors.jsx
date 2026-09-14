import { memo } from "react";
import { Group, Label, Path, Tag, Text } from "react-konva";

/** Pointer glyph in screen pixels, tip at the origin. */
const POINTER_PATH = "M1 1 L1 16.5 L5.4 12.6 L8.3 19.2 L11.2 17.9 L8.4 11.5 L14.2 11.3 Z";

/** Label sits below-right of the tip, clear of the pointer body. */
const LABEL_OFFSET = { x: 12, y: 18 };

const MAX_LABEL_LENGTH = 24;

function truncate(name) {
  const text = String(name ?? "Guest");
  return text.length > MAX_LABEL_LENGTH ? `${text.slice(0, MAX_LABEL_LENGTH - 1)}…` : text;
}

/**
 * Other people's cursors.
 *
 * Drawn inside the zoomed board layer, so each cursor is counter-scaled to stay
 * the same size on screen at any zoom. The name label rides with the pointer
 * while it moves and drops away once the person has been still for a moment
 * (`idle`), so a room of parked cursors does not bury the board in labels.
 *
 * @param {Array<{userId: string, username: string, color: string, x: number, y: number, idle?: boolean}>} cursors
 * @param {number} scale - Current canvas zoom
 * @param {string} outlineColor - Theme token that separates a cursor from the canvas
 * @param {string} labelTextColor - Text on the collaborator colour
 */
function LiveCursors({ cursors, scale, outlineColor, labelTextColor }) {
  const inverseScale = 1 / (scale || 1);

  return (
    <>
      {cursors.map((cursor) => (
        <Group
          key={cursor.userId}
          x={cursor.x}
          y={cursor.y}
          scaleX={inverseScale}
          scaleY={inverseScale}
          listening={false}
        >
          <Path
            data={POINTER_PATH}
            fill={cursor.color}
            stroke={outlineColor}
            strokeWidth={1.5}
            lineJoin="round"
            shadowColor="#000000"
            shadowOpacity={0.2}
            shadowBlur={3}
            shadowOffsetY={1}
          />

          {cursor.idle ? null : (
            <Label x={LABEL_OFFSET.x} y={LABEL_OFFSET.y}>
              <Tag fill={cursor.color} cornerRadius={6} />
              <Text
                text={truncate(cursor.username)}
                fontFamily="Inter Tight, Inter, sans-serif"
                fontSize={11}
                fontStyle="600"
                fill={labelTextColor}
                padding={6}
              />
            </Label>
          )}
        </Group>
      ))}
    </>
  );
}

export default memo(LiveCursors);
