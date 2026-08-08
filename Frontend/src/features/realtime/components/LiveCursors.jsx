import { Circle, Group, Line, Text } from "react-konva";

export default function LiveCursors({ cursors }) {
  return (
    <>
      {cursors.map((cursor) => (
        <Group key={cursor.userId} x={cursor.x} y={cursor.y} listening={false}>
          <Line
            points={[0, 0, 0, 18, 5, 13, 9, 22, 13, 20, 9, 11, 16, 11]}
            closed
            fill={cursor.color}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          <Circle x={24} y={2} radius={4} fill={cursor.color} />
          <Text
            x={32}
            y={-6}
            text={cursor.username}
            fontSize={12}
            fontFamily="Inter"
            fill={cursor.color}
          />
        </Group>
      ))}
    </>
  );
}
