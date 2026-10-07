"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, CornerUpLeft, Trash2 } from "lucide-react";

// WhatsApp Web's message menu: hovering a message shows a small ⌄ beside it;
// clicking opens Reply / Copy / Delete. Replaces double-click-to-reply, so a
// double-click selects text the way it does everywhere else.
export function MessageMenu({
  onReply,
  copyText,
  onDelete,
  align = "right",
}: {
  onReply: () => void;
  /** Text to copy; omit for media-only messages. */
  copyText?: string | null;
  /** Only for messages the current user may delete. */
  onDelete?: () => void;
  /** Which side of the button the menu opens toward (the bubble's side). */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-left hover:bg-gray-50";

  return (
    <div ref={ref} className="relative self-center shrink-0">
      <button
        type="button"
        title="Message options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setCopied(false); }}
        className={`w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all cursor-pointer ${
          open ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100 focus:opacity-100"
        }`}
      >
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-30 bottom-full mb-1 w-40 bg-white border border-gray-100 rounded-xl shadow-lg py-1 ${align === "left" ? "left-0" : "right-0"}`}
        >
          <button type="button" role="menuitem" onClick={() => { onReply(); setOpen(false); }} className={`${item} text-gray-700`}>
            <CornerUpLeft className="w-4 h-4 text-gray-400" /> Reply
          </button>
          {copyText ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                navigator.clipboard.writeText(copyText).then(() => {
                  setCopied(true);
                  setTimeout(() => setOpen(false), 600);
                }).catch(() => setOpen(false));
              }}
              className={`${item} text-gray-700`}
            >
              <Copy className="w-4 h-4 text-gray-400" /> {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
          {onDelete && (
            <button type="button" role="menuitem" onClick={() => { onDelete(); setOpen(false); }} className={`${item} text-red-600`}>
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
