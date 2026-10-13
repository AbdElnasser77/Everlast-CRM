"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_THEME, THEME_MEDIA as MEDIA, THEME_STORAGE_KEY, type ResolvedTheme, type Theme } from "@/lib/theme";

export type { Theme, ResolvedTheme };

// ── Light / dark / system theme ─────────────────────────────────────────────
//
// The choice lives in localStorage and is applied as a `dark` class (plus
// `color-scheme`) on <html>. The very first application happens in the inline
// script THEME_INIT_SCRIPT (lib/theme.ts), which app/layout.tsx puts in <head>
// so the page never paints in the wrong theme. After that this module owns it:
// setTheme(), an OS-level change while on "system", and a change in another tab.
//
// Colours themselves are all CSS — see the `.dark` block in app/globals.css,
// which re-points Tailwind's palette variables, so components need few changes.

const CHANGE_EVENT = "everlast-theme-change";
function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}

function readStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(v)) return v;
  } catch {
    /* storage blocked (private mode, policy) — fall back to the default */
  }
  return DEFAULT_THEME;
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(MEDIA).matches;
  } catch {
    return false;
  }
}

function resolve(theme: Theme): ResolvedTheme {
  return theme === "dark" || (theme === "system" && systemPrefersDark()) ? "dark" : "light";
}

/**
 * Puts the theme on <html>. Transitions are suspended for one frame so the
 * hundreds of `transition-colors` elements don't all fade at once.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved = resolve(theme);
  const style = document.createElement("style");
  style.appendChild(document.createTextNode("*,*::before,*::after{transition:none!important}"));
  document.head.appendChild(style);
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  // Force a style flush, then drop the override on the next frame.
  void window.getComputedStyle(root).colorScheme;
  requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
}

// ── External store: "<theme>|<resolved>", or "" before hydration ──

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(MEDIA);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY || e.key === null) onChange();
  };
  mq.addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): string {
  const theme = readStoredTheme();
  return `${theme}|${resolve(theme)}`;
}

function getServerSnapshot(): string {
  return "";
}

interface ThemeContextValue {
  /** The user's choice; null until the client has read it (first render / SSR). */
  theme: Theme | null;
  /** What is actually showing; null until known. */
  resolvedTheme: ResolvedTheme | null;
  setTheme: (theme: Theme) => void;
  /** Flip between light and dark (leaves "system"). */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [themePart, resolvedPart] = snapshot ? snapshot.split("|") : [null, null];
  const theme = isTheme(themePart) ? themePart : null;
  const resolvedTheme = resolvedPart === "dark" || resolvedPart === "light" ? resolvedPart : null;

  // Keep <html> in step with the OS (while on "system") and with other tabs.
  // The initial state was already applied by the inline script.
  useEffect(() => {
    const sync = () => applyTheme(readStoredTheme());
    const mq = window.matchMedia(MEDIA);
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY || e.key === null) sync();
    };
    const onMedia = () => {
      if (readStoredTheme() === "system") sync();
    };
    mq.addEventListener("change", onMedia);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onMedia);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* not persisted, but still applied for this page */
    }
    applyTheme(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolve(readStoredTheme()) === "dark" ? "light" : "dark");
  }, [setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, toggle }),
    [theme, resolvedTheme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
