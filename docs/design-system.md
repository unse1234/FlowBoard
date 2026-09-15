# FlowBoard Design System — "Ink & Signal"

The visual and interaction system for FlowBoard. Tokens are derived from
[`awwwards-com-DESIGN.md`](../awwwards-com-DESIGN.md) and adapted for a tool
people spend hours inside. The canvas is the hero; chrome is quiet until needed.

- **CSS tokens:** `Frontend/src/index.css` (`@theme` scales, `--fb-*` palettes)
- **Canvas tokens:** `Frontend/src/design/canvasTokens.js` (Konva paints bitmaps,
  so canvas colours are mirrored in JS — change both together)
- **Primitives:** `Frontend/src/components/ui/`

---

## 1. Visual identity

Warm ink on off-white paper, with a single lemon **signal**. Sophistication
comes from typography, spacing and restraint — not gradients, glass or glow.

| Idea | Expression |
| --- | --- |
| Ink | `#222222` — text, active chips (light), brand tile |
| Signal | `#fff083` — primary actions, active chips (dark), text selection |
| Paper | `#f8f8f7` canvas under white islands (light) |
| Graphite | `#151515` canvas under `#1e1e1e` islands (dark) |
| Selection | A cool blue used **only on the canvas** — lemon has no contrast on paper |

Chrome floats as **islands** over a full-bleed canvas. Nothing is docked edge
to edge; no control exists without a job.

## 2. Typography

**Inter Tight** (Awwwards display face) for all UI. **Inter 400** stays loaded
because existing boards store `fontFamily: "Inter"` for canvas text.
**Excalifont** is the hand-drawn canvas face.

| Token | Size / line | Weight | Tracking | Used for |
| --- | --- | --- | --- | --- |
| `text-heading` | 16 / 22 | 600 | -0.01em | Dialog and sheet titles |
| `text-title` | 14 / 20 | 600 | -0.005em | Board identity, inspector and panel titles |
| `text-body` | 13 / 18 | 400 | 0 | Body, menu items, inputs |
| `text-label` | 12 / 16 | 500 | 0 | Control labels, tooltips, buttons |
| `text-caption` | 11 / 14 | 500 | 0.01em | Metadata, section overlines (uppercase, 0.06em) |
| `text-kbd` | 10 / 14 | 500 | 0 | Keycaps, counters |

Six sizes, three weights. Numbers that change (zoom, opacity, counts) use
`tabular-nums`. Never go below 10px.

## 3. Colour

Semantic tokens only — components never use raw hex. Every utility resolves
`var(--fb-*)`, and `.dark` redefines the set.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `canvas` / `bg` | `#f8f8f7` | `#151515` | Board ground |
| `surface` | `#ffffff` | `#1e1e1e` | Islands, panels |
| `surface-raised` | `#ffffff` | `#252525` | Popovers, dialogs, sheets |
| `surface-muted` | `#f2f2f0` | `#2a2a2a` | Tracks, inputs, wells |
| `hover` / `pressed` | ink 5.5% / 10% | white 6% / 10% | Interaction overlays |
| `border` / `border-strong` / `divider` | ink 10 / 18 / 8% | white 8 / 15 / 7% | Hairlines |
| `text` | `#222222` | `#ededed` | Primary text |
| `text-muted` | `#666666` | `#a3a3a3` | Secondary text (AA on surface) |
| `text-soft` | `#8f8f8f` | `#787878` | Icons and placeholders only — never body text |
| `text-disabled` | `#b8b8b8` | `#555555` | Disabled |
| `ink` / `on-ink` | `#222` / `#fff` | `#fff083` / `#111` | Active tool, switch on — the highest-contrast chip |
| `primary` / `on-primary` | `#fff083` / `#111` | `#fff083` / `#111` | Primary actions (Share, Create live link, Copy) |
| `accent-soft` | `#fff8c9` | lemon 12% | Highlight wash |
| `selection` | `#3a6df0` | `#7c9dff` | Canvas selection, marquee, handles |
| `focus` | `#222222` | `#fff083` | Focus ring |
| `success` | `#1a7f45` | `#4fd18b` | Live, connected, speaking |
| `warning` | `#9a5b00` | `#f5b83d` | Reconnecting |
| `danger` | `#cc2f26` | `#ff6e63` | Errors, muted mic, destructive |
| `info` | `#3a6df0` | `#7c9dff` | Informational |

