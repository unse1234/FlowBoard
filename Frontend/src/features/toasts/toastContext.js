import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

const NOOP_TOASTS = Object.freeze({
  toast: () => null,
  dismiss: () => {},
});

/**
 * useToast — lightweight feedback.
 *
 * `toast({ id?, title, description?, tone?, action?, duration? })` returns the
 * id. Reusing an id replaces that toast in place rather than stacking another —
 * how repeated events ("Link copied", "Reconnecting…") avoid spamming.
 *
 * Tones: neutral | success | warning | danger | info | loading.
 * `duration: Infinity` keeps a toast until dismissed.
 */
export function useToast() {
  return useContext(ToastContext) ?? NOOP_TOASTS;
}
