import { useEffect, useRef } from "react";
import { TURNSTILE_SIGNUP_ACTION, loadTurnstile } from "../../features/auth/turnstile.js";

/**
 * TurnstileWidget — the human check on the sign-up form (chunk 7.5).
 *
 * "interaction-only": most people never see it, because Cloudflare decides
 * in the background and hands over a token. Only someone who looks like a bot
 * is shown a checkbox. Its colours follow the app's theme, not the system's.
 *
 * `onToken` receives the token, or null once it expires or errors. Tokens are
 * single-use, so re-key this component after a failed attempt for a fresh
 * one.
 */
export function TurnstileWidget({ siteKey, theme, onToken }) {
  const containerRef = useRef(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let widgetId = null;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetId = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: TURNSTILE_SIGNUP_ACTION,
          theme: theme === "dark" ? "dark" : "light",
          size: "flexible",
          appearance: "interaction-only",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        // Without the widget there is no token, and the form says so on
        // submit. Nothing more useful can be done here.
        if (!cancelled) onTokenRef.current(null);
      });

    return () => {
      cancelled = true;
      if (widgetId !== null) globalThis.window?.turnstile?.remove(widgetId);
    };
  }, [siteKey, theme]);

  return <div ref={containerRef} className="min-h-0 empty:hidden" />;
}