**Dark mode is designed, not inverted:** graphite surfaces step up in
lightness with elevation, borders are white hairlines, shadows add an inner top
highlight, and the active chip becomes lemon so the signal stays the brightest
thing on screen. The ink swatch renders in the current text colour because ink
strokes draw light on the dark canvas: a shape colour below 2:1 contrast with
the dark canvas (near-black inks) is drawn white, and every other colour is
drawn exactly as chosen (`utils/color.js`).

**Collaborators** (`constants/presence.js`): eight hues, each ≥ 4.5:1 against
white label text and visible on both canvases — `#2563eb #d93a3a #15803d
#7c3aed #c2410c #0e7490 #db2777 #a16207`. One seeded pick drives avatar,
cursor and label, so a person has one colour everywhere.

## 4. Spacing

A 4px grid (Tailwind spacing) with 2px steps for optical alignment.

| Metric | Value |
| --- | --- |
| Island inset from viewport | 12px (≥ 768), 8px (phone) |
| Island padding (toolbars) | 4px pointer, 2px touch |
| Panel padding | 12px; section gap 16px |
| Gap between tool buttons | 2px; between groups 1px divider + 4px |
| Control heights | 28 · 32 · 36 (pointer) · 44 (touch) |
| Minimum touch target | 44px; 40px on phones narrower than 380px |

## 5. Radius

Awwwards 4 / 8 / 12 / 14, used **concentrically**: inner = outer − padding.

| Token | px | Used for |
| --- | --- | --- |
| `rounded-sm` | 4 | Keycaps, badges |
| `rounded-inset` | 6 | Segment inside an 8px track with 2px padding |
| `rounded-md` | 8 | Buttons, inputs, menu items, tooltips |
| `rounded-lg` | 12 | Islands, popovers, inspector (12 = 8 + 4 padding); 44px touch buttons |
| `rounded-xl` | 14 | Dialogs, sheet corners, touch islands (14 = 12 + 2 padding) |
| `rounded-full` | — | Avatars, swatches, status dots, toggles |

## 6. Elevation

Borders carry separation; shadows only suggest lift. No backdrop blur over the
canvas — it would re-composite the board on every frame.

| Level | Token | Used for |
| --- | --- | --- |
| 0 | border only | Nested wells, info rows |
| 1 | `shadow-island` | Floating islands, dock, inspector, selection bar, voice pill |
| 2 | `shadow-popover` | Menus, popovers, toasts, tooltips |
| 3 | `shadow-dialog` | Dialogs, sheets (over a `scrim`) |

## 7. Icons

Lucide. 16px / 1.75 stroke in chrome, 18px in the pointer dock, 20px on touch,
14–15px inline. The active tool's icon thickens to 2.25 — a non-colour state
cue. Line-style glyphs (solid, dashed, dotted) are drawn on Lucide's grid with
a 2.5 minimum stroke so the dash pattern still reads at icon size.

## 8. Motion

Awwwards measures 300–600ms `ease-in-out`: right for a marketing site, slow for
a tool. FlowBoard keeps the curve family and shortens it.

| Duration | Use |
| --- | --- |
| 100–150ms | Hover, press (scale 0.94–0.98), toggles, tool activation (`ease-out`) |
| 120–200ms | Popovers, tooltips, toasts, contextual islands (`ease-out` in, `ease-in` out) |
| 280ms | Sheets (200ms out, or continuing from a drag-to-dismiss) |

`--ease-out: cubic-bezier(0.2, 0, 0, 1)`, `--ease-in-out: cubic-bezier(0.45, 0,
0.55, 1)`. No overshoot or bounce. Exits play before unmount (`usePresence`).
Under `prefers-reduced-motion` movement stops and the speaking indicator becomes
a static ring.

## 9. Components

### Primitives (`components/ui`)

