import { useEffect, useRef, useState } from "react";
import { TOOLS } from "../constants/tools.js";
import {
  getTextEditorStyle,
  measureTextArea,
} from "../domain/text/textMetrics";

export default function TextEditorOverlay({
  shape,
  transform,
  onCommit,
  onCancel,
}) {
  const textareaRef = useRef(null);
  const isCancellingRef = useRef(false);
  const [value, setValue] = useState(shape?.text ?? "");

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.select();
    });
  }, [shape?.id]);

  // A note is a fixed card, so its editor scrolls inside the card instead of
  // growing past its edge. Everything else grows to fit what was typed.
  const autoGrow = shape?.type !== TOOLS.NOTE;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !autoGrow) return;

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight + 4}px`;
  }, [autoGrow, value, shape?.id]);

  if (!shape) return null;

  const editorStyle = getTextEditorStyle({ shape, transform });

  const commit = () => {
    const textarea = textareaRef.current;
    const measuredSize = textarea ? measureTextArea(textarea) : undefined;
    onCommit(shape.id, value, measuredSize);
  };

  return (
    <textarea
      ref={textareaRef}
      value={value}
      aria-label="Edit text"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (isCancellingRef.current) {
          isCancellingRef.current = false;
          return;
        }

        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          isCancellingRef.current = true;
          onCancel(shape.id);
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={[
        "fixed resize-none rounded-sm border-2 border-selection bg-transparent p-0.5 outline-none text-current",
        autoGrow ? "overflow-hidden" : "fb-scroll overflow-y-auto",
      ].join(" ")}
      style={{
        left: editorStyle.left,
        top: editorStyle.top,
        width: editorStyle.width,
        minHeight: editorStyle.minHeight,
        height: editorStyle.height,
        zIndex: 1000,
        fontSize: editorStyle.fontSize,
        fontFamily: editorStyle.fontFamily,
        color: editorStyle.color,
        lineHeight: editorStyle.lineHeight,
      }}
    />
  );
}
