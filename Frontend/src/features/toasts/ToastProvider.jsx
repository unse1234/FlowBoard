import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/Button.jsx";
import { cx } from "../../components/ui/cx.js";
import { IconButton } from "../../components/ui/IconButton.jsx";
import { ToastContext } from "./toastContext.js";

const DEFAULT_DURATION = 3200;
const EXIT_DURATION = 150;
const MAX_TOASTS = 3;

const TONE_ICONS = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
  info: Info,
  loading: LoaderCircle,
};

const TONE_CLASSES = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  loading: "animate-spin text-text-muted",
};

/**
 * ToastProvider — owns the toast queue and renders the toaster.
 *
 * Toasts sit top-centre, below the header islands, where nothing else on the
 * board lives. At most three are shown; a reused id updates in place.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());
  const counterRef = useRef(0);

  const dismiss = useCallback((id) => {
    const timers = timersRef.current;
    window.clearTimeout(timers.get(id));
    timers.delete(id);

    setToasts((list) =>
      list.map((item) => (item.id === id ? { ...item, closing: true } : item)),
    );

    window.setTimeout(() => {
      setToasts((list) => list.filter((item) => !(item.id === id && item.closing)));
    }, EXIT_DURATION);
  }, []);

  const toast = useCallback(
    (input) => {
      counterRef.current += 1;
      const id = input.id ?? `toast-${counterRef.current}`;
      const next = {
        tone: "neutral",
        duration: DEFAULT_DURATION,
        ...input,
        id,
        closing: false,
      };

      setToasts((list) =>
        [...list.filter((item) => item.id !== id), next].slice(-MAX_TOASTS),
      );

      const timers = timersRef.current;
      window.clearTimeout(timers.get(id));

      if (Number.isFinite(next.duration)) {
        timers.set(
          id,
          window.setTimeout(() => dismiss(id), next.duration),
        );
      } else {
        timers.delete(id);
      }

      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timeoutId of timers.values()) window.clearTimeout(timeoutId);
      timers.clear();
    };
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [dismiss, toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <section
          aria-label="Notifications"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-15 z-90 flex flex-col items-center gap-2 px-3 md:top-16"
        >
          {toasts.map((item) => (
            <ToastCard key={item.id} toast={item} onDismiss={dismiss} />
          ))}
        </section>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }) {
  const { id, title, description, tone, action, closing } = toast;
  const Icon = TONE_ICONS[tone];

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      data-state={closing ? "closed" : "open"}
      className={cx(
        "fb-toast pointer-events-auto flex w-max max-w-[min(92vw,400px)] items-center gap-2.5",
        "rounded-lg border border-border bg-surface-raised py-1.5 pl-3 pr-1.5 shadow-popover",
      )}
    >
      {Icon ? (
        <Icon
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className={cx("shrink-0", TONE_CLASSES[tone])}
        />
      ) : null}

      <div className="min-w-0 py-1">
        <p className="text-body font-medium text-text">{title}</p>
        {description ? (
          <p className="text-label font-normal text-text-muted">{description}</p>
        ) : null}
      </div>

      {action ? (
        <Button
          variant="ghost"
          size="xs"
          className="ml-1 font-semibold text-text"
          onClick={() => {
            action.onClick?.();
            onDismiss(id);
          }}
        >
          {action.label}
        </Button>
      ) : null}

      <IconButton label="Dismiss notification" tooltip={false} size="sm" onClick={() => onDismiss(id)}>
        <X size={14} strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}
