import { memo } from "react";
import { Button } from "../ui/index.js";

/**
 * The providers' marks, drawn inline so nothing loads from their servers
 * (and nothing new needs a place in the content security policy).
 */
const MARKS = Object.freeze({
  google: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  ),
  microsoft: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  ),
});

export function ProviderMark({ provider }) {
  return MARKS[provider] ?? null;
}

/**
 * "Continue with Google / GitHub / Microsoft", for the providers the server
 * has configured. Nothing renders when there are none.
 */
function ProviderButtons({ providers, pending, onSelect, verb = "Continue with", className = "" }) {
  if (!providers?.length) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {providers.map((provider) => (
        <Button
          key={provider.id}
          variant="secondary"
          size="md"
          fullWidth
          loading={pending === provider.id}
          disabled={pending !== null && pending !== undefined}
          onClick={() => onSelect(provider.id)}
          className="pointer-coarse:h-11"
        >
          {pending === provider.id ? null : <ProviderMark provider={provider.id} />}
          {verb} {provider.label}
        </Button>
      ))}
    </div>
  );
}

export default memo(ProviderButtons);
