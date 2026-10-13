"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Check, ChevronDown, Hourglass, MessageCircle } from "lucide-react";
import { useActiveNumber } from "./WhatsAppNumberProvider";
import { useCurrentUser } from "./CurrentUserProvider";
import { Spinner } from "./ui/spinner";
import { apiGetLineCounts } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { ConfiguredWhatsAppNumber } from "@/types";

// ── What's waiting on each line ──────────────────────────────────────────────
//
// So another line is never invisible: unread chats, patients waiting (< 24h)
// and new booking requests per line, from /conversations/line-counts (not
// number-scoped). One shared poller however many switchers are mounted (the
// layout renders a mobile and a desktop one): every 30s, and soon after any
// event that can change a count. Message / conversation events only arrive
// for the active line; hand-offs and booking alerts arrive for every line,
// and the 30s poll covers the rest.

type LineCount = { id: number; label: string; unreadChats: number; waiting: number; newBookingRequests: number };

const POLL_MS = 30_000;
const DEBOUNCE_MS = 1_500;
const COUNT_EVENTS = [
  "message.new", "message.created", "conversation.updated",
  "booking_request.created", "booking_request.updated", "booking_request.alert", "flow.handoff",
];

const lineCountStore = {
  data: null as LineCount[] | null,
  subs: new Set<(d: LineCount[]) => void>(),
  poll: null as ReturnType<typeof setInterval> | null,
  debounce: null as ReturnType<typeof setTimeout> | null,
};

function fetchLineCounts() {
  apiGetLineCounts()
    .then((res) => {
      lineCountStore.data = res.data;
      lineCountStore.subs.forEach((fn) => fn(res.data));
    })
    .catch(() => {}); // a missed poll just waits for the next one
}

function refreshLineCountsSoon() {
  if (lineCountStore.debounce) clearTimeout(lineCountStore.debounce);
  lineCountStore.debounce = setTimeout(() => {
    lineCountStore.debounce = null;
    fetchLineCounts();
  }, DEBOUNCE_MS);
}

function subscribeLineCounts(fn: (d: LineCount[]) => void): () => void {
  lineCountStore.subs.add(fn);
  if (lineCountStore.subs.size === 1) {
    fetchLineCounts();
    lineCountStore.poll = setInterval(fetchLineCounts, POLL_MS);
    const socket = getSocket();
    COUNT_EVENTS.forEach((e) => socket.on(e, refreshLineCountsSoon));
  } else if (lineCountStore.data) {
    fn(lineCountStore.data);
  }
  return () => {
    lineCountStore.subs.delete(fn);
    if (lineCountStore.subs.size > 0) return;
    if (lineCountStore.poll) clearInterval(lineCountStore.poll);
    if (lineCountStore.debounce) clearTimeout(lineCountStore.debounce);
    lineCountStore.poll = null;
    lineCountStore.debounce = null;
    const socket = getSocket();
    COUNT_EVENTS.forEach((e) => socket.off(e, refreshLineCountsSoon));
  };
}

/** Counts per line id; empty until loaded, or when disabled. */
function useLineCounts(enabled: boolean, activeNumberId: string | null): Map<number, LineCount> {
  const [data, setData] = useState<LineCount[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return subscribeLineCounts(setData);
  }, [enabled]);
  // Reading a chat on the new line changes its counts — refresh after a switch.
  useEffect(() => {
    if (enabled && activeNumberId) refreshLineCountsSoon();
  }, [enabled, activeNumberId]);
  return useMemo(() => new Map((enabled && data ? data : []).map((l) => [l.id, l])), [enabled, data]);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function countsSummary(c: Pick<LineCount, "unreadChats" | "waiting" | "newBookingRequests">): string {
  const parts: string[] = [];
  if (c.unreadChats) parts.push(plural(c.unreadChats, "unread chat", "unread chats"));
  if (c.waiting) parts.push(`${c.waiting} waiting`);
  if (c.newBookingRequests) parts.push(plural(c.newBookingRequests, "new booking request", "new booking requests"));
  return parts.join(" · ");
}

