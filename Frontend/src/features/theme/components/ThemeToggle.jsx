// @ts-check

import { useThemeContext } from "../ThemeProvider.jsx";

export default function ThemeToggle() {
  const { theme, toggleTheme, isDark } = useThemeContext();

  return (
    <button
      type="button"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Current theme: ${theme}`}
      onClick={toggleTheme}
      className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-black dark:text-white dark:hover:border-slate-500 dark:hover:bg-slate-800"
    >
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
