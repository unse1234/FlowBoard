import AccountDialog from "./AccountDialog.jsx";
import AuthDialog from "./AuthDialog.jsx";
import DeleteAccountDialog from "./DeleteAccountDialog.jsx";
import ResetPasswordDialog from "./ResetPasswordDialog.jsx";
import VerifyEmailBanner from "./VerifyEmailBanner.jsx";

/**
 * AccountSurfaces — every account dialog and the verification banner, driven
 * by `useAccountUi` (features/auth/useAccountUi.js).
 */
export default function AccountSurfaces({ ui }) {
  const { auth } = ui;

  return (
    <>
      {ui.showVerificationBanner ? (
        <VerifyEmailBanner email={auth.user.email} onResend={ui.resendLink} onDismiss={ui.dismissBanner} />
      ) : null}

      <AuthDialog
        key={ui.authDialog.key}
        open={ui.authDialog.open}
        initialMode={ui.authDialog.mode}
        onClose={ui.closeAuthDialog}
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
        onRequestReset={ui.requestReset}
        onSuccess={ui.handleAuthSuccess}
      />

      <AccountDialog
        key={ui.accountKey}
        open={ui.accountOpen && auth.user !== null}
        user={auth.user}
        onClose={ui.closeAccount}
        onSignOut={ui.handleSignOut}
        getAccessToken={auth.getAccessToken}
        onUserChange={auth.replaceUser}
        onSessionChange={auth.adoptSession}
        onDeleteAccount={ui.openDeleteAccount}
      />

      <DeleteAccountDialog
        key={`delete-${ui.deletion.key}`}
        open={ui.deletion.open && auth.user !== null}
        user={auth.user}
        getAccessToken={auth.getAccessToken}
        onClose={ui.closeDeleteAccount}
        onDeleted={ui.handleAccountDeleted}
      />

      <ResetPasswordDialog
        key={`reset-${ui.reset.key}`}
        open={ui.reset.open}
        token={ui.reset.token}
        onClose={ui.closeReset}
        onReset={ui.submitReset}
        onDone={ui.handleResetDone}
        onRequestNewLink={ui.requestNewResetLink}
      />
    </>
  );
}
