import { Fragment, memo } from "react";
import { toAriaKeyShortcuts } from "../../features/shortcuts/formatShortcut.js";
import { SHORTCUT_SECTIONS } from "../../features/shortcuts/shortcutReference.js";
import { Dialog, KbdCombo } from "../ui/index.js";

/**
 * ShortcutsDialog — every keyboard shortcut, generated from the binding
 * tables so it cannot fall out of date. Keycaps are visual; each is paired
 * with a screen-reader spelling of the same keys.
 */
function ShortcutsDialog({ open, onClose }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Keyboard shortcuts"
      description="Single-key shortcuts work whenever you're not typing."
    >
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {SHORTCUT_SECTIONS.map((section) => (
          <section key={section.title}>
            <h3 className="mb-1 text-caption uppercase tracking-[0.06em] text-text-muted">
              {section.title}
            </h3>

            <dl className="divide-y divide-divider">
              {section.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex min-h-9 items-center justify-between gap-4 py-1"
                >
                  <dt className="text-body text-text">{row.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1.5 text-label text-text-muted">
                    {row.combos.map((combo, index) => (
                      <Fragment key={combo}>
                        {index > 0 && row.separator !== "none" ? (
                          <span className="font-normal">or</span>
                        ) : null}
                        <KbdCombo combo={combo} />
                        <span className="sr-only">{toAriaKeyShortcuts(combo)}</span>
                      </Fragment>
                    ))}
                    {row.note ? <span className="font-normal">{row.note}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

export default memo(ShortcutsDialog);
