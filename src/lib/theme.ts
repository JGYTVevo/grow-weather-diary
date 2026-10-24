import { useState, useEffect, useCallback } from "react";

export type Theme = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "canopy-theme-v1";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return "dark";
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;

  const resolved = resolveTheme(theme);
  const root = document.documentElement;

  if (resolved === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
    root.style.colorScheme = "light";
  }

  // Sync mobile status bar theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", resolved === "dark" ? "#142618" : "#f7fdf9");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    resolveTheme(getStoredTheme()),
  );

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore
    }
    applyTheme(nextTheme);
    setResolvedTheme(resolveTheme(nextTheme));
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  // Initial mount application & system listener
  useEffect(() => {
    const current = getStoredTheme();
    applyTheme(current);
    setResolvedTheme(resolveTheme(current));

    if (current === "system" && typeof window !== "undefined") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        applyTheme("system");
        setResolvedTheme(resolveTheme("system"));
      };
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }
  }, [theme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    isDark: resolvedTheme === "dark",
  };
}
