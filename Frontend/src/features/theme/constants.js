// @ts-check

export const THEME_STORAGE_KEY = "flowboard_theme";

export const ThemeMode = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
});

export const DEFAULT_THEME = ThemeMode.LIGHT;

export const AVAILABLE_THEMES = Object.freeze(Object.values(ThemeMode));
