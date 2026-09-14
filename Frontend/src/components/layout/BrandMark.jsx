import { cx } from "../ui/cx.js";
import logo from "../../assets/logo/logo.png";

/**
 * BrandMark — the FlowBoard lockup.
 */
export default function BrandMark({ showWordmark = true, className = "" }) {
  return (
    <span className={cx("flex select-none items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-md bg-brand-tile shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
      >
        <img src={logo} alt="" className="size-full object-cover" />
      </span>

      {showWordmark ? (
        <span className="text-title tracking-[-0.02em] text-text">FlowBoard</span>
      ) : null}
    </span>
  );
}
