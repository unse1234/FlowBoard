# FlowBoard UI Redesign — Audit & Parity Plan

Audit taken before the redesign (branch `feature/flowboard-ui-redesign`,
baseline commit `9ab5a7e`), with how each finding was resolved. The design
system that answers it is in [`design-system.md`](./design-system.md).

## Architecture (unchanged by the redesign)

- **Board state:** `hooks/useWhiteboard.js` owns shapes, tool, style, transform,
  selection, history and collaboration wiring.
- **Pointer logic:** `hooks/useWhiteboardEvents.js` (draw, marquee, erase, laser,
  pan, snap, transform batching).
- **Realtime:** `features/realtime` — socket service → realtime manager →
  operation dispatcher → validated, versioned operations applied by
  `operationApplier`. The operation contract is duplicated frontend/backend and
  was not changed.
- **Voice:** `features/communication/voice` — WebRTC mesh with signalling,
  voice-activity detection and ICE recovery. Not changed.
- **Rendering:** Konva stage sized to the window; shapes memoised per id;
  sketchy/clean rendering strategies. Renderers not changed.
- **Theme:** `ThemeManager` toggles `.dark`; Tailwind v4 utilities resolve CSS
  variables.

## Findings and resolutions

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Critical | Touch drawing did not work: the stage bound only mouse events, which never fire for a touch drag. | Stage uses pointer events; touch presses cancel emulated mouse events and release focus (`7e663ad`) |
| 2 | Critical | Pinch zoomed the whole page, not the canvas. | `touch-action: none` on the canvas; pinch and two-finger pan hook with tested maths (`7e663ad`) |
| 3 | High | No way to delete without a keyboard; no text-size control; note colours unused. | Delete/Duplicate in inspector, sheets and the touch selection bar; text size, font and note colour in the inspector (`3fab445`, `7e663ad`) |
| 4 | High | Placeholder UI presented as product: Chat, "Soon" title, disabled rail icons, "Permissions · Soon", "Export · Soon"; export missing. | Placeholders removed; real PNG export; truthful permission display in Share (`8dd58c4`, `ffc520e`) |
| 5 | High | Docked panels took ~570px of a 1440px viewport; five voice sections; Join threw on a local board. | Floating islands and a contextual inspector; one People panel; voice unavailable until shared (`8dd58c4`, `627a849`) |
| 6 | High | Display name collected with a blocking `window.prompt`. | Join dialog with a remembered name and a Guest path (`627a849`) |
| 7 | Medium | Style panel showed every section regardless of context. | Pure, tested inspector model per shape type and tool (`3fab445`) |
| 8 | Medium | Tablet rendered the stretched phone layout; mobile hid the active tool. | Tablet uses islands with compact docks; the phone dock always shows the active tool (`6dd36c5`, `7e35cad`) |
| 9 | Medium | All chrome re-rendered on every drawing frame. | Memoised chrome; stable collaboration object, voice model and presence roster (`8dd58c4`) |
| 10 | Medium | Canvas overlays hard-coded colours; cursors scaled with zoom; avatar/cursor colours differed. | Canvas tokens; constant-size cursors with idle labels; one collaborator palette (`3fab445`, `627a849`) |
| 11 | Low | Dark-mode active chips glared. | Graphite palette with a lemon signal chip (`e1ee92b`) |
| 12 | Low | No tooltips, undiscoverable shortcuts, no focus traps, tabs without arrow keys. | Tooltip, Kbd, focus-trapped Dialog/Sheet, ARIA menus and radiogroups, generated shortcuts dialog (`e1ee92b`, `6dd36c5`) |

### Found and fixed during testing

| Issue | Resolution |
| --- | --- |
| A newly created room did not receive the board's existing shapes: the seed operation was sent before the connection existed and dropped (the original prompt flow had the same ordering). | Seed kept until a send goes out (`627a849`) |
| People disappeared from the list 10s after they stopped moving, because presence was only sent on cursor moves. | Presence heartbeat, immediate reply to newcomers, idle measured from real movement (`627a849`) |
| Delete inside the shortcuts dialog deleted the selection; arrow keys in menus nudged it. | Shortcuts skip handled keys and open modals (`7e35cad`) |
| The phone dock ran edge to edge at 360px; the tablet dock collided with the view island at 768px. | Narrow-phone sizing; touch-tablet dock layout (`7e35cad`) |
| Reported after the redesign shipped: a text shape's colour swatch looked deselected while typing, because the live editor coloured itself from raw `style.stroke` instead of the theme-adjusted colour the canvas actually draws. | Editor reads the same colour Konva renders (`0a7f039`) |
| Reported after the redesign shipped: dark mode's ink-substitution heuristic (brightness) occasionally swapped a chosen palette colour for white, not just near-black ink. | Replaced with a WCAG contrast check against the dark canvas (< 2:1); only strokes that would actually vanish are redrawn white (`0a7f039`) |
| Reported after the redesign shipped: drawing an ellipse right after using the arrow tool (or any shape-to-shape switch) could carry over the previous selection/style context. | Choosing a drawing tool now releases the selection; Select/Hand keep it (`0a7f039`) |
| Found while investigating the above: sketchy (rough) lines/arrows/pen strokes drew two offset strokes in a Group whose own hit box was empty, making thin sketchy strokes hard to click, tap or erase. | Both strokes now carry the shape's `hitStrokeWidth` (`0a7f039`) |

## Feature parity matrix

Verified with Playwright on desktop (1440, 1280, 1024, 1600), tablet (820,
768, 844×390 landscape) and phone (390, 360) viewports, with touch emulation on
tablet and phone and two real browser sessions for collaboration and voice.

| Feature | Desktop | Tablet | Phone | Phone interaction |
| --- | --- | --- | --- | --- |
| Select, multi-select | ✓ | ✓ | ✓ | Tap; drag marquee |
| Pan | ✓ | ✓ | ✓ | Two-finger drag; Hand tool in More |
| Zoom | ✓ | ✓ | ✓ | Pinch; Zoom to fit / Reset view in board menu |
| Rectangle, ellipse, diamond, line, arrow | ✓ | ✓ | ✓ | Shape flyout in dock |
| Pen, eraser | ✓ | ✓ | ✓ | Dock |
| Laser | ✓ | ✓ | ✓ | More flyout |
| Text, note | ✓ | ✓ | ✓ | Dock / More; tap to place, type, tap away |
| Image upload | ✓ | ✓ | ✓ | More flyout; tap to place, Cancel in hint |
| Stroke, fill, opacity, width, style, edges, rendering, text size, font | ✓ | ✓ | ✓ | Style sheet |
| Delete, duplicate, copy/paste, arrange, group, align | ✓ | ✓ | ✓ | Selection bar + More; Arrange in Style sheet |
| Undo, redo | ✓ | ✓ | ✓ | Top bar |
| Export PNG | ✓ | ✓ | ✓ | Board menu |
| Share link, join room, display name | ✓ | ✓ | ✓ | Share sheet; join dialog |
| Presence, live cursors, connection status | ✓ | ✓ | ✓ | Top bar status → People sheet |
| Voice (join, mute, leave, speaking, reconnecting, failed) | ✓ | ✓ | ✓ | People sheet + voice pill |
| Theme, grid | ✓ | ✓ | ✓ | Board menu |
| Keyboard shortcuts | ✓ | ✓ (with keyboard) | n/a | Visible controls replace keys |
| Feedback (copied, exported, cleared + undo, reconnecting, back online) | ✓ | ✓ | ✓ | Toasts |
