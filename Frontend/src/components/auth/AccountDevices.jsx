import { Monitor, Smartphone } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { listSessions, revokeOtherSessions, revokeSession } from "../../features/auth/authClient.js";
import { describeUserAgent, formatLastActive } from "../../features/auth/sessionDisplay.js";
import { Badge, Button, Spinner } from "../ui/index.js";

/**
 * "Where you're signed in" (Phase 3): every live session, each device in plain
 * words, this one marked, with sign-out for one or all the others.
 *
 * `refreshKey` changes when something elsewhere in the dialog ended sessions
 * (a password change), so the list is read again.
 */
function AccountDevices({ getAccessToken, refreshKey = 0 }) {
  // Bumped to fetch the list again after something changed it.
  const [listKey, setListKey] = useState(0);
  // Tagged with the key it answers, so a slow old answer can never replace a
  // newer one, and "loading" is simply "no answer for this key yet".
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const key = `${refreshKey}:${listKey}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const sessions = await listSessions({ accessToken: await getAccessToken() });
        if (!cancelled) setResult({ key, sessions });
      } catch (error) {
        if (!cancelled) setResult({ key, error: error?.message ?? "Couldn't load your devices." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, getAccessToken]);

  const loading = result?.key !== key;
  const sessions = !loading && result?.sessions ? result.sessions : [];
  const others = sessions.filter((session) => !session.current).length;

  const act = async (label, run) => {
    setBusy(label);
    setActionError(null);
    try {
      await run(await getAccessToken());
    } catch (error) {
      setActionError(error?.message ?? "That didn't work. Try again.");
    } finally {
      setBusy(null);
      setListKey((current) => current + 1);
    }
  };

  return (
    <section aria-labelledby="account-devices" className="mt-6">
      <h3 id="account-devices" className="text-caption uppercase tracking-[0.06em] text-text-muted">
        Where you're signed in
      </h3>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-body text-text-muted">
          <Spinner /> Loading your devices…
        </p>
      ) : result?.error ? (
        <p role="alert" className="mt-3 text-label text-danger">
          {result.error}{" "}
          <button
            type="button"
            onClick={() => setListKey((current) => current + 1)}
            className="font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-divider rounded-lg border border-border">
          {sessions.map((session) => {
            const { label, mobile } = describeUserAgent(session.userAgent);
            const DeviceIcon = mobile ? Smartphone : Monitor;
            const detail = [session.current ? null : formatLastActive(session.lastUsedAt), session.ipAddress]
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={session.id} className="flex items-center gap-3 px-3 py-2.5">
                <DeviceIcon size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-text">{label}</p>
                  {detail ? <p className="truncate text-label text-text-muted">{detail}</p> : null}
                </div>
                {session.current ? (
                  <Badge variant="success">This device</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    loading={busy === session.id}
                    disabled={busy !== null}
                    aria-label={`Sign out ${label}`}
                    onClick={() => act(session.id, (accessToken) => revokeSession({ accessToken, sessionId: session.id }))}
                    className="pointer-coarse:h-11"
                  >
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {actionError ? (
        <p role="alert" className="mt-2 text-label text-danger">
          {actionError}
        </p>
      ) : null}

      {others > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 pointer-coarse:h-11"
          loading={busy === "others"}
          disabled={busy !== null}
          onClick={() => act("others", (accessToken) => revokeOtherSessions({ accessToken }))}
        >
          Sign out everywhere else
        </Button>
      ) : null}
    </section>
  );
}

export default memo(AccountDevices);
