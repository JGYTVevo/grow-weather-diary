import React from "react";
import { useTheme } from "@/lib/theme";
import { Sun, Moon, Monitor } from "lucide-react";

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
}

export function ThemeToggle({ showLabel = false, className = "" }: ThemeToggleProps) {
  const { theme, resolvedTheme, toggleTheme, setTheme } = useTheme();

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
        title={`Current: ${resolvedTheme === "dark" ? "Dark" : "Light"} mode. Click to switch.`}
        className="relative inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border bg-secondary/80 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary transition active:scale-95 shadow-xs"
      >
        <span className="relative flex h-4 w-4 items-center justify-center">
          {resolvedTheme === "dark" ? (
            <Moon className="h-4 w-4 text-primary transition-transform duration-300 rotate-0 scale-100" />
          ) : (
            <Sun className="h-4 w-4 text-amber-500 transition-transform duration-300 rotate-0 scale-100" />
          )}
        </span>

        {showLabel && (
          <span className="hidden sm:inline capitalize font-medium text-xs">
            {resolvedTheme === "dark" ? "Dark" : "Light"}
          </span>
        )}
      </button>

      {/* Quick 3-mode selector (optional in modal or header) */}
    </div>
  );
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-secondary/40 p-1">
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
          theme === "light"
            ? "bg-card text-foreground shadow-xs font-semibold"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sun className="h-3.5 w-3.5 text-amber-500" />
        <span>Light</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
          theme === "dark"
            ? "bg-card text-foreground shadow-xs font-semibold"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Moon className="h-3.5 w-3.5 text-primary" />
        <span>Dark</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme("system")}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
          theme === "system"
            ? "bg-card text-foreground shadow-xs font-semibold"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
        <span>System</span>
      </button>
    </div>
  );
}
