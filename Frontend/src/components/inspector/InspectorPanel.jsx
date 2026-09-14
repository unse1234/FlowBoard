import { memo, useId, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowUp,
  BringToFront,
  ChevronDown,
  CornerDownRight,
  Group,
  SendToBack,
  Slash,
  Spline,
  Ungroup,
} from "lucide-react";
import {
  DEFAULT_STYLE,
  FILL_SWATCHES,
  FONT_FAMILIES,
  FONT_SIZE_PRESETS,
  NOTE_SWATCHES,
  RENDER_STYLES,
  STROKE_SWATCHES,
} from "../../constants/canvas.js";
import { ALIGNMENTS, AXES } from "../../domain/geometry/alignment.js";
import { getShortcutCombo } from "../../features/shortcuts/boardShortcuts.js";
import { toAriaKeyShortcuts } from "../../features/shortcuts/formatShortcut.js";
import { Button, cx, IconButton, Segmented, SliderRow } from "../ui/index.js";
import { ColorSwatches } from "./ColorSwatches.jsx";
import { SECTION } from "./inspectorModel.js";
import { DashedLineIcon, DottedLineIcon, SolidLineIcon } from "./lineStyleIcons.jsx";

const ICON = { size: 16, strokeWidth: 1.75 };

const STROKE_STYLE_OPTIONS = [
  { value: "solid", label: "Solid", icon: SolidLineIcon },
  { value: "dashed", label: "Dashed", icon: DashedLineIcon },
  { value: "dotted", label: "Dotted", icon: DottedLineIcon },
];

const LINE_SHAPE_OPTIONS = [
  { value: "straight", label: "Straight", icon: Slash },
  { value: "corner", label: "Angled", icon: CornerDownRight },
  { value: "arc", label: "Curved", icon: Spline },
];

const EDGE_OPTIONS = [
  { value: "round", label: "Round" },
  { value: "sharp", label: "Sharp" },
];

const SLOPPINESS_OPTIONS = [
  { value: RENDER_STYLES.ROUGH, label: "Sketchy" },
  { value: RENDER_STYLES.CLEAN, label: "Clean" },
];

const ALIGN_BUTTONS = [
  { id: ALIGNMENTS.LEFT, label: "Align left", Icon: AlignStartVertical },
  { id: ALIGNMENTS.CENTER_X, label: "Align centre", Icon: AlignCenterVertical },
  { id: ALIGNMENTS.RIGHT, label: "Align right", Icon: AlignEndVertical },
  { id: ALIGNMENTS.TOP, label: "Align top", Icon: AlignStartHorizontal },
  { id: ALIGNMENTS.CENTER_Y, label: "Align middle", Icon: AlignCenterHorizontal },
  { id: ALIGNMENTS.BOTTOM, label: "Align bottom", Icon: AlignEndHorizontal },
];

const LAYER_BUTTONS = [
  { action: "sendToBack", label: "Send to back", Icon: SendToBack },
  { action: "sendBackward", label: "Send backward", Icon: ArrowDown },
  { action: "bringForward", label: "Bring forward", Icon: ArrowUp },
  { action: "bringToFront", label: "Bring to front", Icon: BringToFront },
];

/**
 * InspectorPanel — the contextual style controls.
 *
 * Renders only the sections the model says apply, in a fixed order: colour,
 * stroke, look, opacity, then Arrange for selections. The same panel fills the
 * desktop inspector and the phone style sheet (`touch` enlarges targets).
 *
 * `shapeStyle` must be the stored style (getBaseShapeStyle), not the
 * theme-adjusted render style, so swatches match in both themes.
 */
