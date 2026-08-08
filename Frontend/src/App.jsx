import { useThemeContext } from "./features/theme/ThemeProvider.jsx";
import BoardPage from "./pages/BoardPage.jsx";

/**
 * App Component - Main application entry point
 */
function App() {
  const { theme } = useThemeContext();

  return <BoardPage theme={theme} />;
}

export default App;
