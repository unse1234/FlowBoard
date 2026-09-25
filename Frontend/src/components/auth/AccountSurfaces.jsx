import AccountDialog from "./AccountDialog.jsx";
import AuthDialog from "./AuthDialog.jsx";
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
