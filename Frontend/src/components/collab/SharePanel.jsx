import { memo, useId, useState } from "react";
import { Check, Copy, Link2, Share2, Signal, Users } from "lucide-react";
import BoardStatus from "../layout/BoardStatus.jsx";
import { AvatarStack, Badge, Button, cx } from "../ui/index.js";

const ICON = { size: 15, strokeWidth: 1.75 };

const BENEFITS = [
  "Everything already on the board comes with it",
  "See each other's cursors as you work",
  "Talk over built-in voice chat",
];

/**
 * SharePanel — create and hand out a board's live link.
 *
 * Before sharing it says what a live link does, so creating one is a choice
 * rather than a surprise. After sharing it holds the link, a copy button that
 * confirms in place, who can do what (anyone with the link can edit — there
 * is no view-only link, and the panel says so), and live status. On touch
 * devices with a system share sheet, "Share via…" hands the link to it.
 */
function SharePanel({
  isShared,
  link,
  linkCopied,
  status,
  collaborators,
  onCreateLink,
  onCopyLink,
  showTitle = true,
  touch = false,
}) {
  const linkId = useId();
  const [creating, setCreating] = useState(false);
  const buttonSize = touch ? "lg" : "md";
  const canNativeShare =
    touch && isShared && typeof navigator !== "undefined" && typeof navigator.share === "function";

  const createLink = async () => {
    setCreating(true);
    try {
      await onCreateLink();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {showTitle ? (
        <div>
          <h2 className="text-title text-text">Share this board</h2>
          <p className="mt-0.5 text-label font-normal text-text-muted">
            {isShared
              ? "Anyone with the link can join and edit."
              : "Invite people to draw and talk with you in real time."}
          </p>
        </div>
      ) : null}

      {isShared ? (
        <>
          <div className="flex items-center gap-2">
            <label htmlFor={linkId} className="sr-only">
              Board link
            </label>
            <input
              id={linkId}
              type="text"
              readOnly
              value={link}
              onFocus={(event) => event.target.select()}
              className={cx(
                "min-w-0 flex-1 rounded-md border border-border bg-surface-muted px-2.5",
                "text-label font-normal text-text",
                touch ? "h-11" : "h-9",
              )}
            />
            <Button variant="primary" size={buttonSize} className="min-w-26" onClick={onCopyLink}>
              {linkCopied ? <Check {...ICON} aria-hidden="true" /> : <Copy {...ICON} aria-hidden="true" />}
              <span aria-live="polite">{linkCopied ? "Copied" : "Copy link"}</span>
            </Button>
          </div>

          {canNativeShare ? (
            <Button
              size={buttonSize}
              fullWidth
              onClick={() => navigator.share({ title: "FlowBoard", url: link }).catch(() => {})}
            >
              <Share2 {...ICON} aria-hidden="true" />
              Share via…
            </Button>
          ) : null}

          <dl className="divide-y divide-divider rounded-lg border border-border">
            <InfoRow icon={Link2} term="Access">
              Anyone with the link
              <Badge>Can edit</Badge>
            </InfoRow>
            <InfoRow icon={Users} term="People">
              <AvatarStack users={collaborators} max={4} size="sm" />
              <span className="tabular-nums">{collaborators.length}</span>
            </InfoRow>
            <InfoRow icon={Signal} term="Status">
              <BoardStatus status={status} compact className="h-auto px-0" />
            </InfoRow>
          </dl>
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {BENEFITS.map((benefit) => (
              <li
                key={benefit}
                className="flex items-start gap-2 text-label font-normal text-text-muted"
              >
                <Check
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="mt-px shrink-0 text-success"
                />
                {benefit}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size={buttonSize}
              fullWidth
              loading={creating}
              onClick={createLink}
            >
              {creating ? null : <Link2 {...ICON} aria-hidden="true" />}
              Create live link
            </Button>
            <p className="text-caption font-normal text-text-muted">
              Live links always allow editing.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow({ icon, term, children }) {
  const Icon = icon;

  return (
    <div className="flex min-h-11 items-center gap-2.5 px-3">
      <Icon {...ICON} aria-hidden="true" className="shrink-0 text-text-muted" />
      <dt className="text-label font-normal text-text-muted">{term}</dt>
      <dd className="ml-auto flex items-center gap-2 text-label text-text">{children}</dd>
    </div>
  );
}

export default memo(SharePanel);
