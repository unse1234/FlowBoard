// @ts-check

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { ThemeManager } from "./ThemeManager.js";
import { DEFAULT_THEME, ThemeMode } from "./constants.js";

export function useTheme() {
  const manager = useMemo(() => new ThemeManager(), []);
  const [theme, setThemeState] = useState(
    () => manager.loadTheme() ?? DEFAULT_THEME,
  );

  useLayoutEffect(() => {
    manager.applyTheme(theme);
  }, [manager, theme]);

  useEffect(() => {
    if (theme !== manager.loadTheme()) {
      manager.saveTheme(theme);
    }
  }, [manager, theme]);

  const setTheme = useCallback(
    (nextTheme) => {
      if (nextTheme !== ThemeMode.LIGHT && nextTheme !== ThemeMode.DARK) {
        return;
      }

      manager.applyTheme(nextTheme);
      manager.saveTheme(nextTheme);
      setThemeState(nextTheme);
    },
    [manager],
  );

  const toggleTheme = useCallback(() => {
    const nextTheme = manager.toggleTheme(theme);
    setTheme(nextTheme);
  }, [manager, setTheme, theme]);

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme === ThemeMode.DARK,
    isLight: theme === ThemeMode.LIGHT,
  };
}
