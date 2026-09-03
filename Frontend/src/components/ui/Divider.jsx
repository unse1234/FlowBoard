/**
 * Divider — hairline rule. `vertical` renders the toolbar separator.
 */
export function Divider({ vertical = false, className = "" }) {
  return (
    <div
      role="separator"
      aria-hidden="true"
      className={[
        "bg-border",
        vertical ? "h-5 w-px" : "h-px w-full",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
