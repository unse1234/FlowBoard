import { memo, useEffect, useId, useState } from "react";
import { deleteAccount, getDeletionPreflight } from "../../features/auth/authClient.js";
import { useIdentities } from "../../features/auth/useIdentities.js";
import { deleteBoard, transferBoard } from "../../features/boards/boardsClient.js";
import { Button, Dialog, Spinner } from "../ui/index.js";
import { AuthField } from "./AuthField.jsx";
import ProviderButtons from "./ProviderButtons.jsx";

const CONFIRMATION = "DELETE";

/**
 * DeleteAccountDialog — delete the account, for good (spec Phase B, E-22).
 *
 * A board other people use is never deleted from under them or left without
 * an owner. So those come first, one by one: hand each to someone on it, or
 * delete it. Only then does the form appear: a fresh proof of identity and
 * DELETE typed out. The server checks all of it again.
 */
function DeleteAccountDialog({ open, user, getAccessToken, onClose, onDeleted, onProvider }) {
  const [readKey, setReadKey] = useState(0);
  const [preflight, setPreflight] = useState({ key: null, value: null, error: null });
  const key = open ? readKey : null;

  useEffect(() => {
    if (key === null) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const value = await getDeletionPreflight({ accessToken: await getAccessToken() });
        if (!cancelled) setPreflight({ key, value, error: null });
      } catch (error) {
        if (!cancelled) setPreflight({ key, value: null, error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, key]);

  const current = preflight.key === key ? preflight : null;
  const reread = () => setReadKey((value) => value + 1);

  return (
    <Dialog open={open} onClose={onClose} size="md" title="Delete your account">
      {!current ? (
        <p className="flex items-center gap-2 text-body text-text-muted">
          <Spinner /> Checking what would be deleted…
        </p>
      ) : current.error ? (
        <p role="alert" className="text-label text-danger">
          {current.error.message}{" "}
          <button type="button" onClick={reread} className="font-semibold underline underline-offset-2">
            Try again
          </button>
        </p>
      ) : current.value.sharedBoards.length > 0 ? (
        <SharedBoardsFirst boards={current.value.sharedBoards} getAccessToken={getAccessToken} onChanged={reread} />
      ) : (
        <ConfirmDeletion
          user={user}
          preflight={current.value}
          getAccessToken={getAccessToken}
          onCancel={onClose}
          onDeleted={onDeleted}
          onProvider={onProvider}
        />
      )}
    </Dialog>
  );
}

function SharedBoardsFirst({ boards, getAccessToken, onChanged }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text">
        You own {boards.length === 1 ? "a board" : `${boards.length} boards`} other people use. Before your account can go,
        hand each one to someone on it, or delete it for everyone.
      </p>
      <ul className="flex flex-col gap-3">
        {boards.map((board) => (
          <SharedBoardRow key={board.id} board={board} getAccessToken={getAccessToken} onChanged={onChanged} />
        ))}
      </ul>
    </div>
  );
}

function SharedBoardRow({ board, getAccessToken, onChanged }) {
  const selectId = useId();
  const [heir, setHeir] = useState(board.members[0]?.id ?? "");
  const [pending, setPending] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);

  const run = async (label, action) => {
    setPending(label);
    setError(null);
    try {
      await action(await getAccessToken());
      onChanged();
    } catch (caught) {
      setError(caught?.message ?? "That didn't work. Try again.");
      setPending(null);
    }
  };

  return (
    <li className="rounded-lg border border-border p-3">
      <p className="text-body font-medium text-text">{board.title}</p>
      <p className="text-label text-text-muted">
        {board.members.length} {board.members.length === 1 ? "person" : "people"} on it
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          Hand {board.title} to
        </label>
        <select
          id={selectId}
          value={heir}
          onChange={(event) => setHeir(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 text-label text-text pointer-coarse:h-11"
        >
          {board.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          loading={pending === "transfer"}
          disabled={!heir || pending !== null}
          onClick={() => run("transfer", (accessToken) => transferBoard({ accessToken, boardId: board.id, userId: heir }))}
          className="pointer-coarse:h-11"
        >
          Hand over
        </Button>
        {confirmDelete ? (
          <Button
            variant="danger"
            size="sm"
            loading={pending === "delete"}
            disabled={pending !== null}
            onClick={() => run("delete", (accessToken) => deleteBoard({ accessToken, boardId: board.id }))}
            className="pointer-coarse:h-11"
          >
            Delete for everyone
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={pending !== null} onClick={() => setConfirmDelete(true)} className="text-danger pointer-coarse:h-11">
            Delete board
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-label text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function ConfirmDeletion({ user, preflight, getAccessToken, onCancel, onDeleted, onProvider }) {
  const connections = useIdentities({ getAccessToken, enabled: preflight.proof === "provider" });
  const connected = connections.available.filter((provider) =>
    connections.identities.some((identity) => identity.provider === provider.id),
  );
  const id = useId();
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const needsPassword = preflight.proof === "password";
  const ready = typed === CONFIRMATION && (!needsPassword || password !== "");

  const submit = async (event) => {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    try {
      await deleteAccount({
        accessToken: await getAccessToken(),
        confirmation: typed,
        ...(needsPassword ? { password } : {}),
      });
      onDeleted();
    } catch (caught) {
      setError(caught?.message ?? "Couldn't delete your account. Try again.");
      setPending(false);
    }
  };

  const privateBoards =
    preflight.privateBoardCount === 0
      ? "You have no boards of your own on FlowBoard."
      : `Your ${preflight.privateBoardCount === 1 ? "board" : `${preflight.privateBoardCount} boards`} will be deleted with it.`;

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
      <div className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2.5 text-label text-text">
        <p>
          This deletes the account for <strong className="font-semibold">{user?.email}</strong> straight away, signs out every
          device, and removes you from everyone else's boards. {privateBoards} It can't be undone.
        </p>
      </div>

      {needsPassword ? (
        <>
          <input type="email" name="username" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
          <AuthField
            id={`${id}-password`}
            label="Your password"
            type="password"
            name="current-password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-label text-text-muted">
            Your account signs in through a connected account. Confirm it's you with it, then come back here within 10
            minutes. If you already did, go ahead.
          </p>
          {onProvider ? (
            <ProviderButtons providers={connected} verb="Confirm with" onSelect={(provider) => onProvider(provider, "reauthenticate")} />
          ) : null}
        </div>
      )}

      <AuthField
        id={`${id}-confirm`}
        label={`Type ${CONFIRMATION} to permanently delete your account`}
        type="text"
        name="confirm-deletion"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />

      {error ? (
        <p role="alert" className="text-label text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" size="md" loading={pending} disabled={!ready}>
          Delete account
        </Button>
      </div>
    </form>
  );
}

export default memo(DeleteAccountDialog);
