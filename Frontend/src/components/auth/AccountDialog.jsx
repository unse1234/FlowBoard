import { LogOut } from "lucide-react";
import { memo, useState } from "react";
import { Avatar, Button, Dialog } from "../ui/index.js";

/**
 * AccountDialog — who is signed in, and the way to sign out.
 *
 * Small on purpose: it is where session management (Phase 3) and account
 * settings (Phase 6) will land, and until then it shows only what is true.
 * Email verification is not shown, because Phase 4 has not built a way to
 * verify, and a "not verified" badge with no way to act on it would only worry
 * people.
 *
 * `user` can turn null while the exit animation plays after signing out, so
 * nothing here assumes it is present.
 */
function AccountDialog({ open, user, onClose, onSignOut }) {
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    setPending(true);
    try {
      await onSignOut();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Account"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" size="md" loading={pending} onClick={signOut}>
            {pending ? null : <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />}
            Sign out
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar name={user?.displayName ?? ""} seed={user?.id} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-title text-text">{user?.displayName}</p>
          <p className="truncate text-body text-text-muted">{user?.email}</p>
        </div>
      </div>
    </Dialog>
  );
}

export default memo(AccountDialog);