| Primitive | Notes |
| --- | --- |
| `Button` | `primary` (lemon), `secondary`, `ghost`, `ink`, `danger`; `xs/sm/md/lg`; `loading` |
| `IconButton` | Required `label`; built-in tooltip with shortcut keycaps; `active` + `tone`; `pressed` only for toggles |
| `Tooltip` / `useTooltip` | 450ms delay, instant when sweeping a row, never on touch, shows on keyboard focus |
| `Kbd` / `KbdCombo` | Platform-aware (`⌘` on Apple, `Ctrl` elsewhere) |
| `Popover` | Portal, flip + clamp, re-places on resize, outside-press / Escape close, focus return |
| `Menu` | `role="menu"`, arrow/Home/End, checkbox and danger items, shortcuts; also the context menu |
| `ActionList` | The same item data as `Menu`, as 48px rows for sheets; checkbox items are switches |
| `Dialog` | Focus trap, Escape, labelled, animated exit |
| `Sheet` | Bottom sheet: focus trap, drag-down to dismiss, safe-area padding |
| `Toast` | `useToast()`; deduped by id, max 3, polite live region, errors as alerts |
| `Island` | The floating surface every chrome cluster sits on |
| `Segmented` | `radiogroup` with arrow-key selection; icon-only options get tooltips |
| `Toggle`, `SliderRow` | Switch; labelled range with a filled track and live `output` |
| `Avatar` / `AvatarStack` | Seeded collaborator colour, speaking ring, overflow chip |
| `Badge` / `StatusDot` / `Spinner` | Semantic tones; state is always paired with text |

### Product components

| Component | Where | Notes |
| --- | --- | --- |
| `WorkspaceHeader` | tablet, desktop | Identity + status island; people, voice, Share, menu island; one panel open at a time |
| `MobileTopBar` | phone | Menu, status + presence (opens People), undo/redo, Share |
| `Toolbar` | all | Tool dock: `full`, `compact`, `compactTouch`, `touch` layouts; flyouts; lock; image placement hint |
| `ViewControls` | tablet, desktop | Undo/redo with disabled states; zoom menu (presets, fit, reset, full screen) |
| `Inspector` / `InspectorPanel` | all | Contextual style controls from a tested model; Duplicate/Delete; collapsible Arrange |
| `SelectionBar` | phone, touch tablet | Duplicate, Delete, More (the context menu actions) |
| `PeoplePanel` | popover / sheet | One row per person with voice status; invite call-out; voice section with every state |
| `SharePanel` | popover / sheet | Create live link, or link + Copy, access, people, status, "Share via…" |
| `VoiceButton` / `VoicePill` | header / phone | Join, connecting, mute with speaking ring, leave, reconnecting, error |
| `JoinRoomDialog` | all | Display name before connecting; suggests the last name; dismiss joins as Guest |
| `ShortcutsDialog` | keyboard | Generated from the binding tables (press `?`) |
| `EmptyCanvasHint` | all | Real single-key shortcuts, or touch guidance |
| `Minimap` | desktop | Themed, pointer events, toggleable |
| `AiDiagramAssistant` | all | Sparkle island beside the dock (tablet, desktop) or a board-menu sheet (phone); describe → preview → insert; draft and preview survive closing the panel |

## 10. Layout

### Desktop (≥ 1270) and tablet (768–1269)

```
┌───────────────────────────────────────────────────────────────┐
│ [▣ FlowBoard │ ● Live · 3]        [◐◑◒ │🎤 ☎│ Share │ ⋯]      │
│                                                  ┌──────────┐ │
│                                                  │Inspector │ │
│                         CANVAS                   │(context) │ │
│                                                  └──────────┘ │
│ [↶ ↷ │ − 100% +]  [↖ ✋│▢ ○ ◇│/ ↗│✎ ⚡ ⌫│T ▤ 🖼│🔒]  [minimap] │
└───────────────────────────────────────────────────────────────┘
```

- **Identity island** (top-left): brand and sync state (saved locally, live ·
  N here, reconnecting, offline, connection issue).
