import { useEffect, useCallback } from "react";
import { usePersistentState } from "./usePersistentState";

// ═══════════════════════════════════════════════════════════════
// useTheme
// Persists the user's light/dark choice. LIGHT is the default and the
// OS preference is deliberately ignored — dark is an explicit opt-in.
// The inline script in index.html applies the stored theme before first
// paint (no flash); this hook keeps it in sync afterwards.
//
// Sets BOTH the data-theme attribute (for CSS token overrides in
// index.css) AND the .dark / .light class (for Tailwind dark: /
// light: variants defined via @custom-variant). Keeping these two
// in sync is what makes theme switching instant and flash-free.
// ═══════════════════════════════════════════════════════════════
const THEME_KEY = "vellum.theme";
const THEME_EVENT = "vellum:theme"; // lets every useTheme() instance (sidebar toggle, profile page) follow a change

// Keeps the mobile browser chrome tint in step with a manual theme switch.
const THEME_COLOR = { light: "#F7F6F2", dark: "#0A0D1B" };
const syncThemeColor = (theme) => {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute("content", THEME_COLOR[theme]);
    m.removeAttribute("media");
  });
};

const applyTheme = (t) => {
  const root = document.documentElement;
  root.setAttribute("data-theme", t);
  root.classList.toggle("dark", t === "dark");
  root.classList.toggle("light", t === "light");
  syncThemeColor(t);
};

export const useTheme = () => {
  const [theme, setTheme] = usePersistentState(
    THEME_KEY,
    "light"
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Another instance changed the theme: follow the DOM (applyTheme has already run there).
  useEffect(() => {
    const follow = () =>
      setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    window.addEventListener(THEME_EVENT, follow);
    return () => window.removeEventListener(THEME_EVENT, follow);
  }, [setTheme]);

  // Cross-fades the whole UI when the browser supports View Transitions
  // (skipped for reduced-motion users); otherwise switches instantly.
  const toggleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    const commit = () => {
      applyTheme(next); // DOM must change synchronously inside the transition callback
      setTheme(next);
      window.dispatchEvent(new Event(THEME_EVENT));
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduce) document.startViewTransition(commit);
    else commit();
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
};
