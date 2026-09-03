import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BringToFront,
  Brush,
  CircleDot,
  CircleDotDashed,
  CornerDownRight,
  Droplets,
  Eye,
  Minus,
  PaintBucket,
  PenLine,
  SendToBack,
  Slash,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { RENDER_STYLES, STROKE_SWATCHES } from "../constants/canvas";
import { TOOLS } from "../constants/tools";
import { getShapeStyle } from "../utils/styleUtils";
import { isBendable } from "../utils/shapeUtils";
import {
  IconButton,
  SectionLabel,
  Segmented,
  SliderRow,
  SoonBadge,
  Toggle,
} from "./ui/index.js";

const ICON_SIZE = 15;

/**
 * StylePanel — stroke, fill and shape appearance.
 *
 * Edits the selected shape when there is one, otherwise the style that new
 * shapes will be created with — the header says which.
 *
 * The Layer section is in the design but there is no z-order model on shapes
 * yet (draw order is array order, with no reordering operation in the realtime
 * protocol), so those four controls render disabled.
 */
export default function StylePanel({
  tool,
  selectedShape,
  activeStyle,
  onStyleChange,
  compact = false,
}) {
  const style = selectedShape ? getShapeStyle(selectedShape) : activeStyle;
  const opacityPct = Math.round((style.opacity ?? 1) * 100);

  const canBend = selectedShape
    ? isBendable(selectedShape)
    : tool === TOOLS.LINE || tool === TOOLS.ARROW;

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-center justify-between">
          <SectionLabel>
            {selectedShape ? "Selection" : "Tool style"}
          </SectionLabel>
          <SlidersHorizontal size={14} className="text-text-soft" />
        </div>
      )}

      {/* ── Stroke & fill colour ─────────────────────────────────── */}
      <section className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <ColorField
            label="Stroke"
            icon={PenLine}
            value={style.stroke}
            onChange={(next) => onStyleChange("stroke", next)}
          />
          <ColorField
            label="Fill"
            icon={PaintBucket}
            value={style.fill}
            disabled={!style.fillEnabled}
            onChange={(next) => onStyleChange("fill", next)}
          />
        </div>

        {/* Quick swatches always drive the stroke — the most-changed colour. */}
        <div className="flex items-center gap-1.5">
          {STROKE_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              title={`Stroke ${swatch}`}
              aria-label={`Stroke ${swatch}`}
              onClick={() => onStyleChange("stroke", swatch)}
              className={[
                "h-6 w-6 rounded-full border transition-transform duration-150",
                "hover:scale-110",
                style.stroke?.toLowerCase() === swatch
                  ? "border-brand ring-2 ring-brand/40"
                  : "border-border",
              ].join(" ")}
              style={{ background: swatch }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between rounded-card border border-border bg-surface-soft px-2.5 py-2">
          <span className="flex items-center gap-2 text-[12px] font-medium text-text-muted">
            <PaintBucket size={ICON_SIZE} />
            Fill shape
          </span>
          <Toggle
            checked={Boolean(style.fillEnabled)}
            onChange={() => onStyleChange("fillEnabled", !style.fillEnabled)}
            label="Toggle fill"
          />
        </div>
      </section>

      {/* ── Stroke width & opacity ───────────────────────────────── */}
      <section className="space-y-3">
        <SliderRow
          icon={Minus}
          label="Stroke width"
          min={1}
          max={20}
          value={style.strokeWidth}
          displayValue={`${style.strokeWidth}px`}
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
      </section>

      {/* ── Layer — no z-order model exists yet ──────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <SectionLabel>Layer</SectionLabel>
          <SoonBadge />
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <IconButton disabled title="Send to back — not available yet">
            <SendToBack size={ICON_SIZE} />
          </IconButton>
          <IconButton disabled title="Send backward — not available yet">
            <ArrowDown size={ICON_SIZE} />
          </IconButton>
          <IconButton disabled title="Bring forward — not available yet">
            <ArrowUp size={ICON_SIZE} />
          </IconButton>
          <IconButton disabled title="Bring to front — not available yet">
            <BringToFront size={ICON_SIZE} />
          </IconButton>
        </div>
      </section>

      {/* ── Shape rendering ──────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionLabel>Shape</SectionLabel>

        <Segmented
          value={style.renderStyle}
          onChange={(next) => onStyleChange("renderStyle", next)}
          options={[
            { value: RENDER_STYLES.ROUGH, label: "Sketchy", icon: Brush },
            { value: RENDER_STYLES.CLEAN, label: "Clean", icon: PenLine },
          ]}
        />

        <div className="grid grid-cols-2 gap-1.5">
          <StyleChip
            label="Round"
            icon={CircleDot}
            active={style.edgeStyle === "round"}
            onClick={() => onStyleChange("edgeStyle", "round")}
          />
          <StyleChip
            label="Sharp"
            icon={Square}
            active={style.edgeStyle === "sharp"}
            onClick={() => onStyleChange("edgeStyle", "sharp")}
          />
        </div>
      </section>

      {/* ── Line ─────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionLabel>Line</SectionLabel>

        <div className="grid grid-cols-3 gap-1.5">
          <StyleChip
            label="Solid"
            icon={Minus}
            active={style.strokeStyle === "solid"}
            onClick={() => onStyleChange("strokeStyle", "solid")}
          />
          <StyleChip
            label="Dashed"
            icon={Slash}
            active={style.strokeStyle === "dashed"}
            onClick={() => onStyleChange("strokeStyle", "dashed")}
          />
          <StyleChip
            label="Dotted"
            icon={CircleDotDashed}
            active={style.strokeStyle === "dotted"}
            onClick={() => onStyleChange("strokeStyle", "dotted")}
          />
        </div>

        {/* Bend only applies to lines and arrows, so it appears only for them. */}
        {canBend && (
          <div className="grid grid-cols-3 gap-1.5">
            <StyleChip
              label="Corner"
              icon={CornerDownRight}
              active={style.bendStyle === "corner"}
              onClick={() => onStyleChange("bendStyle", "corner")}
            />
            <StyleChip
              label="Straight"
              icon={ArrowRight}
              active={style.bendStyle === "straight"}
              onClick={() => onStyleChange("bendStyle", "straight")}
            />
            <StyleChip
              label="Arc"
              icon={Droplets}
              active={style.bendStyle === "arc"}
              onClick={() => onStyleChange("bendStyle", "arc")}
            />
          </div>
        )}
      </section>
    </div>
  );
}

