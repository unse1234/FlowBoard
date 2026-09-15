# FlowBoard

A collaborative whiteboard for sketching, diagramming and thinking together —
in the browser, on a laptop, a tablet or a phone.

## Features

### Drawing and editing

* Select, hand, rectangle, ellipse, diamond, line, arrow, pen, laser pointer, eraser, text, sticky notes and images
* Sketchy or clean rendering; stroke and fill colour, stroke width, line style, corners, text size and font, opacity
* Multi-select (marquee or shift-click), group and ungroup, align and distribute, layer order
* Copy, cut, paste and duplicate; undo and redo; snapping guides and an optional grid
* Export the board as a PNG

### AI diagrams

* Describe a flow or a system and FlowBoard draws it as ordinary, editable shapes
* Preview before inserting; one undo removes the whole diagram, and collaborators receive it like any other edit
* Generation runs on the server with Gemini, so the API key never reaches the browser

### Collaboration

* Share a live link; anyone with it can edit in real time
* Live cursors with names, a people list and a connection status that recovers automatically
* Built-in voice chat with mute, speaking indicators and clear error states

### Everywhere

* Desktop, tablet and phone layouts with the same capabilities: touch drawing, pinch-zoom, two-finger pan, bottom sheets and a touch selection bar
* Light and dark themes
* Keyboard shortcuts for every tool and command — press `?` to see them all

## Design

The interface uses the "Ink & Signal" design system: warm ink, a single lemon
signal colour, Inter Tight, and a canvas that stays the hero.

* [Design system](docs/design-system.md)
* [UI audit and feature parity](docs/ui-redesign-audit.md)

## Tech stack

**Frontend:** React 19, Vite, Tailwind CSS v4, Konva / react-konva,
Socket.IO client, WebRTC, lucide-react

**Backend:** Node.js, Express, Socket.IO (board operations, presence and voice signalling)

## Project structure

```text
Frontend/src/
├── components/
│   ├── ui/          # design-system primitives (Button, Menu, Dialog, Sheet, Toast…)
│   ├── layout/      # workspace shell: header, top bar, status, menus, selection bar
│   ├── toolbar/     # tool catalog for the dock
│   ├── inspector/   # contextual style inspector and its model
│   ├── collab/      # share, voice and join components
│   ├── panels/      # people panel, shortcuts dialog
│   ├── ai/          # AI diagram assistant, panel and preview
│   └── canvas/      # grid, marquee, snap guides
├── design/          # canvas colour tokens
├── domain/          # pure board logic: shapes, geometry, selection, grouping, diagram layout
├── features/        # realtime, voice, export, shortcuts, theme, toasts, persistence, AI client
├── hooks/
└── pages/BoardPage.jsx

Backend/src/
├── ai/              # AI diagram route, service, validation and the Gemini provider
├── config/
├── operations/      # the operation contract
└── realtime/        # Socket.IO gateways
```

## Getting started

Clone the repository:

```bash
git clone https://github.com/unse1234/FlowBoard.git
cd FlowBoard
```

Start the realtime server (port 3001):

```bash
cd Backend
npm install
npm run dev
```

Start the app in another terminal (http://localhost:5173):

```bash
cd Frontend
npm install
npm run dev
```

### Configuration

| Variable | Where | Default |
| --- | --- | --- |
| `VITE_API_URL` | Frontend — realtime server URL | `http://localhost:3001` |
| `PORT` | Backend — listen port | `3001` |
| `CLIENT_ORIGIN` | Backend — allowed origins, comma-separated | `http://localhost:5173` |
| `GEMINI_API_KEY` | Backend — Gemini API key for AI diagrams | none (AI disabled) |
| `GEMINI_MODEL` | Backend — Gemini model | `gemini-3.6-flash` |
| `AI_RATE_LIMIT_PER_MINUTE` | Backend — AI requests per client per minute, `0` for no limit | `10` |

The backend reads `Backend/.env` on start; copy `Backend/.env.example` to create
it. AI keys belong only there: anything prefixed `VITE_` is bundled into the
browser. Behind a reverse proxy, enable Express's `trust proxy` so the AI rate
limit sees real client addresses.

## Scripts

| Frontend | |
| --- | --- |
| `npm run dev` | Start Vite |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test:realtime` | Unit tests (`node --test`) |

| Backend | |
| --- | --- |
| `npm run dev` | Start with file watching |
| `npm start` | Start |
| `npm test` | Unit tests |

## License

MIT License

## Author

Developed by Muhammad Unse.
