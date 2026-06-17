// Main App component - serves as the root component for the Flow Board application
import Whiteboard from "./components/Whiteboard.jsx";

/**
 * App Component
 *
 * The main entry point for the application. This component simply renders
 * the Whiteboard component which contains all the drawing and collaboration features.
 *
 * @returns {JSX.Element} The Whiteboard component
 */
function App() {
  return <Whiteboard />;
}

export default App;
