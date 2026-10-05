"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useActiveNumber } from "./WhatsAppNumberProvider";
import { Spinner } from "./ui/spinner";
import type { ConfiguredWhatsAppNumber } from "@/types";

// Last two digits of the number, else the label's initials — the avatar in each
// menu row.
function shortBadge(n: ConfiguredWhatsAppNumber): string {
  const digits = (n.displayPhoneNumber || "").replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(-2);
  return n.label.slice(0, 2).toUpperCase();
}

// The account's name from WhatsApp Manager, or — if Meta couldn't be reached —
// something recognisable built from its id, never a blank heading.
function accountLabel(n: ConfiguredWhatsAppNumber): string {
  return n.accountName || `WhatsApp account ···${n.wabaId.slice(-4)}`;
}

interface AccountGroup {
  wabaId: string;
  name: string;
  numbers: ConfiguredWhatsAppNumber[];
}

/**
 * The active WhatsApp number, top right. Switching re-scopes the whole app —
 * inbox, templates, campaigns and stats.
 *
 * Numbers are grouped under the WhatsApp account (WABA) they belong to, because
 * that is the boundary that actually matters: templates are approved per
 * account, so two numbers on different accounts have different template
 * libraries even though they serve the same business.
 *
 * With a single number this renders as a plain label rather than a dropdown —
 * a menu with one entry that changes nothing is worse than no menu — but it
 * still shows, so it is always visible which line you are sending from.
 */
export function NumberSwitcher() {
  const { numbers, activeNumber, activeNumberId, switchNumber, switching } = useActiveNumber();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Grouped in first-seen order. The server returns the default number first,
  // so the main line's account is always the top group, and the order is stable
  // between page loads.
  const groups = useMemo<AccountGroup[]>(() => {
    const byWaba = new Map<string, AccountGroup>();
    for (const n of numbers) {
      let g = byWaba.get(n.wabaId);
      if (!g) {
        g = { wabaId: n.wabaId, name: accountLabel(n), numbers: [] };
        byWaba.set(n.wabaId, g);
      }
      g.numbers.push(n);
    }
    return [...byWaba.values()];
  }, [numbers]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!activeNumber) return null;

  const multipleAccounts = groups.length > 1;
  const interactive = numbers.length > 1;

  const triggerBody = (
    <>
      {/* The status dot becomes a spinner while the app re-scopes to the new
          number, so a switch is visibly "in progress" rather than silent. */}
      {switching ? (
        <Spinner size="xs" label="Switching number" />
      ) : (
        <span className="w-2 h-2 rounded-full bg-[#3B694C] shrink-0" aria-hidden />
      )}
      <span className="flex flex-col items-start min-w-0 leading-tight">
        <span className="text-[13px] font-medium text-gray-800 truncate max-w-[240px]">
          {activeNumber.label}
        </span>
        {/* The phone number is what actually tells two lines apart, so it gets
            the second line. The account name is left to the menu's group
            headings — on the trigger it often just repeats the label. */}
        <span className="text-[11px] text-gray-400 truncate max-w-[240px]">
          {activeNumber.displayPhoneNumber || accountLabel(activeNumber)}
        </span>
      </span>
    </>
  );

  if (!interactive) {
    return (
      <div
        className="flex items-center gap-2 h-9 px-3 rounded-lg text-gray-600"
        title={`Sending as ${activeNumber.label} · ${accountLabel(activeNumber)}`}
      >
        {triggerBody}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Sending as ${activeNumber.label} · ${accountLabel(activeNumber)}`}
        className={`flex items-center gap-2 h-9 pl-3 pr-2 rounded-lg border transition-colors disabled:cursor-wait ${
          open ? "border-[#3B694C]/40 bg-[#EEF6F1]" : "border-gray-200 hover:bg-gray-50"
        }`}
      >
        {triggerBody}
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          {/* Click-away layer, matching the other hand-rolled menus in this app. */}
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label="WhatsApp number"
            className="absolute right-0 top-11 z-[61] w-[320px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white border border-gray-100 rounded-xl shadow-lg py-1.5"
          >
            {groups.map((g, gi) => (
              <div key={g.wabaId} className={gi > 0 ? "border-t border-gray-100 mt-1.5 pt-1.5" : ""}>
                <p
                  className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold truncate"
                  title={`WhatsApp account ${g.wabaId}`}
                >
                  {multipleAccounts ? g.name : "Sending as"}
                </p>
                {g.numbers.map((n) => {
                  const isActive = String(n.id) === activeNumberId;
                  return (
                    <button
                      key={n.id}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        setOpen(false);
                        switchNumber(n.id);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                        isActive ? "bg-[#EEF6F1]" : "hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold ${
                          isActive ? "bg-[#3B694C] text-white" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {shortBadge(n)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[13.5px] truncate ${
                            isActive ? "text-[#3B694C] font-medium" : "text-gray-700"
                          }`}
                        >
                          {n.label}
                        </span>
                        {n.displayPhoneNumber && (
                          <span className="block text-[11.5px] text-gray-400 truncate">{n.displayPhoneNumber}</span>
                        )}
                      </span>
                      {/* "Default" is the number a request falls back to, not the
                          one you are on — kept visually distinct from the tick. */}
                      {n.isDefault && !isActive && (
                        <span className="text-[10px] text-gray-400 shrink-0">Default</span>
                      )}
                      {isActive && <Check className="w-4 h-4 text-[#3B694C] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="border-t border-gray-100 mt-1.5 pt-1.5 px-3 pb-0.5">
              <p className="text-[11px] text-gray-400 leading-snug">
                Switching changes the inbox, templates, campaigns and stats.
                {multipleAccounts && " Templates are approved separately for each account."}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
