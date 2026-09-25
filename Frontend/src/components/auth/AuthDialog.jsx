import { Eye, EyeOff, MailCheck } from "lucide-react";
import { memo, useEffect, useId, useRef, useState } from "react";
import {
  AUTH_MODES,
  fieldForErrorCode,
  messageForCode,
  passwordLengthHint,
  validateAuthForm,
} from "../../features/auth/authForm.js";
import { getTurnstileSiteKey } from "../../features/auth/turnstile.js";
import { useThemeContext } from "../../features/theme/themeContext.js";
import { Button, Dialog, IconButton } from "../ui/index.js";
import { AuthField } from "./AuthField.jsx";
import ProviderButtons from "./ProviderButtons.jsx";
import { TurnstileWidget } from "./TurnstileWidget.jsx";

const { SIGN_IN, SIGN_UP, FORGOT_PASSWORD } = AUTH_MODES;

/** Top to bottom, so focus goes to the first problem a person would reach. */
const FIELDS = Object.freeze({
  [SIGN_IN]: ["email", "password"],
  [SIGN_UP]: ["displayName", "email", "password"],
  [FORGOT_PASSWORD]: ["email"],
});

/**
 * Deliberately modest: an account keeps someone signed in and, once their
 * address is confirmed, lets them collaborate. Boards are not stored against
 * it until Step 2, so no line here promises otherwise.
 */
const COPY = Object.freeze({
  [SIGN_IN]: {
    title: "Sign in",
    description: "Use the email address and password you signed up with.",
    submit: "Sign in",
    switchPrompt: "New to FlowBoard?",
    switchAction: "Create an account",
  },
  [SIGN_UP]: {
    title: "Create your account",
    description: "It takes a moment, and you'll stay signed in on this device.",
    submit: "Create account",
    switchPrompt: "Already have an account?",
    switchAction: "Sign in",
  },
  [FORGOT_PASSWORD]: {
    title: "Reset your password",
    description: "Enter the email address you signed up with, and we'll send you a link to choose a new password.",
    submit: "Send reset link",
    switchPrompt: "Remembered it?",
    switchAction: "Sign in",
  },
});

const EMPTY = Object.freeze({ displayName: "", email: "", password: "" });

/** Turnstile guards sign-up only where a site key is configured (7.5). */
const TURNSTILE_SITE_KEY = getTurnstileSiteKey();

/**
 * AuthDialog — sign in, or create an account, in one place.
 *
 * Errors appear once they are useful: when a field with something in it
 * loses focus, or on submit, never while someone is still typing. A server
 * error lands on the field it is about (the codes are shared, authForm.js).
 * One about the whole attempt, such as a wrong password, sits above the
 * button, and never points at a field, since that would hint which half was
 * right.
 *
 * "Forgot password?" asks for an address only. Its answer is the server's,
 * the same whether or not an account exists, so the dialog never says which.
 *
 * Re-key it each time it opens, so it starts empty.
 */
