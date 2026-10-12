/**
 * Booking requests — "this patient wants to book" — said the same way on the
 * Bookings page, the chat banner and the contact panel.
 */

import type { BookingRequest, BookingRequestStatus, NotBookedReason } from "@/types";
import { OUTCOME_CHIP, fmtElapsed, toDateInput, waitTone } from "@/lib/chatOutcome";

export const REQUEST_STATUS_LABEL: Record<BookingRequestStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  BOOKED: "Booked",
  NOT_BOOKED: "Not booked",
};

export const REQUEST_STATUS_CHIP: Record<BookingRequestStatus, string> = {
  NEW: "bg-sky-50 text-sky-700 border-sky-200",
  IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
  BOOKED: OUTCOME_CHIP.BOOKED,
  NOT_BOOKED: "bg-gray-100 text-gray-600 border-gray-200",
};

export const NOT_BOOKED_REASONS: { value: NotBookedReason; label: string }[] = [
  { value: "NO_ANSWER", label: "No answer" },
  { value: "NOT_INTERESTED", label: "Not interested" },
  { value: "PRICE", label: "Price" },
  { value: "CALL_BACK_LATER", label: "Will call back later" },
  { value: "BOOKED_ELSEWHERE", label: "Booked elsewhere" },
  { value: "OTHER", label: "Other" },
];

export const notBookedLabel = (r: NotBookedReason | null | undefined) =>
  NOT_BOOKED_REASONS.find((x) => x.value === r)?.label ?? "Not booked";

export const isOpenRequest = (r: Pick<BookingRequest, "status">) => r.status === "NEW" || r.status === "IN_PROGRESS";

/** snake_case / camelCase → "Preferred date". */
export function prettyKey(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.replace(/^\w/, (c) => c.toUpperCase());
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A collected answer as people read it ("2026-10-15" → "Wed 15 Oct 2026"). */
export function fmtRequestedValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map(fmtRequestedValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const named = o.title ?? o.label ?? o.name ?? o.value;
    return named != null ? fmtRequestedValue(named) : JSON.stringify(v);
  }
  const s = String(v).trim();
  if (ISO_DAY.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(",", "");
    }
  }
  return s;
}

// What a booking is made of, in reading order; anything else follows.
const ORDER = ["service", "offer", "preferred_date", "preferred_time", "doctor", "contact_number", "name"];
const HIDDEN = new Set(["category"]);

/** The raw answers as label/value pairs, empty ones dropped. */
export function requestedPairs(requested: Record<string, unknown> | null | undefined): { key: string; label: string; value: string }[] {
  const r = requested ?? {};
  const keys = [...ORDER.filter((k) => k in r), ...Object.keys(r).filter((k) => !ORDER.includes(k) && !HIDDEN.has(k))];
  return keys
    .map((key) => ({ key, label: prettyKey(key), value: fmtRequestedValue(r[key]) }))
    .filter((p) => p.value);
}

const str = (v: unknown) => {
  const s = fmtRequestedValue(v);
  return s || null;
};

/** What they asked for: the service, or the offer they picked. */
export const requestService = (req: Pick<BookingRequest, "requested">) =>
  str(req.requested?.service) ?? str(req.requested?.offer);

/** When they'd like it: "Fri 17 Oct 2026 · evening". */
export function requestPreferred(req: Pick<BookingRequest, "requested">): string | null {
  const date = str(req.requested?.preferred_date);
  const time = str(req.requested?.preferred_time);
  if (date && time) return `${date} · ${time}`;
  return date ?? time;
}

/** Where it came from. */
export function requestSource(req: Pick<BookingRequest, "campaign" | "source">): string {
  if (req.campaign) return `From campaign: ${req.campaign.name}`;
  return req.source === "FLOW" ? "Booking flow" : "Agent";
}

/** "waiting 25m" + tone, from working minutes open. */
export function requestAge(req: Pick<BookingRequest, "openMinutes" | "status">): { label: string; tone: string } | null {
  if (!isOpenRequest(req) || req.openMinutes == null) return null;
  const ms = req.openMinutes * 60_000;
  return { label: fmtElapsed(ms), tone: waitTone(ms) };
}

// ── Prefill for the Book dialog ─────────────────────────────────────────────

/** The patient's preferred day as a date input value, when it parses and isn't past. */
export function preferredDateInput(requested: Record<string, unknown> | null | undefined): string | null {
  const raw = requested?.preferred_date;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  let d: Date | null = null;
  if (ISO_DAY.test(s)) d = new Date(`${s}T00:00:00`);
  else {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) d = new Date(t);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  const today = toDateInput(new Date());
  const v = toDateInput(d);
  return v >= today ? v : null;
}

/** "16:30" / "4:30 pm" / "4pm" → "16:30"; words like "evening" → null. */
export function preferredTimeInput(requested: Record<string, unknown> | null | undefined): string | null {
  const raw = requested?.preferred_time;
  if (typeof raw !== "string") return null;
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (!m[2] && !m[3]) return null; // a bare "4" is too ambiguous
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ── Same-tab change signal ──────────────────────────────────────────────────
// The server's socket events cover colleagues; this covers our own change, so
// the banner, contact panel and outcome chip refresh at once either way.

const EVENT = "everlast:booking-request-changed";

export function notifyRequestChanged(conversationId: number | string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { conversationId: String(conversationId) } }));
}

export function onRequestChanged(cb: (conversationId: string) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<{ conversationId: string }>).detail?.conversationId);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
