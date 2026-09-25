import { MailWarning, X } from "lucide-react";
import { memo, useState } from "react";
import { Button, IconButton, Island } from "../ui/index.js";

/**
 * VerifyEmailBanner — "confirm your email to collaborate" (D-5).
 *
 * Everything but collaboration works without a confirmed address, so this
 * informs rather than blocks: one quiet line at the top, a way to get a new
 * link, and a way to put it away. The server enforces the rule either way;
 * this only explains it before someone runs into it.
 *
 * Between the header islands on wide screens, below them elsewhere.
 */
function VerifyEmailBanner({ email, onResend, onDismiss }) {
  const [state, setState] = useState({ phase: "idle", message: null });

  const resend = async () => {
    setState({ phase: "sending", message: null });
    try {
      const { alreadyVerified } = await onResend();
      setState({
        phase: "sent",
        message: alreadyVerified ? "Your address is already confirmed." : `New link sent to ${email}.`,
      });
    } catch (error) {
      setState({ phase: "idle", message: error?.message || "Couldn't send the link. Try again." });
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-2 top-[max(3.75rem,calc(env(safe-area-inset-top)+3.25rem))] z-30 flex justify-center md:top-16 lg:top-3">
      <Island
        role="status"
        className="pointer-events-auto flex max-w-[min(100%,560px)] items-center gap-2 py-1 pl-3 pr-1"
      >
        <MailWarning size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-warning" />
        <p className="min-w-0 py-1 text-label text-text">
          {state.message ?? (
            <>
              Confirm your email to collaborate.{" "}
              <span className="text-text-muted">We sent a link to {email}.</span>
            </>
          )}
        </p>
        {state.phase === "sent" ? null : (
          <Button
            variant="ghost"
            size="xs"
            loading={state.phase === "sending"}
            onClick={resend}
            className="shrink-0 pointer-coarse:h-10"
          >
            Resend link
          </Button>
        )}
        <IconButton label="Dismiss" tooltip={false} size="sm" onClick={onDismiss} className="shrink-0 pointer-coarse:size-10">
          <X size={14} strokeWidth={2} />
        </IconButton>
      </Island>
    </div>
  );
}

export default memo(VerifyEmailBanner);
