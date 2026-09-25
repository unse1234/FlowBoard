import { Eye, EyeOff } from "lucide-react";
import { memo, useId, useRef, useState } from "react";
import { changePassword, requestPasswordReset } from "../../features/auth/authClient.js";
import { messageForCode, passwordLengthHint, validateNewPassword } from "../../features/auth/authForm.js";
import { Button, IconButton } from "../ui/index.js";
import { AuthField } from "./AuthField.jsx";
import ProviderButtons from "./ProviderButtons.jsx";

/**
 * Change the password, or set a first one (spec Phase B).
 *
 * With a password, the current one is asked for. Without one (an account that
 * signs in through a provider), the server wants a recent provider sign-in;
 * failing that, a reset link to the account's confirmed address sets one just
 * as well, so that is offered.
 *
 * Success ends every session, including this device's old one; the server
 * hands this device a new session, which `onSessionChange` adopts.
 */
function AccountPasswordForm({ user, getAccessToken, onSessionChange, onPasswordChanged, connectedProviders = [], onReauthenticate }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [needsProof, setNeedsProof] = useState(false);
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState(false);
  const currentRef = useRef(null);
  const nextRef = useRef(null);
  const id = useId();
  const setting = !user.hasPassword;

  const nextCode = validateNewPassword(next);
  const currentError = errors.current ?? (submitted && !setting && current === "" ? messageForCode("CURRENT_PASSWORD_REQUIRED") : null);
  const nextError = errors.next ?? (submitted && nextCode ? messageForCode(nextCode) : null);

  const reset = () => {
    setCurrent("");
    setNext("");
    setSubmitted(false);
    setErrors({});
    setFormError(null);
    setNeedsProof(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (pending) return;
    setSubmitted(true);
    if (!setting && current === "") {
      currentRef.current?.focus();
      return;
    }
    if (nextCode) {
      nextRef.current?.focus();
      return;
    }

    setPending(true);
    setFormError(null);
    try {
      const session = await changePassword({
        accessToken: await getAccessToken(),
        ...(setting ? {} : { currentPassword: current }),
        newPassword: next,
      });
      onSessionChange(session);
      onPasswordChanged?.();
      reset();
      setOpen(false);
      setNotice(setting ? "Password set. You can now sign in with it." : "Password changed. Your other devices were signed out.");
    } catch (error) {
      const code = typeof error?.code === "string" ? error.code : "";
      if (code.startsWith("CURRENT_PASSWORD_")) {
        setErrors({ current: error.message });
        currentRef.current?.focus();
      } else if (code.startsWith("PASSWORD_")) {
        setErrors({ next: error.message });
        nextRef.current?.focus();
      } else if (code === "REAUTHENTICATION_REQUIRED") {
        setNeedsProof(true);
      } else {
        setFormError(error?.message ?? "That didn't work. Try again.");
      }
    } finally {
      setPending(false);
    }
  };

  const emailLink = async () => {
    setPending(true);
    try {
      await requestPasswordReset({ email: user.email });
      reset();
      setOpen(false);
      setNotice(`We sent a link to ${user.email}. Open it to choose your password.`);
    } catch (error) {
      setFormError(error?.message ?? "Couldn't send the link. Try again.");
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-label text-text-muted">Password</p>
            <p className="text-body text-text">{setting ? "Not set: you sign in with a connected account" : "••••••••••••"}</p>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setNotice(null);
              setOpen(true);
            }}
            className="shrink-0 pointer-coarse:h-11"
          >
            {setting ? "Set a password" : "Change"}
          </Button>
        </div>
        {notice ? (
          <p role="status" className="mt-1 text-label text-success">
            {notice}
          </p>
        ) : null}
      </div>
    );
  }

  const toggle = (
    <IconButton
      label={show ? "Hide passwords" : "Show passwords"}
      tooltip={false}
      size="md"
      pressed={show}
      onClick={() => setShow((shown) => !shown)}
      className="pointer-coarse:size-10"
    >
      {show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
    </IconButton>
  );

  return (
    <form className="flex flex-col gap-3" noValidate onSubmit={submit}>
      {/* Tells a password manager which account the new password belongs to. */}
      <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />
      {setting ? null : (
        <AuthField
          id={`${id}-current`}
          label="Current password"
          inputRef={currentRef}
          type={show ? "text" : "password"}
          name="current-password"
          autoComplete="current-password"
          value={current}
          error={currentError}
          onChange={(event) => {
            setCurrent(event.target.value);
            setErrors((existing) => ({ ...existing, current: undefined }));
          }}
          trailing={toggle}
        />
      )}
      <AuthField
        id={`${id}-next`}
        label={setting ? "Password" : "New password"}
        inputRef={nextRef}
        type={show ? "text" : "password"}
        name="new-password"
        autoComplete="new-password"
        value={next}
        error={nextError}
        hint={next === "" ? "At least 12 characters." : (passwordLengthHint(next) ?? "Long enough.")}
        onChange={(event) => {
          setNext(event.target.value);
          setErrors((existing) => ({ ...existing, next: undefined }));
        }}
        trailing={setting ? toggle : undefined}
      />

      {needsProof ? (
        <div role="alert" className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-label text-text">
          <p>
            For your security, prove it's you first: sign in again with a connected account, then set your password within 10
            minutes. Or we can email a link to {user.email}.
          </p>
          {onReauthenticate ? (
            <ProviderButtons
              providers={connectedProviders}
              verb="Confirm with"
              onSelect={(provider) => onReauthenticate(provider)}
              className="mt-2"
            />
          ) : null}
          <Button variant="secondary" size="sm" className="mt-2 pointer-coarse:h-11" loading={pending} onClick={emailLink}>
            Email me a link
          </Button>
        </div>
      ) : null}

      {formError ? (
        <p role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2.5 text-label text-danger">
          {formError}
        </p>
      ) : null}

      <p className="text-label text-text-muted">
        {setting ? "Every device will be signed out, then this one signed back in." : "Your other devices will be signed out."}
      </p>

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="pointer-coarse:h-11"
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={pending} className="pointer-coarse:h-11">
          {setting ? "Set password" : "Change password"}
        </Button>
      </div>
    </form>
  );
}

export default memo(AccountPasswordForm);
