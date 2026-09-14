import { pickCollaboratorColor } from "../../constants/presence.js";
import { cx } from "./cx.js";

/**
 * Avatar / AvatarStack — presence identity.
 *
 * Initials on the collaborator's colour. When no colour is passed one is seeded
 * from the id, using the same palette as live cursors, so a person looks the
 * same in the stack, the people list and on the canvas.
 */

const SIZES = {
  xs: "size-5 text-kbd",
  sm: "size-6 text-kbd",
  md: "size-7 text-caption",
  lg: "size-8 text-label",
};

function initials(name) {
  const parts = String(name ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  color,
  seed,
  size = "md",
  ring = false,
  speaking = false,
  className = "",
  ...props
}) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cx(
        "relative grid shrink-0 select-none place-items-center rounded-full font-semibold text-white",
        SIZES[size] ?? SIZES.md,
        ring && "ring-2 ring-surface",
        speaking && "fb-speaking",
        className,
      )}
      style={{ background: color ?? pickCollaboratorColor(seed ?? name) }}
      {...props}
    >
      {initials(name)}
    </span>
  );
}

/**
 * AvatarStack — overlapping avatars with a "+N" overflow chip.
 *
 * @param {Array<{userId?: string, id?: string, username?: string, name?: string, color?: string, isSpeaking?: boolean}>} users
 */
export function AvatarStack({ users = [], max = 3, size = "md", className = "" }) {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;

  return (
    <span className={cx("flex items-center -space-x-1.5", className)}>
      {visible.map((user, index) => (
        <Avatar
          key={user.userId ?? user.id ?? index}
          name={user.username ?? user.name ?? "Guest"}
          color={user.color}
          seed={user.userId ?? user.id}
          size={size}
          speaking={Boolean(user.isSpeaking)}
          ring
        />
      ))}

      {overflow > 0 ? (
        <span
          aria-label={`${overflow} more`}
          className={cx(
            "grid min-w-7 shrink-0 place-items-center rounded-full px-1 ring-2 ring-surface",
            "bg-surface-muted text-kbd font-semibold tabular-nums text-text-muted",
            size === "lg" ? "h-8" : size === "sm" ? "h-6 min-w-6" : "h-7",
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