function InspectorPanel({
  model,
  shapeStyle,
  onStyleChange,
  layerActions,
  groupActions,
  alignmentActions,
  touch = false,
}) {
  const has = (section) => model.sections.has(section);
  const segmentSize = touch ? "md" : "sm";
  const opacityPercent = Math.round((shapeStyle.opacity ?? 1) * 100);
  const isSelection = model.mode === "selection";

  return (
    <div className="flex flex-col gap-4">
      {has(SECTION.STROKE) ? (
        <Field label={model.strokeLabel}>
          <ColorSwatches
            label={model.strokeLabel}
            value={shapeStyle.stroke}
            swatches={STROKE_SWATCHES}
            themedInk={DEFAULT_STYLE.stroke}
            touch={touch}
            onChange={(color) => onStyleChange("stroke", color)}
          />
        </Field>
      ) : null}

      {has(SECTION.FILL) ? (
        <Field label="Fill">
          <ColorSwatches
            label="Fill"
            value={shapeStyle.fill}
            swatches={FILL_SWATCHES}
            allowNone
            noneSelected={!shapeStyle.fillEnabled}
            touch={touch}
            onSelectNone={() => onStyleChange("fillEnabled", false)}
            onChange={(color) => onStyleChange({ fill: color, fillEnabled: true })}
          />
        </Field>
      ) : null}

      {has(SECTION.NOTE_COLOR) ? (
        <Field label="Note colour">
          <ColorSwatches
            label="Note colour"
            value={shapeStyle.fill}
            swatches={NOTE_SWATCHES}
            touch={touch}
            onChange={(color) => onStyleChange("fill", color)}
          />
        </Field>
      ) : null}

      {has(SECTION.STROKE_WIDTH) ? (
        <SliderRow
          label="Stroke width"
          min={1}
          max={20}
          value={shapeStyle.strokeWidth}
          displayValue={`${shapeStyle.strokeWidth}px`}
          onChange={(next) => onStyleChange("strokeWidth", next)}
        />
      ) : null}

      {has(SECTION.STROKE_STYLE) ? (
        <Field label="Line style">
          <Segmented
            label="Line style"
            iconOnly
            size={segmentSize}
            options={STROKE_STYLE_OPTIONS}
            value={shapeStyle.strokeStyle}
            onChange={(next) => onStyleChange("strokeStyle", next)}
          />
        </Field>
      ) : null}

      {has(SECTION.LINE_SHAPE) ? (
        <Field label="Path">
          <Segmented
            label="Path"
            iconOnly
            size={segmentSize}
            options={LINE_SHAPE_OPTIONS}
            value={shapeStyle.bendStyle}
            onChange={(next) => onStyleChange("bendStyle", next)}
          />
        </Field>
      ) : null}

      {has(SECTION.EDGES) ? (
        <Field label={model.edgesLabel}>
          <Segmented
            label={model.edgesLabel}
            size={segmentSize}
            options={EDGE_OPTIONS}
            value={shapeStyle.edgeStyle}
            onChange={(next) => onStyleChange("edgeStyle", next)}
          />
        </Field>
      ) : null}

      {has(SECTION.SLOPPINESS) ? (
        <Field label="Look">
          <Segmented
            label="Look"
            size={segmentSize}
            options={SLOPPINESS_OPTIONS}
            value={shapeStyle.renderStyle}
            onChange={(next) => onStyleChange("renderStyle", next)}
          />
        </Field>
      ) : null}

      {has(SECTION.FONT_SIZE) ? (
        <Field label="Text size">
          <Segmented
            label="Text size"
            size={segmentSize}
            options={FONT_SIZE_PRESETS}
            value={shapeStyle.fontSize}
            onChange={(next) => onStyleChange("fontSize", next)}
          />
        </Field>
      ) : null}

      {has(SECTION.FONT_FAMILY) ? (
        <Field label="Font">
          <Segmented
            label="Font"
            size={segmentSize}
            options={FONT_FAMILIES}
            value={shapeStyle.fontFamily}
            onChange={(next) => onStyleChange("fontFamily", next)}
          />
        </Field>
      ) : null}

      {has(SECTION.OPACITY) ? (
        <SliderRow
          label="Opacity"
          min={10}
          max={100}
          step={5}
          value={opacityPercent}
          displayValue={`${opacityPercent}%`}
          onChange={(next) => onStyleChange("opacity", next / 100)}
        />
      ) : null}

      {isSelection && model.sections.size === 0 ? (
        <p className="text-label font-normal text-text-muted">
          Images keep their original look. Arrange them below.
        </p>
      ) : null}

      {isSelection ? (
        <ArrangeSection
          key={model.count > 1 ? "multiple" : "single"}
          defaultOpen={model.count > 1 || model.sections.size === 0}
          model={model}
          layerActions={layerActions}
          groupActions={groupActions}
          alignmentActions={alignmentActions}
          touch={touch}
        />
      ) : null}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label text-text-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * Arrange — layer order, alignment and grouping.
 *
 * Collapsed by default for a single shape, where it is the least-used section,
 * and open for a multi-selection, where aligning is usually the point.
 */
function ArrangeSection({
  defaultOpen,
  model,
  layerActions,
  groupActions,
  alignmentActions,
  touch,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const buttonSize = touch ? "xl" : "md";
  const showGrouping = groupActions?.canGroup || groupActions?.canUngroup;

  return (
    <section className="-mx-3 border-t border-divider px-3 pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "flex w-full items-center justify-between rounded-md text-label text-text",
          touch ? "h-11" : "h-8",
        )}
      >
        Arrange
        <ChevronDown
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className={cx("text-text-muted transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div id={contentId} className="mt-1 flex flex-col gap-3 pb-1">
          <div role="group" aria-label="Layer order" className="flex items-center justify-between">
            {LAYER_BUTTONS.map((button) => {
              const Icon = button.Icon;

              return (
                <IconButton
                  key={button.action}
                  label={button.label}
                  shortcut={getShortcutCombo(button.action)}
                  size={buttonSize}
                  onClick={layerActions?.[button.action]}
                >
                  <Icon {...ICON} />
                </IconButton>
              );
            })}
          </div>

          {model.canAlign ? (
            <div role="group" aria-label="Align and distribute" className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                {ALIGN_BUTTONS.map((button) => {
                  const Icon = button.Icon;

                  return (
                    <IconButton
                      key={button.id}
                      label={button.label}
                      size={touch ? "lg" : "md"}
                      onClick={() => alignmentActions?.align(button.id)}
                    >
                      <Icon {...ICON} />
                    </IconButton>
                  );
                })}
              </div>
              <div className="flex items-center gap-1">
                <IconButton
                  label={
                    model.canDistribute
                      ? "Distribute horizontally"
                      : "Distribute horizontally (select three or more)"
                  }
                  size={touch ? "lg" : "md"}
                  disabled={!model.canDistribute}
                  onClick={() => alignmentActions?.distribute(AXES.HORIZONTAL)}
                >
                  <AlignHorizontalDistributeCenter {...ICON} />
                </IconButton>
                <IconButton
                  label={
                    model.canDistribute
                      ? "Distribute vertically"
                      : "Distribute vertically (select three or more)"
                  }
                  size={touch ? "lg" : "md"}
                  disabled={!model.canDistribute}
                  onClick={() => alignmentActions?.distribute(AXES.VERTICAL)}
                >
                  <AlignVerticalDistributeCenter {...ICON} />
                </IconButton>
              </div>
            </div>
          ) : null}

          {showGrouping ? (
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                size={touch ? "md" : "xs"}
                disabled={!groupActions.canGroup}
                aria-keyshortcuts={toAriaKeyShortcuts(getShortcutCombo("group"))}
                onClick={groupActions.group}
              >
                <Group size={14} strokeWidth={1.75} aria-hidden="true" />
                Group
              </Button>
              <Button
                size={touch ? "md" : "xs"}
                disabled={!groupActions.canUngroup}
                aria-keyshortcuts={toAriaKeyShortcuts(getShortcutCombo("ungroup"))}
                onClick={groupActions.ungroup}
              >
                <Ungroup size={14} strokeWidth={1.75} aria-hidden="true" />
                Ungroup
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default memo(InspectorPanel);
