import { useEffect, useState } from "react";

const getViewportSize = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

export function useViewportSize() {
  const [viewportSize, setViewportSize] = useState(getViewportSize);

  useEffect(() => {
    const handleResize = () => setViewportSize(getViewportSize());

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return viewportSize;
}
