import { useRef, useState } from "react";
import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Eye,
  ImagePlus,
  Lock,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  Type,
  Unlock,
  Zap,
} from "lucide-react";
import { STROKE_SWATCHES } from "../../constants/canvas.js";
import { TOOLS } from "../../constants/tools.js";
import { getShapeStyle } from "../../utils/styleUtils.js";
import { Segmented, SliderRow, Toggle } from "../ui/index.js";

/**
 * The tool tabs from the mobile design. Grouping mirrors how the tools are
 * reached by thumb: drawing tools first, then shapes, then text and media.
 */
const TABS = [
  { value: "draw", label: "Draw" },
  { value: "shapes", label: "Shapes" },
  { value: "text", label: "Text" },
  { value: "more", label: "More" },
];

const TAB_TOOLS = {
  draw: [
    { id: TOOLS.SELECT, label: "Select", Icon: MousePointer2 },
    { id: TOOLS.PEN, label: "Pen", Icon: Pencil },
    { id: TOOLS.ERASER, label: "Eraser", Icon: Eraser },
    { id: TOOLS.LASER, label: "Laser", Icon: Zap },
  ],
  shapes: [
    { id: TOOLS.RECT, label: "Rectangle", Icon: Square },
    { id: TOOLS.CIRCLE, label: "Ellipse", Icon: Circle },
    { id: TOOLS.DIAMOND, label: "Diamond", Icon: Diamond },
    { id: TOOLS.LINE, label: "Line", Icon: Minus },
    { id: TOOLS.ARROW, label: "Arrow", Icon: ArrowRight },
  ],
  text: [{ id: TOOLS.TEXT, label: "Text", Icon: Type }],
  more: [
    { id: TOOLS.IMAGE, label: "Image", Icon: ImagePlus, opensFile: true },
  ],
};

/**
 * ToolsSheet — the body of the mobile tool picker.
 *
 * Holds the same state the desktop toolbar and style panel drive, so a change
 * made on a phone is the same change made on a laptop. Picking a tool closes
 * the sheet, since the next action is always on the canvas.
 */
export default function ToolsSheet({
  tool,
  setTool,
  toolLocked,
  setToolLocked,
  activeStyle,
  selectedShape,
  onStyleChange,
  onImageFileSelected,
  onToolPicked,
}) {
  const [tab, setTab] = useState("draw");
  const fileInputRef = useRef(null);

  const style = selectedShape ? getShapeStyle(selectedShape) : activeStyle;
  const strokeWidth = style.strokeWidth;
  const opacityPct = Math.round((style.opacity ?? 1) * 100);

  const handleToolClick = (entry) => {
    if (entry.opensFile) {
      fileInputRef.current?.click();
      return;
    }
    setTool(entry.id);
    onToolPicked?.();
  };

  return (
    <div className="space-y-4">
      <Segmented options={TABS} value={tab} onChange={setTab} size="md" />

      {/* ── Tool grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {TAB_TOOLS[tab].map((entry) => {
          const Icon = entry.Icon;
          const isActive = tool === entry.id;

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleToolClick(entry)}
              className={[
                "flex flex-col items-center gap-1.5 rounded-card border p-3",
                "transition-colors duration-150",
                isActive
                  ? "border-transparent bg-ink text-on-ink"
                  : "border-border bg-surface-soft text-text-muted active:bg-surface-hover",
              ].join(" ")}
            >
              <Icon size={20} strokeWidth={2} />
              <span className="text-[11px] font-medium">{entry.label}</span>
            </button>
          );
        })}

        {/* Tool lock lives with the tools it modifies. */}
        {tab === "more" && (
          <button
            type="button"
            onClick={() => setToolLocked((locked) => !locked)}
            className={[
              "flex flex-col items-center gap-1.5 rounded-card border p-3",
              "transition-colors duration-150",
              toolLocked
                ? "border-transparent bg-ink text-on-ink"
                : "border-border bg-surface-soft text-text-muted active:bg-surface-hover",
            ].join(" ")}
          >
            {toolLocked ? <Lock size={20} /> : <Unlock size={20} />}
            <span className="text-[11px] font-medium">Keep tool</span>
          </button>
        )}
      </div>

      {/* ── Colour swatches ──────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        {STROKE_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Stroke ${swatch}`}
            onClick={() => onStyleChange("stroke", swatch)}
            className={[
              "h-9 w-9 rounded-full border-2 transition-transform duration-150",
              style.stroke?.toLowerCase() === swatch
                ? "scale-110 border-brand"
                : "border-border",
            ].join(" ")}
            style={{ background: swatch }}
          />
        ))}
      </div>

      {/* ── Stroke, opacity, fill ────────────────────────────────── */}
      <SliderRow
        icon={Minus}
        label="Stroke width"
        min={1}
        max={20}
        value={strokeWidth}
        displayValue={`${strokeWidth}px`}
        onChange={(next) => onStyleChange("strokeWidth", next)}
      />

      <SliderRow
        icon={Eye}
        label="Opacity"
        min={10}
        max={100}
        step={5}
        value={opacityPct}
        displayValue={`${opacityPct}%`}
        onChange={(next) => onStyleChange("opacity", next / 100)}
      />

      <div className="flex items-center justify-between rounded-card border border-border bg-surface-soft px-3 py-2.5">
        <span className="text-[13px] font-medium text-text">Fill shape</span>
        <Toggle
          checked={Boolean(style.fillEnabled)}
          onChange={() => onStyleChange("fillEnabled", !style.fillEnabled)}
          label="Toggle fill"
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const [file] = event.target.files ?? [];
          if (file) {
            onImageFileSelected(file);
            onToolPicked?.();
          }
          event.target.value = "";
        }}
      />
    </div>
  );
}
