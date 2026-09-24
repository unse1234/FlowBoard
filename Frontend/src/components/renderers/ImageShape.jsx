import { useEffect, useState } from "react";
import { Image as KonvaImage } from "react-konva";

export default function ImageShape({ shape, nodeProps }) {
  const [imageElement, setImageElement] = useState(null);

  useEffect(() => {
    if (!shape.image?.src) return undefined;

    const image = new window.Image();
    image.onload = () => setImageElement(image);
    image.src = shape.image.src;

    // A decode that finishes after the source changed, or after the shape was
    // deleted, would otherwise show the previous picture or set state on a
    // component that is gone.
    return () => {
      image.onload = null;
    };
  }, [shape.image?.src]);

  // Opacity arrives through nodeProps, like every other shape, so the opacity
  // control and the erase preview both reach an image. It previously reached
  // neither.
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
