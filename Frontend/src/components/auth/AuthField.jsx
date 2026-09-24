import { cx } from "../ui/index.js";

/**
 * AuthField — a labelled text input for the account forms.
 *
 * The label is visible, not a placeholder: it stays readable while typing,
 * which a placeholder does not, and a password manager finds the field by it.
 * One line beneath holds either the error or the hint, and the input is
 * described by whichever is showing.
 *
 * On touch devices the text is 16px. iOS Safari zooms the page into any input
 * smaller than that, and the viewport does not forbid zoom (nor should it).
 */
export function AuthField({ id, label, error, hint, trailing, inputRef, className = "", ...inputProps }) {
  const messageId = `${id}-message`;
  const message = error || hint;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-label text-text">
        {label}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cx(
            "h-10 w-full rounded-md border bg-surface px-3 text-body text-text placeholder:text-text-soft",
            "transition-colors duration-150 pointer-coarse:h-11 pointer-coarse:text-[16px]",
            error ? "border-danger" : "border-border-strong",
            trailing && "pr-11 pointer-coarse:pr-12",
          )}
          {...inputProps}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>
        ) : null}
      </div>

      {message ? (
        <p id={messageId} className={cx("text-label", error ? "text-danger" : "text-text-muted")}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
