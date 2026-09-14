import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { usePresence } from "../../hooks/usePresence.js";
import { cx } from "./cx.js";
import { IconButton } from "./IconButton.jsx";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

/**
 * Dialog — centred modal.
 *
 * Labelled by its title, traps focus, closes on Escape or a scrim press when
 * `dismissible`, and plays its exit animation before unmounting. Focus lands on
 * `initialFocusRef` if given, otherwise on the dialog itself so its title is
 * announced first.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  size = "md",
  initialFocusRef,
  dismissible = true,
  className = "",
  children,
}) {
  const { mounted, state } = usePresence(open, 150);
  const panelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap(panelRef, open, { initialFocusRef });

  useEffect(() => {
    if (!open || !dismissible) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [dismissible, onClose, open]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={cx(
        "fixed inset-0 z-80 grid place-items-center p-4",
        state === "closed" && "pointer-events-none",
      )}
    >
      <div
        aria-hidden="true"
        data-state={state}
        onClick={dismissible ? onClose : undefined}
        className="fb-fade absolute inset-0 bg-scrim"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-state={state}
        className={cx(
          "fb-pop relative flex max-h-[min(85dvh,720px)] w-full flex-col overflow-hidden",
          "rounded-xl border border-border bg-surface-raised text-text shadow-dialog outline-none",
          SIZES[size] ?? SIZES.md,
          className,
        )}
      >
        <header className="flex items-start gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-heading text-text">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-body text-text-muted">
                {description}
              </p>
            ) : null}
          </div>

          {dismissible ? (
            <IconButton
              label="Close"
              tooltip={false}
              onClick={onClose}
              className="-mr-2 -mt-1.5"
            >
              <X size={16} strokeWidth={1.75} />
            </IconButton>
          ) : null}
        </header>

        <div className="fb-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2">
          {children}
        </div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-divider px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
