import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Dialog — centred modal for desktop.
 *
 * The mobile counterpart of the same content is a Sheet; the shell picks one
 * by breakpoint rather than trying to make a single element behave as both.
 */
export function Dialog({ open, title, description, onClose, children, width = "max-w-md" }) {
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
    <div className="fixed inset-0 z-70 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="fb-animate-fade absolute inset-0 h-full w-full bg-black/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "fb-animate-pop relative flex max-h-[85vh] w-full flex-col",
          "rounded-panel border border-border bg-surface shadow-popover",
          width,
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[12px] text-text-soft">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text"
          >
            <X size={17} />
          </button>
        </div>

        <div className="fb-scroll flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