/** Swatch button that opens the native colour picker. */
function ColorField({ label, icon, value, disabled = false, onChange }) {
  const Icon = icon;

  return (
    <label
      title={`${label} colour`}
      className={[
        "relative flex h-9 cursor-pointer items-center gap-2 rounded-button border border-border px-2",
        "bg-surface-soft transition-colors duration-150 hover:bg-surface-hover",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon size={13} className="shrink-0 text-text-soft" />
      <span
        className="h-4 w-4 shrink-0 rounded-full border border-border-strong"
        style={{ background: value }}
      />
      <span className="truncate text-[10px] font-medium text-text-muted uppercase">
        {value}
      </span>
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        // Stretched over the label rather than visually hidden, so the native
        // picker pops up anchored to the swatch the user actually clicked.
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        aria-label={`${label} colour`}
      />
    </label>
  );
}

/** Labelled toggle chip used by the Shape and Line sections. */
function StyleChip({ label, icon, active, onClick, disabled = false }) {
  const Icon = icon;

  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-8 items-center justify-center gap-1.5 rounded-button border px-1.5",
        "text-[11px] font-medium transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-transparent bg-ink text-on-ink"
          : "border-border bg-surface-soft text-text-muted hover:bg-surface-hover hover:text-text",
      ].join(" ")}
    >
      <Icon size={13} />
      <span className="truncate">{label}</span>
    </button>
  );
}
