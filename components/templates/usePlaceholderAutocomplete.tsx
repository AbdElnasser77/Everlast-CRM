"use client";

// Typing "{{" in a template field opens a list of the supported placeholders.
// Arrow keys move, Enter/Tab inserts, Escape closes; clicking works too.
// Keep the list in sync with the API's RESOLVERS in utils/templateVars.js —
// PERSONALIZE_VARS is the frontend copy of it.

import { useState, type RefObject } from "react";
import { PERSONALIZE_VARS, PLACEHOLDER_RE } from "./shared";

type Field = HTMLInputElement | HTMLTextAreaElement;

// "{{" plus whatever has been typed of the name, right before the caret.
const OPEN_RE = /\{\{\s*([a-z_]*)$/i;

export function usePlaceholderAutocomplete<T extends Field>(
  ref: RefObject<T | null>,
  value: string,
  setValue: (v: string) => void,
  { maxVars }: { maxVars?: number } = {},
) {
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const q = (query ?? "").toLowerCase();
  const matches =
    query === null
      ? []
      : PERSONALIZE_VARS.filter((v) => v.key.includes(q) || v.label.toLowerCase().includes(q));

  // Complete placeholders already in the field, not counting the one being typed.
  const used = (value.match(PLACEHOLDER_RE) || []).length;
  const atLimit = maxVars !== undefined && used >= maxVars;

  function detect(el: Field) {
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = OPEN_RE.exec(before);
    setQuery(m ? m[1] : null);
    setActive(0);
  }

  function pick(key: string) {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart ?? value.length;
    const before = value.slice(0, pos).replace(OPEN_RE, `{{${key}}}`);
    // Swallow closing braces the user already typed, so we never leave "}}}}".
    const after = value.slice(pos).replace(/^\s*\}{1,2}/, "");
    setValue(before + after);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  }

  const open = query !== null && (atLimit || matches.length > 0);

  const fieldProps = {
    onChange: (e: React.ChangeEvent<T>) => {
      setValue(e.target.value);
      detect(e.target);
    },
    onClick: (e: React.MouseEvent<T>) => detect(e.currentTarget),
    onKeyUp: (e: React.KeyboardEvent<T>) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) detect(e.currentTarget);
    },
    onKeyDown: (e: React.KeyboardEvent<T>) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery(null);
        return;
      }
      if (atLimit) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % matches.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + matches.length) % matches.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[active].key);
      }
    },
    onBlur: () => setQuery(null),
  };

  const menu = open ? (
    <div className="absolute left-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
      {atLimit ? (
        <p className="px-3 py-2 text-[12px] text-gray-500">
          Only {maxVars} placeholder{maxVars === 1 ? "" : "s"} allowed here.
        </p>
      ) : (
        matches.map((v, i) => (
          <button
            key={v.key}
            type="button"
            // mousedown, not click: fires before the field's blur closes the menu.
            onMouseDown={(e) => {
              e.preventDefault();
              pick(v.key);
            }}
            onMouseEnter={() => setActive(i)}
            className={`w-full flex items-center justify-between gap-2 text-left px-3 py-1.5 text-[12px] cursor-pointer ${
              i === active ? "bg-[#EEF6F1] text-[#3B694C]" : "text-gray-700"
            }`}
          >
            <span>{v.label}</span>
            <span className="font-mono text-[11px] text-gray-400">{`{{${v.key}}}`}</span>
          </button>
        ))
      )}
    </div>
  ) : null;

  return { fieldProps, menu };
}
