import { memo, useState } from "react";
import { Button, Spinner } from "../ui/index.js";
import { ProviderMark } from "./ProviderButtons.jsx";

/**
 * "Connected accounts" (spec Phase E, E-23): each provider the server offers,
 * connected or not. Connecting leaves for the provider and comes back here.
 * Disconnecting is refused for the account's only way in; the button says
 * why instead of failing.
 */
function AccountConnections({ connections, hasPassword, onConnect }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const { identities, available, loading } = connections;

  if (!loading && available.length === 0) return null;

  const run = async (label, action) => {
    setPending(label);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught?.message ?? "That didn't work. Try again.");
    } finally {
      setPending(null);
    }
  };

  const onlyWayIn = !hasPassword && identities.length === 1;

  return (
    <section aria-labelledby="account-connections" className="mt-6">
      <h3 id="account-connections" className="text-caption uppercase tracking-[0.06em] text-text-muted">
        Connected accounts
      </h3>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-body text-text-muted">
          <Spinner /> Loading…
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-divider rounded-lg border border-border">
          {available.map((provider) => {
            const identity = identities.find((candidate) => candidate.provider === provider.id);
            return (
              <li key={provider.id} className="flex items-center gap-3 px-3 py-2.5">
                <ProviderMark provider={provider.id} />
                <div className="min-w-0 flex-1">
                  <p className="text-body text-text">{provider.label}</p>
                  <p className="truncate text-label text-text-muted">
                    {identity ? (identity.email ?? "Connected") : "Not connected"}
                  </p>
                </div>
                {identity ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    loading={pending === provider.id}
                    disabled={pending !== null || onlyWayIn}
                    title={onlyWayIn ? "Set a password or connect another account first" : undefined}
                    onClick={() => run(provider.id, () => connections.disconnect(identity.id))}
                    className="pointer-coarse:h-11"
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="xs"
                    loading={pending === provider.id}
                    disabled={pending !== null}
                    onClick={() => run(provider.id, () => onConnect(provider.id, "link"))}
                    className="pointer-coarse:h-11"
                  >
                    Connect
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {onlyWayIn ? (
        <p className="mt-2 text-label text-text-muted">
          It's your only way to sign in. Set a password or connect another account before disconnecting it.
        </p>
      ) : null}
      {error ?? connections.error ? (
        <p role="alert" className="mt-2 text-label text-danger">
          {(error ?? connections.error.message)}
        </p>
      ) : null}
    </section>
  );
}

export default memo(AccountConnections);
