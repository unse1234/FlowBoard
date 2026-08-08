# FlowBoard

A modern collaborative whiteboard application inspired by Excalidraw, built with React and Konva. FlowBoard enables users to create diagrams, sketches, wireframes, and visual workflows through an intuitive drag-and-drop interface.

## Features

### Drawing Tools

* Rectangle
* Ellipse
* Diamond
* Line
* Arrow
* Freehand Drawing (Pen)

### Editing & Manipulation

* Select and move shapes
* Resize shapes
* Multi-shape support
* Shape customization
* Stroke width controls
* Color customization
* Dashed and solid strokes

### Text & Media

* Add editable text anywhere on the canvas
* In-place text editing
* Upload and place images
* Resize and reposition images

### Productivity Features

* Undo / Redo
* Export canvas as image
* Local storage persistence
* Responsive user interface
* Professional toolbar with icons

### Planned Features

* Authentication
* Real-time collaboration
* Shared workspaces
* Live cursors and presence indicators

---

## Tech Stack

### Frontend

* React
* Vite
* React Konva
* Konva
* Tailwind CSS

### State Management

* React Hooks
* Context API (if applicable)

### Development Tools

* Git
* GitHub
* ESLint

---

## Project Structure

```text
src/
├── components/
│   ├── Toolbar/
│   ├── Canvas/
│   ├── PropertiesPanel/
│   └── Shapes/
├── constants/
├── hooks/
├── utils/
├── assets/
├── styles/
└── App.jsx
```

---

## Installation

Clone the repository:

```bash
git clone https://github.com/unse1234/Flowboard.git
```

Navigate to the project directory:

```bash
cd flowboard
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

---

## Usage

1. Select a drawing tool from the toolbar.
2. Draw directly on the canvas.
3. Select shapes to move, resize, or customize them.
4. Add text and images to enhance diagrams.
5. Use Undo/Redo to manage changes.
6. Export the canvas as an image when finished.

---

## Architecture Highlights

* Modular component-based architecture
* Reusable shape rendering system
* Centralized tool configuration
* Utility-driven shape calculations
* Scalable state management approach
* Separation of rendering, business logic, and styling concerns

---

## Future Improvements

* User authentication
* Real-time collaboration
* Cloud storage
* Room-based sharing
* Version history
* Keyboard shortcuts
* Multi-selection support
* Copy/Paste support

---

## Screenshots



---

## License

MIT License

---

## Author

Developed by Muhammad Unse.
