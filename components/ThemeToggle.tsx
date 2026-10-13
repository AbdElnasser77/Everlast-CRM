"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "./ThemeProvider";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Light / Dark / System as a compact three-icon segmented control. Used in the
 * dashboard top bar, the mobile drawer and on the login page. `withLabels`
 * shows the words too and fills the width (for the mobile drawer).
 */
export function ThemeSwitcher({ withLabels = false, className = "" }: { withLabels?: boolean; className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`${withLabels ? "flex w-full" : "inline-flex"} items-center gap-0.5 p-0.5 rounded-lg bg-gray-100 border border-gray-200/70 ${className}`}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const on = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            title={value === "system" ? "System — follow this device" : `${label} theme`}
            onClick={() => setTheme(value)}
            className={`flex items-center justify-center gap-1.5 h-7 rounded-md transition-colors cursor-pointer ${
              withLabels ? "flex-1 px-2.5 text-[12.5px] font-medium" : "w-7"
            } ${on ? "bg-white dark:bg-gray-300 text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {withLabels ? <span>{label}</span> : <span className="sr-only">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One button that flips between light and dark (a choice of "system" becomes
 * an explicit light/dark). For tight spots: the mobile top bar and the live
 * wall. Pass className to restyle it; the icon shows what you'd switch TO.
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolvedTheme, toggle } = useTheme();
  const dark = resolvedTheme === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={
        className ??
        "p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
      }
    >
      {resolvedTheme === null ? (
        <span className="block w-[18px] h-[18px]" aria-hidden />
      ) : dark ? (
        <Sun className="w-[18px] h-[18px]" />
      ) : (
        <Moon className="w-[18px] h-[18px]" />
      )}
    </button>
  );
}
