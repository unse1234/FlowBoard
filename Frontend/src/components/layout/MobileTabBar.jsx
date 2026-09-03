import { MessageSquare, Pencil, Settings, Users } from "lucide-react";
import { MOBILE_SHEETS } from "../../hooks/useUiLayout.js";

const TABS = [
  { id: MOBILE_SHEETS.TOOLS, label: "Tools", Icon: Pencil },
  { id: MOBILE_SHEETS.CHAT, label: "Chat", Icon: MessageSquare },
  { id: MOBILE_SHEETS.PARTICIPANTS, label: "Participants", Icon: Users },
  { id: MOBILE_SHEETS.SETTINGS, label: "Settings", Icon: Settings },
];

/**
 * MobileTabBar — the bottom navigation from the mobile designs.
 *
 * Each tab opens the matching bottom sheet; tapping the active tab closes it,
 * which is what makes the canvas reachable one-handed.
 */
export default function MobileTabBar({ activeSheet, onSelect, participantCount = 0 }) {
  return (
    <nav
      aria-label="Board sections"
      className={[
        "fixed inset-x-0 bottom-0 z-60 flex h-15 items-stretch lg:hidden",
        "border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]",
      ].join(" ")}
    >
      {TABS.map((tab) => {
        const { id, label } = tab;
        const Icon = tab.Icon;
        const isActive = activeSheet === id;

        return (
          <button
            key={id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(id)}
            className={[
              "relative flex flex-1 flex-col items-center justify-center gap-1",
              "text-[10px] font-medium transition-colors duration-150",
              isActive ? "text-brand" : "text-text-soft hover:text-text-muted",
            ].join(" ")}
          >
            <span className="relative">
              <Icon size={19} strokeWidth={isActive ? 2.3 : 2} />
              {id === MOBILE_SHEETS.PARTICIPANTS && participantCount > 1 ? (
                <span
                  className={[
                    "absolute -right-2 -top-1.5 grid h-3.5 min-w-3.5 place-items-center",
                    "rounded-full bg-brand px-1 text-[9px] font-bold text-white",
                  ].join(" ")}
                >
                  {participantCount}
                </span>
              ) : null}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
