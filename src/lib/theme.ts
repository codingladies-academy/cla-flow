"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem("cla-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("cla-theme", theme);
    } catch {}
    window.dispatchEvent(new Event("cla-theme-change"));
  }
}

export function useTheme() {
  const [theme, setLocalTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-theme") as Theme) || getInitialTheme();
    setLocalTheme(current);

    const onThemeChange = () => {
      const next =
        (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
      setLocalTheme(next);
    };

    window.addEventListener("cla-theme-change", onThemeChange);
    return () => window.removeEventListener("cla-theme-change", onThemeChange);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  return { theme, toggle, setTheme };
}
