import { Check, Copy, LogIn, MailWarning, Share2, Trash2, UserMinus } from "lucide-react";
import { memo, useId, useState } from "react";
import { AUTH_STATUS } from "../../features/auth/authSession.js";
import { useBoardSharing } from "../../features/boards/useBoardSharing.js";
import BoardStatus from "../layout/BoardStatus.jsx";
import { Avatar, Badge, Button, Segmented, Spinner, cx } from "../ui/index.js";

const ICON = { size: 15, strokeWidth: 1.75 };

const ROLE_OPTIONS = [
  { value: "editor", label: "Can edit" },
  { value: "viewer", label: "Can view" },
];

const ROLE_LABELS = Object.freeze({ owner: "Owner", editor: "Can edit", viewer: "Can view" });

const BENEFITS = [
  "Private until you invite someone",
  "Everything already on the board comes with it",
  "See each other's cursors, and talk over voice",
];

/**
 * BoardSharePanel — sharing where the server has accounts (spec Phases C, D).
 *
 * A board is private until its owner invites someone (E-21), so this is about
 * people, not a link: who is on the board, as what, and invitations that each
 * work once for a week. The steps before that are explained where they block:
 * signing in, then confirming the address (E-20). What the owner may do here
 * the server enforces anyway; this only offers what will be allowed.
 */
function BoardSharePanel({
  authStatus,
  user,
  boardId,
  role,
  status,
  getAccessToken,
  onStart,
  onSignIn,
  onResendVerification,
  onLeft,
  touch = false,
  showTitle = true,
}) {
  const buttonSize = touch ? "lg" : "md";
  const verified = authStatus === AUTH_STATUS.SIGNED_IN && user?.emailVerified;
  const sharing = useBoardSharing({ boardId, getAccessToken, enabled: Boolean(verified && boardId) });

  return (
    <div className="flex flex-col gap-4">
      {showTitle ? (
        <div>
          <h2 className="text-title text-text">{sharing.board?.title ?? "Share this board"}</h2>
          <p className="mt-0.5 text-label font-normal text-text-muted">
            {boardId ? "Only the people listed here can open it." : "Work on this board with other people, live."}
          </p>
        </div>
      ) : null}

      {authStatus === AUTH_STATUS.RESTORING ? (
        <p className="flex items-center gap-2 text-body text-text-muted">
          <Spinner /> Checking your account…
        </p>
      ) : authStatus !== AUTH_STATUS.SIGNED_IN ? (
        <Gate
          text="Sign in to invite people and work on boards together."
          action={
            <Button variant="primary" size={buttonSize} fullWidth onClick={onSignIn}>
              <LogIn {...ICON} aria-hidden="true" />
              Sign in to collaborate
            </Button>
          }
        />
      ) : !verified ? (
        <UnverifiedGate email={user.email} buttonSize={buttonSize} onResend={onResendVerification} />
      ) : !boardId ? (
        <StartSharing buttonSize={buttonSize} onStart={onStart} />
      ) : sharing.loading ? (
        <p className="flex items-center gap-2 text-body text-text-muted">
          <Spinner /> Loading who's on this board…
        </p>
      ) : sharing.error ? (
        <p role="alert" className="text-label text-danger">
          {sharing.error.message}{" "}
          <button type="button" onClick={sharing.reread} className="font-semibold underline underline-offset-2">
            Try again
          </button>
        </p>
      ) : sharing.board ? (
        <SharedBoard
          sharing={sharing}
          user={user}
          role={role ?? sharing.board.role}
          status={status}
          touch={touch}
          buttonSize={buttonSize}
          onLeft={onLeft}
        />
      ) : null}
    </div>
  );
}

function Gate({ text, action }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-label font-normal text-text-muted">{text}</p>
      {action}
    </div>
  );
}

