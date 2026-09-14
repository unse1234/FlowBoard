// @ts-check

import {
  AVAILABLE_THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  ThemeMode,
} from "./constants.js";

const getSystemTheme = () => {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return DEFAULT_THEME;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? ThemeMode.DARK
    : ThemeMode.LIGHT;
};

const isValidTheme = (value) => AVAILABLE_THEMES.includes(value);

/** Browser chrome colour per theme — the canvas colour, from index.css. */
const THEME_COLORS = {
  [ThemeMode.LIGHT]: "#f8f8f7",
  [ThemeMode.DARK]: "#151515",
};

export class ThemeManager {
  constructor({ storageKey = THEME_STORAGE_KEY } = {}) {
    this.storageKey = storageKey;
  }

  loadTheme() {
    if (
      typeof window === "undefined" ||
      typeof window.localStorage === "undefined"
    ) {
      return getSystemTheme();
    }

    const stored = window.localStorage.getItem(this.storageKey);
    if (stored && isValidTheme(stored)) {
      return stored;
    }

    return getSystemTheme();
  }

  saveTheme(theme) {
    if (
      typeof window === "undefined" ||
      typeof window.localStorage === "undefined"
    ) {
      return;
    }

    if (!isValidTheme(theme)) {
      return;
    }

    window.localStorage.setItem(this.storageKey, theme);
  }

  applyTheme(theme) {
    if (typeof document === "undefined" || !isValidTheme(theme)) {
      return;
    }

    const root = document.documentElement;
    root.classList.toggle("dark", theme === ThemeMode.DARK);

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLORS[theme]);
  }

  isDarkTheme() {
    if (typeof document === "undefined") {
      return false;
    }

    return document.documentElement.classList.contains("dark");
  }

  toggleTheme(currentTheme) {
    return currentTheme === ThemeMode.DARK ? ThemeMode.LIGHT : ThemeMode.DARK;
  }
}
