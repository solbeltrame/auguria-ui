import type { AccentColor } from "./stores/uiSlice";
import "./auguria-theme.css";

type AccentPalette = {
  swatch: string;
  light: string;
  dark: string;
};

export const ACCENT_PALETTES: Record<AccentColor, AccentPalette> = {
  terracotta: {
    swatch: "#c55a3b",
    light: "#c55a3b",
    dark: "#e07854",
  },
  purple: {
    swatch: "#7c3aed",
    light: "#7c3aed",
    dark: "#8b5cf6",
  },
  green: {
    swatch: "#16803c",
    light: "#16803c",
    dark: "#22a052",
  },
  blue: {
    swatch: "#2563eb",
    light: "#2563eb",
    dark: "#3b82f6",
  },
  red: {
    swatch: "#dc2626",
    light: "#dc2626",
    dark: "#ef4444",
  },
};

export function applyAccentColor(accentColor: AccentColor, isDark: boolean) {
  const root = document.documentElement;
  const color = ACCENT_PALETTES[accentColor][isDark ? "dark" : "light"];

  root.style.setProperty("--primary", color);
  root.style.setProperty("--ring", color);
  root.style.setProperty("--sidebar-primary", color);
  root.style.setProperty("--sidebar-ring", color);
}
