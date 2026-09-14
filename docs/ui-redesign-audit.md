# FlowBoard UI Redesign — Audit & Parity Plan

Point-in-time audit taken before the redesign (branch
`feature/flowboard-ui-redesign`, baseline commit `9ab5a7e`). The design system
that answers it is in [`design-system.md`](./design-system.md).

## Architecture (unchanged by the redesign)

- **Board state:** `hooks/useWhiteboard.js` owns shapes, tool, style, transform,
  selection, history and collaboration wiring.
- **Pointer logic:** `hooks/useWhiteboardEvents.js` (draw, marquee, erase, laser,
  pan, snap, transform batching).
- **Realtime:** `features/realtime` — socket service → realtime manager →
  operation dispatcher → validated, versioned operations applied by
  `operationApplier`. The operation contract is duplicated frontend/backend.
- **Voice:** `features/communication/voice` — WebRTC mesh with signalling,
  voice-activity detection and ICE recovery.
- **Rendering:** Konva stage sized to the window; shapes memoised per id;
  sketchy/clean rendering strategies.
- **Theme:** `ThemeManager` toggles `.dark`; Tailwind v4 utilities resolve CSS
  variables.

## Findings, by severity

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| 1 | Critical | Touch drawing does not work: the stage binds `onMouseDown/Move/Up`, and Konva never maps a touch drag to `mousedown`. Pen, shapes, marquee, eraser, laser and the Hand tool fail on phones and tablets. | Playwright touch drag → 0 shapes; Konva `EVENTS_MAP.touch` |
| 2 | Critical | Pinch zooms the whole page, not the canvas. | `visualViewport.scale` → 5 after pinch |
| 3 | High | No way to delete a selection without a keyboard; no text-size control; note colours unused. | `deleteSelectedShapes` only bound to keys |
| 4 | High | Placeholder UI presented as product: Chat tab, "Untitled board · Soon", three disabled rail icons, "Permissions · Soon", "Export · Soon". Export not implemented. | `ChatPanel`, `LeftRail`, `SettingsPanel` |
| 5 | High | Docked panels take ~570px of a 1440px viewport; voice panel repeats one feature across five sections and reports "Disconnected" on a local board, where Join throws. | Desktop screenshot |
| 6 | High | Display name collected with a blocking `window.prompt`. | `useRealtimeCollaboration` |
| 7 | Medium | Style panel shows every section regardless of context, including disabled Layer/Group. | `StylePanel` |
| 8 | Medium | Tablet renders the phone layout stretched; mobile never shows the active tool and needs two taps to change it. | Tablet/mobile screenshots |
| 9 | Medium | All chrome re-renders on every drawing frame (`voiceModel`, `collaboration` rebuilt each render). | `BoardPage`, `useWhiteboard` |
| 10 | Medium | Canvas overlays hard-code colours; live cursors scale with zoom; local avatar colour differs from the cursor colour peers see. | `SelectionRect`, `LineEditor`, `LiveCursors` |
| 11 | Low | Dark-mode active chips invert to near-white and glare. | Dark screenshot |
| 12 | Low | No tooltips (only `title`), shortcuts undiscoverable, dialogs/sheets have no focus trap, tabs lack arrow keys. | `ui/*` |

## Components

| Keep (logic) | Redesign | Remove | Do not touch |
| --- | --- | --- | --- |
| Minimap internals, alignment actions, colour-field pattern, `useMediaQuery`, theme manager, shortcut registry | TopBar, Toolbar, StylePanel, ViewControls, VoiceChatPanel, SettingsPanel, ToolsSheet, all `ui/*` | LeftRail, MobileTabBar, ChatPanel, ComingSoon | Operation contract/applier, socket and voice managers, persistence, shape data, renderers |

Touch support needs two minimal canvas changes: stage handlers move to Konva's
pointer events (which Konva already maps for mouse, touch and pen), and pinch /
two-finger pan run in a separate capture-phase hook so the existing handlers
keep their behaviour.

## Feature parity matrix

| Feature | Desktop | Tablet | Mobile | Mobile interaction |
| --- | --- | --- | --- | --- |
| Select, multi-select | ✓ | ✓ | ✓ | Tap; drag marquee |
| Pan | ✓ | ✓ | ✓ | Two-finger drag; Hand tool |
| Zoom | ✓ | ✓ | ✓ | Pinch; menu zoom controls |
| Rectangle, ellipse, diamond | ✓ | ✓ | ✓ | Shape flyout in dock |
| Line, arrow | ✓ | ✓ | ✓ | Shape flyout in dock |
| Pen, eraser | ✓ | ✓ | ✓ | Dock |
| Laser | ✓ | ✓ | ✓ | More flyout |
| Text, note | ✓ | ✓ | ✓ | Dock / More; tap to place |
| Image upload | ✓ | ✓ | ✓ | More flyout; tap to place |
| Stroke, fill, opacity, width, style, edges, rendering, text size | ✓ | ✓ | ✓ | Style sheet from dock colour dot |
| Delete, duplicate, copy/paste, arrange, group, align | ✓ | ✓ | ✓ | Selection bar + Arrange sheet |
| Undo, redo | ✓ | ✓ | ✓ | Top bar |
| Export PNG | ✓ | ✓ | ✓ | Menu sheet |
| Share link, join room, display name | ✓ | ✓ | ✓ | Share sheet; join dialog |
| Presence, live cursors, connection status | ✓ | ✓ | ✓ | Top bar presence → People sheet |
| Voice (join, mute, leave, speaking, reconnecting, failed) | ✓ | ✓ | ✓ | People sheet + floating voice pill |
| Theme, grid | ✓ | ✓ | ✓ | Menu sheet |
| Keyboard shortcuts | ✓ | ✓ (with keyboard) | n/a | Visible controls replace keys |
| Feedback (copied, exported, reconnecting…) | ✓ | ✓ | ✓ | Toasts |