function UnverifiedGate({ email, buttonSize, onResend }) {
  const [sent, setSent] = useState(null);
  const [pending, setPending] = useState(false);

  const resend = async () => {
    setPending(true);
    try {
      const { alreadyVerified } = await onResend();
      setSent(alreadyVerified ? "Your address is already confirmed. Reload to continue." : `New link sent to ${email}.`);
    } catch (error) {
      setSent(error?.message ?? "Couldn't send the link. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="flex gap-2 text-label font-normal text-text">
        <MailWarning {...ICON} aria-hidden="true" className="mt-px shrink-0 text-warning" />
        <span>
          Confirm your email address to collaborate. We sent a link to <strong className="font-semibold">{email}</strong>.
        </span>
      </p>
      {sent ? (
        <p role="status" className="text-label text-text-muted">
          {sent}
        </p>
      ) : (
        <Button size={buttonSize} fullWidth loading={pending} onClick={resend}>
          Resend link
        </Button>
      )}
    </div>
  );
}

function StartSharing({ buttonSize, onStart }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const start = async () => {
    setPending(true);
    setError(null);
    try {
      await onStart();
    } catch (caught) {
      setError(caught?.message ?? "Couldn't start sharing. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <ul className="flex flex-col gap-2">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2 text-label font-normal text-text-muted">
            <Check size={14} strokeWidth={2} aria-hidden="true" className="mt-px shrink-0 text-success" />
            {benefit}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-label text-danger">
          {error}
        </p>
      ) : null}
      <Button variant="primary" size={buttonSize} fullWidth loading={pending} onClick={start}>
        {pending ? null : <Share2 {...ICON} aria-hidden="true" />}
        Start collaborating
      </Button>
    </>
  );
}

function SharedBoard({ sharing, user, role, status, touch, buttonSize, onLeft }) {
  const { board, invites } = sharing;
  const isOwner = role === "owner";
  const [error, setError] = useState(null);

  const guarded = async (run) => {
    setError(null);
    try {
      await run();
    } catch (caught) {
      setError(caught?.message ?? "That didn't work. Try again.");
    }
  };

  return (
    <>
      {isOwner ? <InvitePeople sharing={sharing} touch={touch} buttonSize={buttonSize} /> : null}

      <section aria-label="People on this board">
        <h3 className="text-caption uppercase tracking-[0.06em] text-text-muted">People</h3>
        <ul className="mt-2 divide-y divide-divider rounded-lg border border-border">
          <PersonRow person={board.owner} you={board.owner.id === user.id} badge={ROLE_LABELS.owner} />
          {board.members.map((member) => (
            <PersonRow key={member.id} person={member} you={member.id === user.id}>
              {isOwner ? (
                <>
                  <Segmented
                    size="sm"
                    label={`${member.displayName}'s access`}
                    options={ROLE_OPTIONS}
                    value={member.role}
                    onChange={(next) => guarded(() => sharing.setRole(member.id, next))}
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={`Remove ${member.displayName}`}
                    onClick={() => guarded(() => sharing.remove(member.id))}
                    className="pointer-coarse:h-11"
                  >
                    <UserMinus {...ICON} aria-hidden="true" />
                  </Button>
                </>
              ) : (
                <Badge>{ROLE_LABELS[member.role]}</Badge>
              )}
            </PersonRow>
          ))}
        </ul>
      </section>

      {isOwner && invites.length > 0 ? (
        <section aria-label="Open invitations">
          <h3 className="text-caption uppercase tracking-[0.06em] text-text-muted">Open invitations</h3>
          <ul className="mt-2 divide-y divide-divider rounded-lg border border-border">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1 text-label text-text">
                  {ROLE_LABELS[invite.role]} ·{" "}
                  <span className="text-text-muted">
                    until {new Date(invite.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    {invite.maxUses > 1 ? ` · ${invite.maxUses - invite.useCount} uses left` : ""}
                  </span>
                </div>
                <Button variant="ghost" size="xs" onClick={() => guarded(() => sharing.withdrawInvite(invite.id))} className="pointer-coarse:h-11">
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="text-label text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <BoardStatus status={status} compact className="h-auto px-0" />
        {isOwner ? (
          <DeleteBoard sharing={sharing} onDeleted={onLeft} />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              guarded(async () => {
                await sharing.leave(user.id);
                onLeft?.();
              })
            }
            className="pointer-coarse:h-11"
          >
            Leave board
          </Button>
        )}
      </div>
    </>
  );
}

function PersonRow({ person, you, badge, children }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Avatar name={person.displayName} seed={person.id} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-text">
          {person.displayName}
          {you ? <span className="text-text-muted"> (you)</span> : null}
        </p>
        {person.email ? <p className="truncate text-label text-text-muted">{person.email}</p> : null}
      </div>
      {badge ? <Badge>{badge}</Badge> : null}
      {children}
    </li>
  );
}

function InvitePeople({ sharing, touch, buttonSize }) {
  const linkId = useId();
  const [role, setRole] = useState("editor");
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const canNativeShare = touch && typeof navigator !== "undefined" && typeof navigator.share === "function";

  const create = async () => {
    setPending(true);
    setError(null);
    try {
      const { link } = await sharing.invite(role);
      setCreated({ link, role });
      setCopied(false);
    } catch (caught) {
      setError(caught?.message ?? "Couldn't create an invitation. Try again.");
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  };

  return (
    <section aria-label="Invite people" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-caption uppercase tracking-[0.06em] text-text-muted">Invite someone</h3>
        <Segmented size="sm" label="Access for the person invited" options={ROLE_OPTIONS} value={role} onChange={setRole} />
      </div>

      {created ? (
        <>
          <div className="flex items-center gap-2">
            <label htmlFor={linkId} className="sr-only">
              Invitation link
            </label>
            <input
              id={linkId}
              type="text"
              readOnly
              value={created.link}
              onFocus={(event) => event.target.select()}
              className={cx(
                "min-w-0 flex-1 rounded-md border border-border bg-surface-muted px-2.5 text-label font-normal text-text",
                touch ? "h-11" : "h-9",
              )}
            />
            <Button variant="primary" size={buttonSize} className="min-w-26" onClick={copy}>
              {copied ? <Check {...ICON} aria-hidden="true" /> : <Copy {...ICON} aria-hidden="true" />}
              <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
          {canNativeShare ? (
            <Button size={buttonSize} fullWidth onClick={() => navigator.share({ title: "FlowBoard invitation", url: created.link }).catch(() => {})}>
              <Share2 {...ICON} aria-hidden="true" />
              Share via…
            </Button>
          ) : null}
          <p className="text-caption font-normal text-text-muted">
            For one person, as {created.role === "editor" ? "an editor" : "a viewer"}. It works once, within 7 days, and only
            after they sign in with a confirmed address.
          </p>
          <Button variant="ghost" size="sm" onClick={create} loading={pending} className="self-start pointer-coarse:h-11">
            Make another link
          </Button>
        </>
      ) : (
        <Button variant="primary" size={buttonSize} fullWidth loading={pending} onClick={create}>
          Create invitation link
        </Button>
      )}

      {error ? (
        <p role="alert" className="text-label text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function DeleteBoard({ sharing, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} className="text-danger pointer-coarse:h-11">
        <Trash2 {...ICON} aria-hidden="true" />
        Delete board
      </Button>
    );
  }

  const destroy = async () => {
    setPending(true);
    try {
      await sharing.destroy();
      onDeleted?.();
    } catch (caught) {
      setError(caught?.message ?? "Couldn't delete the board.");
      setPending(false);
    }
  };

  return (
    <div role="alertdialog" aria-label="Delete this board?" className="flex items-center gap-2">
      <span className="text-label text-text">{error ?? "Delete for everyone?"}</span>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
      <Button variant="danger" size="sm" loading={pending} onClick={destroy}>
        Delete
      </Button>
    </div>
  );
}

export default memo(BoardSharePanel);
