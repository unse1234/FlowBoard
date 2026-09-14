import { COLOR_NAMES } from "../../constants/canvas.js";
import { cx } from "../ui/index.js";

/** A spectrum, shown on the custom-colour swatch until a custom colour is chosen. */
const SPECTRUM =
  "conic-gradient(from 180deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)";

/**
 * ColorSwatches — preset colours, an optional "none", and the system picker.
 *
 * Each swatch is a toggle button; the chosen one gets an offset ring, which
 * reads on any colour and without colour vision. `themedInk` names the preset
 * that renders in the current text colour — ink strokes draw light on the dark
 * canvas, so the swatch shows what the user will actually see.
 */
export function ColorSwatches({
  label,
  value,
  swatches,
  onChange,
  allowNone = false,
  noneSelected = false,
  onSelectNone,
  themedInk,
  touch = false,
}) {
  const normalized = String(value ?? "").toLowerCase();
  const matchesPreset = swatches.includes(normalized);
  const isCustom = !noneSelected && !matchesPreset && /^#[0-9a-f]{6}$/.test(normalized);
  // 20px keeps nine swatches on one row in the 256px inspector; 32px on touch.
  const size = touch ? "size-8" : "size-5";

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {allowNone ? (
        <SwatchButton label="None" checked={noneSelected} size={size} onClick={onSelectNone}>
          <span
            aria-hidden="true"
            className="relative block size-full overflow-hidden rounded-full border border-border-strong bg-surface"
          >
            <span className="absolute left-1/2 top-[-20%] h-[140%] w-px -translate-x-1/2 rotate-45 bg-danger" />
          </span>
        </SwatchButton>
      ) : null}

      {swatches.map((swatch) => (
        <SwatchButton
          key={swatch}
          label={COLOR_NAMES[swatch] ?? swatch}
          checked={!noneSelected && normalized === swatch}
          size={size}
          onClick={() => onChange(swatch)}
        >
          <span
            aria-hidden="true"
            className="block size-full rounded-full border border-border-strong"
            style={{ background: swatch === themedInk ? "var(--fb-text)" : swatch }}
          />
        </SwatchButton>
      ))}

      <label
        className={cx(
          "relative grid shrink-0 cursor-pointer place-items-center rounded-full",
          "transition-transform duration-100 active:scale-90",
          isCustom && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
          size,
        )}
      >
        <span
          aria-hidden="true"
          className="block size-full rounded-full border border-border-strong"
          style={{ background: isCustom ? normalized : SPECTRUM }}
        />
        <input
          type="color"
          aria-label={`Custom ${label.toLowerCase()} colour`}
          value={isCustom ? normalized : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function SwatchButton({ label, checked, size, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={onClick}
      className={cx(
        "grid shrink-0 place-items-center rounded-full transition-transform duration-100 active:scale-90",
        checked && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
        size,
      )}
    >
      {children}
    </button>
  );
}
