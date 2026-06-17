/**
 * Application Entry Point
 *
 * Initializes React and mounts the main App component to the DOM.
 * StrictMode helps detect potential issues during development.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css"; // Global styles (Tailwind CSS imports)
import App from "./App.jsx"; // Main application component

// Mount the React application to the element with id="root" in HTML
createRoot(document.getElementById("root")).render(
  // StrictMode: Highlights potential issues in the app (dev only)
  <StrictMode>
    <App />
  </StrictMode>,
);
