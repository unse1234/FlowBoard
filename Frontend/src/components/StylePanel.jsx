import {
  Brush,
  CircleDot,
  CircleDotDashed,
  CornerDownRight,
  Droplets,
  Eye,
  Minus,
  PaintBucket,
  Palette,
  PenLine,
  Slash,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { useThemeContext } from "../features/theme/ThemeProvider.jsx";
import { RENDER_STYLES } from "../constants/canvas";
import { TOOLS } from "../constants/tools";
import { getShapeStyle } from "../utils/styleUtils";
import { isBendable } from "../utils/shapeUtils";

const ICON_SIZE = 16;

function IconButton({ active, title, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`grid h-8 flex-1 place-items-center rounded-md border transition ${
        active
          ? "border-gray-950 bg-gray-950 text-white dark:border-slate-100 dark:bg-slate-700 dark:text-white"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

export default function StylePanel({
  tool,
  selectedShape,
  activeStyle,
  onStyleChange,
}) {
  const { isDark } = useThemeContext();
  const style = selectedShape ? getShapeStyle(selectedShape) : activeStyle;

  const canBend = selectedShape
    ? isBendable(selectedShape)
    : tool === TOOLS.LINE || tool === TOOLS.ARROW;

  const opacityPct = Math.round((style.opacity ?? 1) * 100);

  const panelBg = isDark
    ? "border-slate-700 bg-slate-900 text-slate-100"
    : "border-gray-200 bg-white text-slate-900";

  return (
    <div className="fixed right-3 top-1/2 z-50 -translate-y-1/2">
      <div className={`w-56 rounded-lg border p-3 font-syne shadow ${panelBg}`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-gray-500 dark:text-slate-400">
            {selectedShape ? "Selection" : "Tool Style"}
          </div>
          <SlidersHorizontal
            size={ICON_SIZE}
            className="text-gray-500 dark:text-slate-300"
          />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <label
            title="Stroke color"
            className={`relative flex h-9 cursor-pointer items-center gap-2 overflow-hidden rounded-md border px-2 ${
              isDark
                ? "border-slate-700 bg-slate-900 text-slate-100"
                : "border-gray-200 bg-white text-slate-900"
            }`}
          >
            <Palette size={ICON_SIZE} className="z-10 text-white drop-shadow" />
            <span className="z-10 font-syne-mono text-[10px] text-white drop-shadow">
              {style.stroke}
            </span>
            <span
              className="absolute inset-0"
              style={{ background: style.stroke }}
            />
            <input
              type="color"
              value={style.stroke}
              onChange={(e) => onStyleChange("stroke", e.target.value)}
              className="absolute inset-0 opacity-0"
              aria-label="Stroke color"
            />
          </label>

          <label
            title="Fill color"
            className={`relative flex h-9 cursor-pointer items-center gap-2 overflow-hidden rounded-md border px-2 ${
              isDark
                ? "border-slate-700 bg-slate-900 text-slate-100"
                : "border-gray-200 bg-white text-slate-900"
            } ${style.fillEnabled ? "" : "opacity-40"}`}
          >
            <PaintBucket
              size={ICON_SIZE}
              className="z-10 text-white drop-shadow"
            />
            <span className="z-10 font-syne-mono text-[10px] text-white drop-shadow">
              {style.fill}
            </span>
            <span
              className="absolute inset-0"
              style={{ background: style.fill }}
            />
            <input
              type="color"
              value={style.fill}
              disabled={!style.fillEnabled}
              onChange={(e) => onStyleChange("fill", e.target.value)}
              className="absolute inset-0 opacity-0"
              aria-label="Fill color"
            />
          </label>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <PaintBucket
            size={ICON_SIZE}
            className="text-gray-600 dark:text-slate-300"
          />
          <button
            type="button"
            onClick={() => onStyleChange("fillEnabled", !style.fillEnabled)}
            className={`flex h-5 w-9 items-center rounded-full px-1 transition ${
              style.fillEnabled
                ? "bg-gray-950 dark:bg-slate-700"
                : isDark
                  ? "bg-slate-700"
                  : "bg-gray-300"
            }`}
            title="Toggle fill"
            aria-label="Toggle fill"
          >
            <span
              className={`h-3 w-3 rounded-full transition ${
                style.fillEnabled ? "translate-x-4 bg-white" : "bg-slate-100"
              }`}
            />
          </button>
        </div>

        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
            <Minus size={ICON_SIZE} />
            <span
              className={`font-syne-mono ${isDark ? "text-slate-100" : "text-gray-800"}`}
            >
              {style.strokeWidth}px
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            value={style.strokeWidth}
            onChange={(e) =>
              onStyleChange("strokeWidth", Number(e.target.value))
            }
            className="w-full"
            aria-label="Stroke width"
          />
        </div>

        <div className="mb-3 space-y-2">
          <div
            className={`flex items-center gap-2 text-xs ${isDark ? "text-slate-300" : "text-gray-600"}`}
          >
            <Eye size={ICON_SIZE} />
            <span
              className={`font-syne-mono ${isDark ? "text-slate-100" : "text-gray-800"}`}
            >
              {opacityPct}%
            </span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={opacityPct}
            onChange={(e) =>
              onStyleChange("opacity", Number(e.target.value) / 100)
            }
            className="w-full"
            aria-label="Opacity"
          />
        </div>

        <div
          className={`my-3 h-px ${isDark ? "bg-slate-700" : "bg-gray-100"}`}
        />

        <div className="mb-3 flex gap-2">
          <IconButton
            title="Rough"
            active={style.renderStyle === RENDER_STYLES.ROUGH}
            onClick={() => onStyleChange("renderStyle", RENDER_STYLES.ROUGH)}
            isDark={isDark}
          >
            <Brush size={ICON_SIZE} />
          </IconButton>
          <IconButton
            title="Clean"
            active={style.renderStyle === RENDER_STYLES.CLEAN}
            onClick={() => onStyleChange("renderStyle", RENDER_STYLES.CLEAN)}
            isDark={isDark}
          >
            <PenLine size={ICON_SIZE} />
          </IconButton>
        </div>

        <div className="mb-3 flex gap-2">
          <IconButton
            title="Round corners"
            active={style.edgeStyle === "round"}
            onClick={() => onStyleChange("edgeStyle", "round")}
            isDark={isDark}
          >
            <CircleDot size={ICON_SIZE} />
          </IconButton>
          <IconButton
            title="Sharp corners"
            active={style.edgeStyle === "sharp"}
            onClick={() => onStyleChange("edgeStyle", "sharp")}
            isDark={isDark}
          >
            <Square size={ICON_SIZE} />
          </IconButton>
        </div>

        <div className="mb-3 flex gap-2">
          <IconButton
            title="Solid stroke"
            active={style.strokeStyle === "solid"}
            onClick={() => onStyleChange("strokeStyle", "solid")}
            isDark={isDark}
          >
            <Minus size={ICON_SIZE} />
          </IconButton>
          <IconButton
            title="Dashed stroke"
            active={style.strokeStyle === "dashed"}
            onClick={() => onStyleChange("strokeStyle", "dashed")}
            isDark={isDark}
          >
            <Slash size={ICON_SIZE} />
          </IconButton>
          <IconButton
            title="Dotted stroke"
            active={style.strokeStyle === "dotted"}
            onClick={() => onStyleChange("strokeStyle", "dotted")}
            isDark={isDark}
          >
            <CircleDotDashed size={ICON_SIZE} />
          </IconButton>
        </div>

        {canBend && (
          <div className="flex gap-2">
            <IconButton
              title="Corner bend"
              active={style.bendStyle === "corner"}
              onClick={() => onStyleChange("bendStyle", "corner")}
            >
              <CornerDownRight size={ICON_SIZE} />
            </IconButton>
            <IconButton
              title="Straight"
              active={style.bendStyle === "straight"}
              onClick={() => onStyleChange("bendStyle", "straight")}
            >
              <Minus size={ICON_SIZE} />
            </IconButton>
            <IconButton
              title="Arc"
              active={style.bendStyle === "arc"}
              onClick={() => onStyleChange("bendStyle", "arc")}
            >
              <Droplets size={ICON_SIZE} />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
