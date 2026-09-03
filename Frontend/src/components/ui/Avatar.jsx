/**
 * Avatar / AvatarStack — presence identity chips.
 *
 * Avatars are initials on a deterministic colour derived from the user id, so
 * the same collaborator keeps the same colour across reloads and across peers.
 */

const AVATAR_COLORS = [
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#8b5cf6",
  "#0ea5e9",
];

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-8 w-8 text-[12px]",
};

function avatarColor(seed) {
  const key = String(seed ?? "");
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash + key.charCodeAt(index) * (index + 1)) % 997;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

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
  size = "sm",
  ring = false,
  className = "",
  ...props
}) {
  return (
    <span
      title={name}
      className={[
        "grid shrink-0 place-items-center rounded-full font-semibold text-white select-none",
        SIZE_CLASSES[size] ?? SIZE_CLASSES.sm,
        ring ? "ring-2 ring-surface" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ background: color ?? avatarColor(seed ?? name) }}
      {...props}
    >
      {initials(name)}
    </span>
  );
}

/**
 * AvatarStack — overlapping avatars with a "+N" overflow chip.
 *
 * @param {Array<{id?: string, userId?: string, name?: string, username?: string, color?: string}>} users
 * @param {number} max - avatars rendered before overflow collapses into "+N"
 */
export function AvatarStack({ users = [], max = 3, size = "sm", className = "" }) {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;

  return (
    <div className={["flex items-center", className].filter(Boolean).join(" ")}>
      <div className="flex -space-x-2">
        {visible.map((user, index) => (
          <Avatar
            key={user.id ?? user.userId ?? index}
            name={user.name ?? user.username ?? "Guest"}
            color={user.color}
            seed={user.id ?? user.userId}
            size={size}
            ring
          />
        ))}
      </div>

      {overflow > 0 && (
        <span
          className={[
            "ml-1.5 grid place-items-center rounded-full px-1.5",
            "bg-surface-soft text-text-muted border border-border",
            "text-[10px] font-semibold",
            size === "md" ? "h-8" : "h-7",
          ].join(" ")}
          title={`${overflow} more collaborator${overflow === 1 ? "" : "s"}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