function AuthDialog({
  open,
  initialMode = SIGN_IN,
  onClose,
  onSignIn,
  onSignUp,
  onRequestReset,
  onSuccess,
  providers = [],
  onProviderSignIn,
}) {
  const [mode, setMode] = useState(initialMode);
  const [values, setValues] = useState(EMPTY);
  const [blurred, setBlurred] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // The server's answer to a reset request, shown in place of the form.
  const [resetSent, setResetSent] = useState(null);
  // The provider being handed over to; the page leaves for it on success.
  const [providerPending, setProviderPending] = useState(null);

  const chooseProvider = async (provider) => {
    setProviderPending(provider);
    setFormError(null);
    try {
      await onProviderSignIn(provider);
    } catch (error) {
      setFormError({ message: error?.message || "Couldn't reach that sign-in option. Try again." });
      setProviderPending(null);
    }
  };
  // Turnstile's single-use token, and a key that remounts the widget for a
  // fresh one after a failed attempt.
  const [botToken, setBotToken] = useState(null);
  const [botWidgetKey, setBotWidgetKey] = useState(0);
  const { theme } = useThemeContext();
  const needsBotCheck = mode === SIGN_UP && TURNSTILE_SITE_KEY !== null;

  const displayNameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const focusAfterSwitch = useRef(false);
  const idPrefix = useId();
  const copy = COPY[mode];

  const clientErrors = validateAuthForm(values, mode);

  const errorFor = (field) => {
    if (serverErrors[field]) return serverErrors[field];
    const shown = submitted || (blurred[field] && values[field] !== "");
    return shown && clientErrors[field] ? messageForCode(clientErrors[field]) : null;
  };

  const refs = { displayName: displayNameRef, email: emailRef, password: passwordRef };
  const firstFieldRef = mode === SIGN_UP ? displayNameRef : emailRef;

  // After switching between sign-in and sign-up the first field may be a
  // different one, mounted only now, so focus follows the render.
  useEffect(() => {
    if (!focusAfterSwitch.current) return;
    focusAfterSwitch.current = false;
    (mode === SIGN_UP ? displayNameRef : emailRef).current?.focus();
  }, [mode]);

  const update = (field) => (event) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  };

  const markBlurred = (field) => () => setBlurred((current) => ({ ...current, [field]: true }));

  const switchMode = (next) => {
    focusAfterSwitch.current = true;
    setMode(next);
    setSubmitted(false);
    setBlurred({});
    setServerErrors({});
    setFormError(null);
    setResetSent(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (pending) return;

    setSubmitted(true);
    const firstInvalid = FIELDS[mode].find((field) => clientErrors[field]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }

    // Cloudflare usually hands over a token within a second, unseen. If it has
    // not yet, or asked for a click that has not happened, say so.
    if (needsBotCheck && !botToken) {
      setFormError({ message: "Confirming you're human. Try again in a moment." });
      return;
    }

    setPending(true);
    setFormError(null);

    try {
      const email = values.email.trim();
      if (mode === FORGOT_PASSWORD) {
        setResetSent(await onRequestReset({ email }));
        return;
      }

      const user =
        mode === SIGN_UP
          ? await onSignUp({
              email,
              password: values.password,
              displayName: values.displayName.trim(),
              ...(needsBotCheck ? { turnstileToken: botToken } : {}),
            })
          : await onSignIn({ email, password: values.password });
      onSuccess(user, mode);
    } catch (error) {
      // The token is single-use and may have been spent: start a fresh check.
      if (needsBotCheck) {
        setBotToken(null);
        setBotWidgetKey((current) => current + 1);
      }

      const code = typeof error?.code === "string" ? error.code : "";
      const field = fieldForErrorCode(code);

      if (field && FIELDS[mode].includes(field)) {
        setServerErrors({ [field]: error.message });
        refs[field].current?.focus();
      } else {
        setFormError({
          message: error?.message || "Something went wrong. Try again.",
          // Sign-up answers the same for a taken address (E-12), so this is
          // the one hint that an existing account may be the reason.
          offerSignIn: code === "SIGN_UP_THEN_SIGN_IN_FAILED",
        });
      }
    } finally {
      setPending(false);
    }
  };

  const passwordHint =
    mode === SIGN_UP
      ? values.password === ""
        ? "At least 12 characters."
        : (passwordLengthHint(values.password) ?? "Long enough.")
      : null;

  const id = (field) => `${idPrefix}-${field}`;

  if (mode === FORGOT_PASSWORD && resetSent) {
    return (
      <Dialog open={open} onClose={onClose} size="sm" title="Check your email">
        <div className="flex flex-col gap-4">
          <p className="flex gap-2.5 text-body text-text">
            <MailCheck size={18} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
            <span>{resetSent}</span>
          </p>
          <p className="text-label text-text-muted">
            The link works once and expires in 30 minutes. If nothing arrives, check your spam folder, then try
            again.
          </p>
          <Button variant="primary" size="md" fullWidth onClick={() => switchMode(SIGN_IN)} className="pointer-coarse:h-11">
            Back to sign in
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      initialFocusRef={firstFieldRef}
      title={copy.title}
      description={copy.description}
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
        {mode !== FORGOT_PASSWORD && providers.length > 0 && onProviderSignIn ? (
          <>
            <ProviderButtons providers={providers} pending={providerPending} onSelect={chooseProvider} />
            <div className="flex items-center gap-3 text-caption text-text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-divider" />
              or with email
              <span className="h-px flex-1 bg-divider" />
            </div>
          </>
        ) : null}

        {mode === SIGN_UP ? (
          <AuthField
            id={id("displayName")}
            label="Name"
            inputRef={displayNameRef}
            type="text"
            name="name"
            autoComplete="name"
            value={values.displayName}
            error={errorFor("displayName")}
            hint="Shown to people you work with."
            onChange={update("displayName")}
            onBlur={markBlurred("displayName")}
          />
        ) : null}

        <AuthField
          id={id("email")}
          label="Email address"
          inputRef={emailRef}
          type="email"
          name="email"
          inputMode="email"
          // "username" on sign-in is what password managers look for to fill
          // a saved pair; "email" on sign-up lets them offer the address.
          autoComplete={mode === SIGN_IN ? "username" : "email"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={values.email}
          error={errorFor("email")}
          onChange={update("email")}
          onBlur={markBlurred("email")}
        />

        {mode === FORGOT_PASSWORD ? null : (
        <AuthField
          id={id("password")}
          label="Password"
          inputRef={passwordRef}
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete={mode === SIGN_IN ? "current-password" : "new-password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={values.password}
          error={errorFor("password")}
          hint={passwordHint}
          onChange={update("password")}
          onBlur={markBlurred("password")}
          trailing={
            <IconButton
              label={showPassword ? "Hide password" : "Show password"}
              tooltip={false}
              size="md"
              pressed={showPassword}
              onClick={() => setShowPassword((shown) => !shown)}
              className="pointer-coarse:size-10"
            >
              {showPassword ? (
                <EyeOff size={16} strokeWidth={1.75} />
              ) : (
                <Eye size={16} strokeWidth={1.75} />
              )}
            </IconButton>
          }
        />
        )}

        {mode === SIGN_IN && onRequestReset ? (
          <button
            type="button"
            onClick={() => switchMode(FORGOT_PASSWORD)}
            className="-mt-2 self-start rounded-sm text-label font-semibold text-text-muted underline-offset-2 hover:text-text hover:underline pointer-coarse:min-h-11"
          >
            Forgot password?
          </button>
        ) : null}

        {needsBotCheck ? (
          <TurnstileWidget key={botWidgetKey} siteKey={TURNSTILE_SITE_KEY} theme={theme} onToken={setBotToken} />
        ) : null}

        {formError ? (
          <div
            role="alert"
            className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2.5 text-label text-danger"
          >
            <p>{formError.message}</p>
            {formError.offerSignIn ? (
              <button
                type="button"
                onClick={() => switchMode(SIGN_IN)}
                className="mt-1 font-semibold underline underline-offset-2 pointer-coarse:min-h-11"
              >
                Sign in instead
              </button>
            ) : null}
          </div>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          loading={pending}
          className="mt-1 pointer-coarse:h-11"
        >
          {copy.submit}
        </Button>

        <p className="text-center text-label text-text-muted">
          {copy.switchPrompt}{" "}
          <button
            type="button"
            onClick={() => switchMode(mode === SIGN_IN ? SIGN_UP : SIGN_IN)}
            className="inline-flex items-center rounded-sm font-semibold text-text underline-offset-2 hover:underline pointer-coarse:min-h-11"
          >
            {copy.switchAction}
          </button>
        </p>
      </form>
    </Dialog>
  );
}

export default memo(AuthDialog);