/** The small chips on a menu row: unread chats, waiting, new booking requests. */
function LineCountChips({ c }: { c: LineCount | undefined }) {
  if (!c || (!c.unreadChats && !c.waiting && !c.newBookingRequests)) return null;
  const chip = "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[10.5px] font-semibold tabular-nums";
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1" title={countsSummary(c)}>
      {c.unreadChats > 0 && (
        <span className={`${chip} bg-brand-100 text-brand-fg border-brand/30`}>
          <MessageCircle className="w-3 h-3" aria-hidden /> {c.unreadChats}
          <span className="sr-only"> unread chats</span>
        </span>
      )}
      {c.waiting > 0 && (
        <span className={`${chip} bg-amber-50 text-amber-700 border-amber-200`}>
          <Hourglass className="w-3 h-3" aria-hidden /> {c.waiting}
          <span className="sr-only"> waiting</span>
        </span>
      )}
      {c.newBookingRequests > 0 && (
        <span className={`${chip} bg-sky-50 text-sky-700 border-sky-200`}>
          <CalendarPlus className="w-3 h-3" aria-hidden /> {c.newBookingRequests}
          <span className="sr-only"> new booking requests</span>
        </span>
      )}
    </span>
  );
}

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
  const { can } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // One line: nothing to compare against, so no polling and no badges.
  const counts = useLineCounts(numbers.length > 1 && can("conversation:read"), activeNumberId);
  // Everything waiting on the lines you are NOT on (and can switch to).
  const others = useMemo(() => {
    const sum = { unreadChats: 0, waiting: 0, newBookingRequests: 0 };
    for (const n of numbers) {
      if (String(n.id) === activeNumberId) continue;
      const c = counts.get(n.id);
      if (!c) continue;
      sum.unreadChats += c.unreadChats;
      sum.waiting += c.waiting;
      sum.newBookingRequests += c.newBookingRequests;
    }
    return sum;
  }, [counts, numbers, activeNumberId]);
  // The badge number: unread chats + new requests. Waiting patients usually
  // overlap unread chats, so they only light the dot when nothing else does.
  const othersCount = others.unreadChats + others.newBookingRequests;
  const othersAttention = othersCount > 0 || others.waiting > 0;

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
        <span className="w-2 h-2 rounded-full bg-brand shrink-0" aria-hidden />
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
        title={`Sending as ${activeNumber.label} · ${accountLabel(activeNumber)}${
          othersAttention ? `\nOther lines: ${countsSummary(others)}` : ""
        }`}
        className={`relative flex items-center gap-2 h-9 pl-3 pr-2 rounded-lg border transition-colors disabled:cursor-wait ${
          open ? "border-brand/40 bg-brand-100" : "border-gray-200 hover:bg-gray-50"
        }`}
      >
        {triggerBody}
        {/* Something is waiting on another line: say so without opening the menu. */}
        {othersAttention && (
          othersCount > 0 ? (
            <span className="shrink-0 inline-flex items-center rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-px text-[11px] font-semibold tabular-nums whitespace-nowrap">
              +{othersCount}<span className="hidden xl:inline">&nbsp;on other lines</span>
              <span className="sr-only xl:hidden"> on other lines</span>
            </span>
          ) : (
            <span className="shrink-0 w-2 h-2 rounded-full bg-amber-500" aria-label="Patients waiting on other lines" />
          )
        )}
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
                        isActive ? "bg-brand-100" : "hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold ${
                          isActive ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {shortBadge(n)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[13.5px] truncate ${
                            isActive ? "text-brand-fg font-medium" : "text-gray-700"
                          }`}
                        >
                          {n.label}
                        </span>
                        {n.displayPhoneNumber && (
                          <span className="block text-[11.5px] text-gray-400 truncate">{n.displayPhoneNumber}</span>
                        )}
                        <LineCountChips c={counts.get(n.id)} />
                      </span>
                      {/* "Default" is the number a request falls back to, not the
                          one you are on — kept visually distinct from the tick. */}
                      {n.isDefault && !isActive && (
                        <span className="text-[10px] text-gray-400 shrink-0">Default</span>
                      )}
                      {isActive && <Check className="w-4 h-4 text-brand-fg shrink-0" />}
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
