import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { usePresence } from "../../hooks/usePresence.js";
import { cx } from "./cx.js";
import { IconButton } from "./IconButton.jsx";

/** How far the sheet must be dragged down before letting go dismisses it. */
const DISMISS_DISTANCE = 72;

/**
 * Sheet — bottom sheet for touch layouts.
 *
 * Traps focus, closes on Escape, a scrim tap, the close button, or dragging the
 * grab handle down. The drag is applied imperatively so it does not re-render
 * the sheet's contents per pointer move. Capped at 85dvh and padded for the
 * home indicator; on wider screens it centres at a readable width.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  headerAction,
  className = "",
  children,
}) {
  const { mounted, state } = usePresence(open, 200);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const titleId = useId();

  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, open]);

  const handleDragStart = (event) => {
    if (event.button !== 0) return;

    dragRef.current = { startY: event.clientY, offset: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (panelRef.current) panelRef.current.style.transition = "none";
  };

  const handleDragMove = (event) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel) return;

    drag.offset = Math.max(0, event.clientY - drag.startY);
    panel.style.transform = `translateY(${drag.offset}px)`;
  };

  const handleDragEnd = () => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    dragRef.current = null;
    if (!drag || !panel) return;

    // Past the threshold the exit animation continues from where the finger
    // left the sheet; short of it, the sheet settles back.
    if (drag.offset > DISMISS_DISTANCE) {
      onClose?.();
      return;
    }

    panel.style.transition = "transform 200ms var(--ease-out)";
    panel.style.transform = "";
  };

  if (!mounted) return null;

  return createPortal(
    <div className={cx("fixed inset-0 z-70", state === "closed" && "pointer-events-none")}>
      <div
        aria-hidden="true"
        data-state={state}
        onClick={onClose}
        className="fb-fade absolute inset-0 bg-scrim"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        data-state={state}
        className={cx(
          "fb-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col",
          "rounded-t-xl border border-b-0 border-border bg-surface-raised text-text shadow-dialog",
          "pb-[env(safe-area-inset-bottom)] outline-none",
          className,
        )}
      >
        <div
          aria-hidden="true"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <span className="h-1 w-9 rounded-full bg-border-strong" />
        </div>

        {title ? (
          <header className="flex items-center gap-2 px-4 pb-2">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-heading text-text">
                {title}
              </h2>
              {description ? (
                <p className="truncate text-label text-text-muted">{description}</p>
              ) : null}
            </div>
            {headerAction}
            <IconButton
              label="Close"
              tooltip={false}
              size="xl"
              onClick={onClose}
              className="-mr-2"
            >
              <X size={18} strokeWidth={1.75} />
            </IconButton>
          </header>
        ) : null}

        <div className="fb-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
