import { describe, expect, it, beforeEach } from "vitest";
import { getStoredTheme, resolveTheme, applyTheme, type Theme } from "@/lib/theme";

describe("Theme Management", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("defaults to dark theme when nothing in localStorage", () => {
    expect(getStoredTheme()).toBe("dark");
  });

  it("resolves dark and light theme appropriately", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
  });

  it("applies dark class and styles to documentElement", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("applies light class and removes dark class for light theme", () => {
    applyTheme("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
