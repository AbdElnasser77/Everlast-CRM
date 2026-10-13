// Shared by the server layout (the pre-paint script) and the client
// ThemeProvider. Deliberately NOT a "use client" module: a server component
// importing a plain value from a client module gets a reference, not the value.

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "everlast-theme";
/** Used when nothing is stored yet. Light, because that is what the app always was. */
export const DEFAULT_THEME: Theme = "light";
export const THEME_MEDIA = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> before first paint (see app/layout.tsx): reads the saved
 * choice and puts `dark` + color-scheme on <html>. Self-contained ES5.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});}catch(e){}if(t!=="light"&&t!=="dark"&&t!=="system")t=${JSON.stringify(DEFAULT_THEME)};var d=t==="dark"||(t==="system"&&window.matchMedia(${JSON.stringify(THEME_MEDIA)}).matches);var r=document.documentElement;if(d)r.classList.add("dark");else r.classList.remove("dark");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
