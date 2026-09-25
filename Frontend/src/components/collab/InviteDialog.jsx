import { MailWarning, Users } from "lucide-react";
import { memo, useState } from "react";
import { AUTH_STATUS } from "../../features/auth/authSession.js";
import { Button, Dialog, Spinner } from "../ui/index.js";

const ROLE_WORDS = Object.freeze({ editor: "an editor", viewer: "a viewer" });

/**
 * InviteDialog — what an invitation link is for, and joining the board
 * (spec Phase C). Each step the server requires is asked for in turn: an
 * account, then a confirmed address, then a deliberate "Join".
 */
function InviteDialog({ open, invitation, authStatus, user, onSignIn, onSignUp, onResendVerification }) {
  const [resent, setResent] = useState(null);
  const { invite, error, loading, damaged } = invitation;

  const resend = async () => {
    try {
      const { alreadyVerified } = await onResendVerification();
      setResent(alreadyVerified ? "Your address is already confirmed. Reload the page." : `New link sent to ${user?.email}.`);
    } catch (caught) {
      setResent(caught?.message ?? "Couldn't send the link.");
    }
  };

  let title = "You've been invited to a board";
  let body = null;
  let actions = null;

  if (damaged) {
    title = "This invitation link is incomplete";
    body = <p className="text-body text-text">Open it again from the message it came in, or ask for a new one.</p>;
  } else if (authStatus === AUTH_STATUS.RESTORING) {
    body = (
      <p className="flex items-center gap-2 text-body text-text-muted">
        <Spinner /> Checking your account…
      </p>
    );
  } else if (authStatus === AUTH_STATUS.UNAVAILABLE) {
    title = "Invitations aren't available right now";
    body = <p className="text-body text-text">This FlowBoard server doesn't have accounts switched on yet.</p>;
  } else if (authStatus !== AUTH_STATUS.SIGNED_IN) {
    body = <p className="text-body text-text">Sign in, or create an account, to see the board and join it.</p>;
    actions = (
      <>
        <Button variant="ghost" size="md" onClick={onSignUp}>
          Create an account
        </Button>
        <Button variant="primary" size="md" onClick={onSignIn}>
          Sign in
        </Button>
      </>
    );
  } else if (loading) {
    body = (
      <p className="flex items-center gap-2 text-body text-text-muted">
        <Spinner /> Opening the invitation…
      </p>
    );
  } else if (error) {
    title = error.code === "INVITE_INVALID" ? "This invitation no longer works" : "Couldn't open the invitation";
    body = <p className="text-body text-text">{error.message}</p>;
  } else if (invite) {
    title = invite.boardId ? `You're already on "${invite.boardTitle}"` : `Join "${invite.boardTitle}"`;
    body = (
      <div className="flex flex-col gap-3">
        <p className="flex gap-2.5 text-body text-text">
          <Users size={18} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-text-muted" />
          <span>
            {invite.invitedBy} invited you as {ROLE_WORDS[invite.role] ?? invite.role}.
          </span>
        </p>
        {!invite.boardId && !user?.emailVerified ? (
          <p className="flex gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-label text-text">
            <MailWarning size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0 text-warning" />
            <span>
              {resent ??
                `Confirm your email address first: open the link we sent to ${user?.email}, then open this invitation again.`}
            </span>
          </p>
        ) : null}
      </div>
    );
    actions = invite.boardId ? (
      <Button variant="primary" size="md" onClick={() => invitation.open(invite.boardId)}>
        Open board
      </Button>
    ) : user?.emailVerified ? (
      <Button variant="primary" size="md" loading={invitation.accepting} onClick={invitation.accept}>
        Join board
      </Button>
    ) : resent ? null : (
      <Button variant="primary" size="md" onClick={resend}>
        Resend link
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={invitation.dismiss}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={invitation.dismiss}>
            Not now
          </Button>
          {actions}
        </>
      }
    >
      {body}
    </Dialog>
  );
}

export default memo(InviteDialog);
