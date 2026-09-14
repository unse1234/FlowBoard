// @ts-check

import { createContext, useContext } from "react";

/**
 * Theme context lives apart from its provider so the provider file exports only
 * a component, which keeps React Fast Refresh working.
 */
export const ThemeContext = createContext(null);

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeContext must be used within a ThemeProvider.");
  }
  return context;
}
