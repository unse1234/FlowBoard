import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Sheet — mobile bottom sheet with scrim, drag handle and Escape-to-close.
 *
 * The design uses one sheet for the tool picker and another for
 * participants/chat; both share this shell so the gesture affordances and the
 * safe-area padding stay identical.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  maxHeight = "80vh",
  className = "",
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-70 lg:hidden">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="fb-animate-fade absolute inset-0 h-full w-full bg-black/35"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "fb-animate-sheet absolute inset-x-0 bottom-0 flex flex-col",
          "rounded-t-2xl border-t border-border bg-surface shadow-sheet",
          "pb-[env(safe-area-inset-bottom)]",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ maxHeight }}
      >
        {/* Drag handle — visual affordance only; the scrim is the close target. */}
        <div className="flex justify-center pt-2.5">
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-border-strong" />
        </div>

        {title ? (
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <h2 className="text-[15px] font-semibold text-text">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text"
            >
              <X size={17} />
            </button>
          </div>
        ) : null}

        <div className="fb-scroll flex-1 overflow-y-auto px-4 pt-2 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}
