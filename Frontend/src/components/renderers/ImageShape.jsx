import { useEffect, useState } from "react";
import { Image as KonvaImage } from "react-konva";

export default function ImageShape({ shape, nodeProps }) {
  const [imageElement, setImageElement] = useState(null);

  useEffect(() => {
    if (!shape.image?.src) return;

    const image = new window.Image();
    image.onload = () => setImageElement(image);
    image.src = shape.image.src;
  }, [shape.image?.src]);

  return (
    <KonvaImage
      {...nodeProps}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      image={imageElement}
    />
  );
}
