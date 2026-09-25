import { LogOut } from "lucide-react";
import { memo, useState } from "react";
import { Avatar, Badge, Button, Dialog } from "../ui/index.js";
import AccountDevices from "./AccountDevices.jsx";
import AccountNameForm from "./AccountNameForm.jsx";
import AccountPasswordForm from "./AccountPasswordForm.jsx";

/**
 * AccountDialog — account settings: who is signed in, their name and
 * password, and where they are signed in.
 *
 * Re-key it each time it opens, so every section starts fresh. `user` can
 * turn null while the exit animation plays after signing out, so nothing here
 * assumes it is present.
 */
function AccountDialog({ open, user, onClose, onSignOut, getAccessToken, onUserChange, onSessionChange, onDeleteAccount }) {
  const [signingOut, setSigningOut] = useState(false);
  // Bumped when a password change ended sessions, so the device list re-reads.
  const [devicesKey, setDevicesKey] = useState(0);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Account"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" size="md" loading={signingOut} onClick={signOut}>
            {signingOut ? null : <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />}
            Sign out
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar name={user?.displayName ?? ""} seed={user?.id} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-title text-text">{user?.displayName}</p>
          <p className="flex min-w-0 items-center gap-2 text-body text-text-muted">
            <span className="truncate">{user?.email}</span>
            {user ? (
              <Badge variant={user.emailVerified ? "success" : "warning"}>
                {user.emailVerified ? "Confirmed" : "Not confirmed"}
              </Badge>
            ) : null}
          </p>
        </div>
      </div>

      {user ? (
        <section aria-label="Profile and password" className="mt-6 flex flex-col gap-4">
          <AccountNameForm user={user} getAccessToken={getAccessToken} onUserChange={onUserChange} />
          <AccountPasswordForm
            user={user}
            getAccessToken={getAccessToken}
            onSessionChange={onSessionChange}
            onPasswordChanged={() => setDevicesKey((key) => key + 1)}
          />
        </section>
      ) : null}

      {open ? <AccountDevices getAccessToken={getAccessToken} refreshKey={devicesKey} /> : null}

      <section aria-label="Delete account" className="mt-6 border-t border-divider pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-label text-text-muted">Delete your account and your boards, for good.</p>
          <Button variant="ghost" size="sm" onClick={onDeleteAccount} className="shrink-0 text-danger pointer-coarse:h-11">
            Delete account
          </Button>
        </div>
      </section>
    </Dialog>
  );
}

export default memo(AccountDialog);
