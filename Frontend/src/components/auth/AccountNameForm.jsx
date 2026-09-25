import { memo, useId, useRef, useState } from "react";
import { updateDisplayName } from "../../features/auth/authClient.js";
import { MAX_DISPLAY_NAME_LENGTH, messageForCode } from "../../features/auth/authForm.js";
import { Button } from "../ui/index.js";
import { AuthField } from "./AuthField.jsx";

/** Mirrors the server's rule (authErrors.js): trimmed, 1–80 code points. */
function nameCode(value) {
  const name = value.normalize("NFC").trim();
  if (name === "") return "DISPLAY_NAME_REQUIRED";
  if (Array.from(name).length > MAX_DISPLAY_NAME_LENGTH) return "DISPLAY_NAME_TOO_LONG";
  return null;
}

/**
 * The display name, with an edit in place (spec Phase B). The name is what
 * collaborators see beside a cursor; changing it asks for nothing more than
 * being signed in, since it grants nothing.
 */
function AccountNameForm({ user, getAccessToken, onUserChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.displayName);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef(null);
  const id = useId();

  const start = () => {
    setValue(user.displayName);
    setError(null);
    setEditing(true);
    // After the field mounts.
    queueMicrotask(() => inputRef.current?.select());
  };

  const save = async (event) => {
    event.preventDefault();
    const code = nameCode(value);
    if (code) {
      setError(messageForCode(code));
      inputRef.current?.focus();
      return;
    }
    if (value.trim() === user.displayName) {
      setEditing(false);
      return;
    }

    setPending(true);
    try {
      onUserChange(await updateDisplayName({ accessToken: await getAccessToken(), displayName: value.trim() }));
      setEditing(false);
    } catch (caught) {
      setError(caught?.message ?? "Couldn't save your name. Try again.");
      inputRef.current?.focus();
    } finally {
      setPending(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label text-text-muted">Name</p>
          <p className="truncate text-body text-text">{user.displayName}</p>
        </div>
        <Button variant="ghost" size="xs" onClick={start} className="shrink-0 pointer-coarse:h-11">
          Edit
        </Button>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-2" noValidate onSubmit={save}>
      <AuthField
        id={`${id}-name`}
        label="Name"
        inputRef={inputRef}
        type="text"
        name="name"
        autoComplete="name"
        value={value}
        error={error}
        hint="Shown to people you work with."
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending} className="pointer-coarse:h-11">
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={pending} className="pointer-coarse:h-11">
          Save
        </Button>
      </div>
    </form>
  );
}

export default memo(AccountNameForm);
