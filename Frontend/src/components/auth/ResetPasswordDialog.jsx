import { Eye, EyeOff } from "lucide-react";
import { memo, useId, useRef, useState } from "react";
import { messageForCode, passwordLengthHint, validateNewPassword } from "../../features/auth/authForm.js";
import { Button, Dialog, IconButton } from "../ui/index.js";
import { AuthField } from "./AuthField.jsx";

/**
 * ResetPasswordDialog — choose a new password from a reset link (Phase A).
 *
 * The token came from the address bar, which the page has already cleared,
 * and is used only when the form is submitted. Success signs every device out,
 * this one included, so the next step is signing in with the new password.
 *
 * A link that is damaged, expired or already used offers a new one straight
 * away rather than a dead end.
 */
function ResetPasswordDialog({ open, token, onClose, onReset, onDone, onRequestNewLink }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [linkDead, setLinkDead] = useState(token === null);
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);
  const passwordRef = useRef(null);
  const id = useId();

  const clientCode = validateNewPassword(password);
  const fieldError = serverError ?? (touched && clientCode ? messageForCode(clientCode) : null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (pending) return;

    setTouched(true);
    if (clientCode) {
      passwordRef.current?.focus();
      return;
    }

    setPending(true);
    setFormError(null);
    try {
      await onReset({ token, password });
      onDone();
    } catch (error) {
      const code = typeof error?.code === "string" ? error.code : "";
      if (code === "TOKEN_INVALID") setLinkDead(true);
      else if (code.startsWith("PASSWORD_")) {
        setServerError(error.message);
        passwordRef.current?.focus();
      } else setFormError(error?.message || "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  };

  if (linkDead) {
    return (
      <Dialog open={open} onClose={onClose} size="sm" title="This link doesn't work">
        <div className="flex flex-col gap-4">
          <p className="text-body text-text">
            Reset links work once and expire after 30 minutes, and a newer link replaces an older one. Ask for a new
            link and use the most recent email.
          </p>
          <Button variant="primary" size="md" fullWidth onClick={onRequestNewLink} className="pointer-coarse:h-11">
            Request a new link
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
      initialFocusRef={passwordRef}
      title="Choose a new password"
      description="Every device signed in to your account will be signed out, this one included."
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
        <AuthField
          id={`${id}-password`}
          label="New password"
          inputRef={passwordRef}
          type={showPassword ? "text" : "password"}
          name="new-password"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={password}
          error={fieldError}
          hint={password === "" ? "At least 12 characters." : (passwordLengthHint(password) ?? "Long enough.")}
          onChange={(event) => {
            setPassword(event.target.value);
            setServerError(null);
            setFormError(null);
          }}
          onBlur={() => password !== "" && setTouched(true)}
          trailing={
            <IconButton
              label={showPassword ? "Hide password" : "Show password"}
              tooltip={false}
              size="md"
              pressed={showPassword}
              onClick={() => setShowPassword((shown) => !shown)}
              className="pointer-coarse:size-10"
            >
              {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
            </IconButton>
          }
        />

        {formError ? (
          <p role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2.5 text-label text-danger">
            {formError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="md" fullWidth loading={pending} className="mt-1 pointer-coarse:h-11">
          Set new password
        </Button>
      </form>
    </Dialog>
  );
}

export default memo(ResetPasswordDialog);
