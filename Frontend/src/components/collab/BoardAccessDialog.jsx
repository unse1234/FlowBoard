import { memo, useState } from "react";
import { ACCESS_PROBLEMS } from "../../features/realtime/hooks/useRealtimeCollaboration.js";
import { Button, Dialog } from "../ui/index.js";

const COPY = Object.freeze({
  [ACCESS_PROBLEMS.SIGN_IN_REQUIRED]: {
    title: "Sign in to open this board",
    body: "Shared boards are open only to the people on them. Sign in with the account you were invited with.",
  },
  [ACCESS_PROBLEMS.EMAIL_NOT_VERIFIED]: {
    title: "Confirm your email to collaborate",
    body: "Working on a board with other people needs a confirmed email address. Open the link we emailed you, then come back.",
  },
  [ACCESS_PROBLEMS.BOARD_NOT_FOUND]: {
    title: "You don't have access to this board",
    body: "It doesn't exist, or you're not on it. Ask its owner to invite you.",
  },
  [ACCESS_PROBLEMS.REVOKED]: {
    title: "You no longer have access to this board",
    body: "Its owner removed you, or deleted the board. What you saw before is no longer shared with you.",
  },
});

/**
 * BoardAccessDialog — why this board cannot be opened, and the way forward
 * (spec Phase D). Shown in place of the board when the server refuses it, and
 * the moment access is withdrawn during a session. Leaving goes back to this
 * browser's own board.
 */
function BoardAccessDialog({ problem, email, onSignIn, onResend, onLeave }) {
  const [resent, setResent] = useState(null);
  const [pending, setPending] = useState(false);
  const copy = problem ? COPY[problem] : null;

  const resend = async () => {
    setPending(true);
    try {
      const { alreadyVerified } = await onResend();
      setResent(alreadyVerified ? "Your address is already confirmed. Reload the page." : `New link sent to ${email}.`);
    } catch (error) {
      setResent(error?.message ?? "Couldn't send the link. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={Boolean(copy)}
      onClose={onLeave}
      size="sm"
      title={copy?.title ?? ""}
      description={copy?.body}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onLeave}>
            Go to my board
          </Button>
          {problem === ACCESS_PROBLEMS.SIGN_IN_REQUIRED ? (
            <Button variant="primary" size="md" onClick={onSignIn}>
              Sign in
            </Button>
          ) : null}
          {problem === ACCESS_PROBLEMS.EMAIL_NOT_VERIFIED && !resent ? (
            <Button variant="primary" size="md" loading={pending} onClick={resend}>
              Resend link
            </Button>
          ) : null}
        </>
      }
    >
      {resent ? (
        <p role="status" className="text-label text-text-muted">
          {resent}
        </p>
      ) : null}
    </Dialog>
  );
}

export default memo(BoardAccessDialog);