- **Collaboration island** (top-right): presence (opens People), voice once the
  board is shared, Share (primary), main menu.
- **Tool dock** (bottom-centre): grouped Navigate · Shapes · Connectors · Draw ·
  Content · Lock. Below 1270 shapes and secondary tools collapse into flyouts;
  on touch tablets Hand also moves into More.
- **View island** (bottom-left): undo, redo, zoom.
- **Minimap** (bottom-right, desktop, toggleable).
- **Inspector** (right): only with a selection or an active drawing tool.
- **Selection bar** (touch tablets): centred above the dock.
- **Right-click** (pointer devices): canvas context menu.

### Phone (< 768)

```
┌────────────────────────────┐
│ [☰ │ ● Live ◐◑]  [↶ ↷ │ ⇪] │
│                            │
│          CANVAS            │
│                            │
│ [⧉ 🗑 ⋯]       [🎤 2 · ☎]  │  ← selection bar · voice pill
│ [↖ │▢▾ ✎ ⌫ T│ ⋯]    [🎨]   │  ← dock · style
└────────────────────────────┘
```

Same capabilities, touch-first: one finger draws, selects and moves; two
fingers pan and pinch; flyouts open above the thumb; Style, People, Share and
the board menu are sheets. The board menu adds Select all, Paste, Zoom to fit
and Reset view, which a phone cannot reach by keyboard or view island.

## 11. Canvas interaction

- The stage listens to **pointer events** (mouse, pen and touch share one path).
- Touch presses cancel emulated mouse events and release focus by hand, so a
  tap-opened text editor commits when tapping away.
- The canvas sets `touch-action: none`; the page never zooms under a pinch.
- **Pinch and two-finger pan** run in a capture-phase hook. A second finger
  abandons what the first began (including a stroke and its undo checkpoint)
  and no touch reaches Konva until all fingers lift.
- Choosing a drawing tool (dock, flyout or shortcut) releases the selection, so
  the inspector describes the tool's next shape; Select and Hand keep it.
- Lines, arrows and pen strokes are hit within 10px of their path in both clean
  and sketchy rendering — for clicking, tapping and erasing alike.
- Selection handles, marquee, line handles (larger on touch), guides, grid and
  trails paint from `canvasTokens.js`. Live cursors keep a constant screen size
  and drop their label after 3s without movement.

## 12. Shortcut system

Bindings are data (`features/shortcuts/boardShortcuts.js`,
`constants/toolMeta.js`). The keyboard hook, tooltips, menus and the shortcuts
dialog all read them, and a test fails if a binding is missing from the dialog.
Board shortcuts are skipped when a control already handled the key
(`defaultPrevented`) or while a dialog or sheet is open.

## 13. Accessibility rules

1. Every icon-only control has an accessible name; tooltips never replace it.
2. Focus is always visible: 2px `focus` ring, 2px offset (base layer, so
   components can restyle it).
3. Dialogs and sheets trap focus, close on Escape and restore focus.
4. Menus, segmented controls and the tool dock use their ARIA roles and
   arrow-key models; arrows never leak into board shortcuts.
5. State is never colour-only: active tools thicken, speaking and connection
   status carry words, swatch selection is a ring.
6. Text meets WCAG AA (4.5:1); UI boundaries meet 3:1.
7. Touch targets are 44px on coarse pointers (40px on the narrowest phones).
8. `prefers-reduced-motion` removes movement, keeps meaning.
9. Shortcuts are exposed via `aria-keyshortcuts`, tooltips and the shortcuts dialog.

## 14. Token naming

- CSS palette: `--fb-<role>` in `:root` and `.dark`.
- Tailwind utilities: `bg-<role>`, `text-<role>`, `border-<role>` from `@theme inline`.
- Scales: `text-<step>`, `rounded-<step>`, `shadow-<level>`, `ease-<curve>`.
- Breakpoints: `md` 768, `lg` 1270, `xl` 1600; `pointer-coarse:` for touch sizing.
- Z-order: canvas hint 10 · chrome 40 · popover 60 · sheet 70 · dialog 80 · toast 90 · tooltip 100.
