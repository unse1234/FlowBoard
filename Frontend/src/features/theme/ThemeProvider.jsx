// @ts-check

import { ThemeContext } from "./themeContext.js";
import { useTheme } from "./useTheme.js";

export function ThemeProvider({ children }) {
  const themeState = useTheme();
  return (
    <ThemeContext.Provider value={themeState}>{children}</ThemeContext.Provider>
  );
}
