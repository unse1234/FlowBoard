import { useCallback, useEffect, useState } from "react";
import { disconnectIdentity, listIdentities } from "./authClient.js";

/**
 * The providers connected to the signed-in account, and the ones that could
 * be (spec Phase E). Read when `enabled`, and again after a disconnect.
 *
 * @param {{ getAccessToken: () => Promise<string | null>, enabled: boolean }} options
 */
export function useIdentities({ getAccessToken, enabled }) {
  const [readKey, setReadKey] = useState(0);
  const [state, setState] = useState({ key: null, value: null, error: null });
  const key = enabled ? readKey : null;

  useEffect(() => {
    if (key === null) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const value = await listIdentities({ accessToken: await getAccessToken() });
        if (!cancelled) setState({ key, value, error: null });
      } catch (error) {
        if (!cancelled) setState({ key, value: null, error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, key]);

  const disconnect = useCallback(
    async (identityId) => {
      try {
        await disconnectIdentity({ accessToken: await getAccessToken(), identityId });
      } finally {
        setReadKey((current) => current + 1);
      }
    },
    [getAccessToken],
  );

  const current = state.key === key ? state : null;
  return {
    loading: key !== null && !current,
    identities: current?.value?.identities ?? [],
    available: current?.value?.available ?? [],
    hasPassword: current?.value?.hasPassword ?? true,
    error: current?.error ?? null,
    disconnect,
  };
}
