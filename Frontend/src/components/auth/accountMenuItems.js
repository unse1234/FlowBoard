import { CircleUserRound, LogIn, LogOut } from "lucide-react";
import { AUTH_STATUS } from "../../features/auth/authSession.js";

/**
 * The account section of the board menu, as data.
 *
 * It rides in the board menu rather than a new header control, because the
 * menu already reaches every layout: the desktop dropdown and the phone sheet
 * are built from the same items (boardMenuItems.js). The chrome stays as quiet
 * as the design system asks, and an account adds nothing to a board yet.
 *
 * While a returning visitor's session is being restored, the section is empty
 * rather than offering "Sign in" for a moment and then withdrawing it. It is
 * empty too where the server has accounts switched off, so nobody is offered
 * a sign-in that cannot work.
 *
 * @param {Object} account
 * @param {string} account.status  one of AUTH_STATUS
 * @param {{ displayName: string } | null} account.user
 * @param {() => void} account.onSignIn
 * @param {() => void} account.onOpenAccount
 * @param {() => void} account.onSignOut
 */
export function buildAccountMenuItems({ status, user, onSignIn, onOpenAccount, onSignOut }) {
  if (status === AUTH_STATUS.SIGNED_IN && user) {
    return [
      { id: "account", label: user.displayName, icon: CircleUserRound, onSelect: onOpenAccount },
      { id: "sign-out", label: "Sign out", icon: LogOut, onSelect: onSignOut },
    ];
  }

  if (status === AUTH_STATUS.SIGNED_OUT) {
    return [{ id: "sign-in", label: "Sign in", icon: LogIn, onSelect: onSignIn }];
  }

  return [];
}
