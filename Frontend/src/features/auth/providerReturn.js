/**
 * What happened with a provider sign-in, read from the address the server
 * sent the browser back to: `/?oauth=<outcome>` or `/?oauth_error=<code>`,
 * with `provider` (Backend/src/auth/oauth/oauthRoutes.js).
 *
 * The server says only which case it was; the words are here. Nothing in the
 * address is shown as-is: an unknown code or provider falls back to general
 * wording, so a crafted link cannot put its own text on the page.
 */

const PROVIDER_LABELS = Object.freeze({ google: "Google", github: "GitHub", microsoft: "Microsoft" });

const OUTCOMES = Object.freeze({
  "signed-in": (p) => ({ tone: "success", title: `Signed in with ${p}` }),
  "signed-up": (p) => ({ tone: "success", title: "Welcome to FlowBoard", description: `Your account uses ${p} to sign in.` }),
  linked: (p) => ({ tone: "success", title: `${p} is now connected`, description: `You can sign in with ${p} from now on.` }),
  reauthenticated: () => ({
    tone: "success",
    title: "Confirmed it's you",
    description: "For the next 10 minutes you can set a password or delete your account.",
  }),
});

const ERRORS = Object.freeze({
  cancelled: (p) => ({ title: `Sign-in with ${p} was cancelled` }),
  state_invalid: () => ({ title: "That sign-in expired", description: "It took too long, or began in another browser. Try again." }),
  provider_failed: (p) => ({ title: `${p} couldn't sign you in`, description: "Try again in a moment." }),
  email_unverified: (p) => ({
    title: `${p} didn't give us a verified email address`,
    description: `Verify your address with ${p}, or create an account with email and password and connect ${p} from Account settings.`,
  }),
  email_unusable: (p) => ({ title: `We can't use the email address from ${p}`, description: "Create an account with email and password instead." }),
  account_exists: (p) => ({
    title: "An account already exists with this email",
    description: `Sign in with your existing password account first, then connect ${p} from Account settings.`,
  }),
  identity_in_use: (p) => ({ title: `That ${p} account is connected to another FlowBoard account` }),
  provider_already_linked: (p) => ({ title: `You already have a ${p} account connected`, description: "Disconnect it first to connect a different one." }),
  wrong_account: (p) => ({ title: `That ${p} account isn't connected to this FlowBoard account` }),
  account_unavailable: () => ({ title: "This account isn't available", description: "Contact support if you think that's wrong." }),
  session_ended: (p) => ({ title: "Your session ended", description: `Sign in again, then try ${p} again.` }),
  rate_limited: () => ({ title: "Too many attempts", description: "Wait a moment and try again." }),
});

/**
 * @param {{ search?: string } | undefined} location
 * @returns {{ ok: boolean, outcome: string, message: { tone?: string, title: string, description?: string } } | null}
 */
export function readProviderReturn(location = globalThis.location) {
  const params = new URLSearchParams(location?.search ?? "");
  const outcome = params.get("oauth");
  const error = params.get("oauth_error");
  if (!outcome && !error) return null;

  const label = PROVIDER_LABELS[params.get("provider")] ?? "your account provider";
  if (outcome && Object.hasOwn(OUTCOMES, outcome)) {
    return { ok: true, outcome, message: OUTCOMES[outcome](label) };
  }
  const code = Object.hasOwn(ERRORS, error) ? error : "provider_failed";
  return { ok: false, outcome: code, message: { tone: "danger", ...ERRORS[code](label) } };
}

/** The address without the provider's report, keeping anything else. */
export function addressWithoutProviderReturn(location = globalThis.location) {
  const params = new URLSearchParams(location?.search ?? "");
  params.delete("oauth");
  params.delete("oauth_error");
  params.delete("provider");
  const query = params.toString();
  return `${location?.pathname ?? "/"}${query ? `?${query}` : ""}${location?.hash ?? ""}`;
}
