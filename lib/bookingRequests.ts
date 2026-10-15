/**
 * Booking requests — "this patient wants to book" — said the same way on the
 * Bookings page, the chat banner and the contact panel.
 */

import type { BookingRequest, BookingRequestStatus, LeadSource, LeadSourceInput, NotBookedReason } from "@/types";
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
// slot_checked / slot_label: the Pick appointment step's bookkeeping, shown as
// the slot itself (requestSlot), not as rows.
const HIDDEN = new Set(["category", "slot_checked", "slot_label"]);

const HH_MM = /^\d{2}:\d{2}$/;

/** "16:30" → "4:30 PM"; anything else as it is. */
export function fmtSlotTime(v: string): string {
  if (!HH_MM.test(v)) return v;
  const [h, m] = v.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "2026-10-21" → "Tue 21 Oct" (the year only when it isn't this year); anything else as it is. */
export function fmtSlotDate(v: string): string {
  if (!ISO_DAY.test(v)) return v;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return v;
  const thisYear = d.getUTCFullYear() === new Date().getFullYear();
  return d
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(thisYear ? {} : { year: "numeric" }), timeZone: "UTC" })
    .replace(",", "");
}

/**
 * The appointment slot a patient picked in a booking flow's Pick appointment
 * step — only when it was checked free in the clinic system at the time.
 */
export function requestSlot(requested: Record<string, unknown> | null | undefined): { date: string; time: string; label: string } | null {
  const r = requested ?? {};
  const date = r.preferred_date;
  const time = r.preferred_time;
  if (r.slot_checked !== true || typeof date !== "string" || typeof time !== "string" || !ISO_DAY.test(date) || !HH_MM.test(time)) return null;
  return { date, time, label: `${fmtSlotDate(date)} · ${fmtSlotTime(time)}` };
}

/** The raw answers as label/value pairs, empty ones dropped. `omit` skips keys shown elsewhere. */
export function requestedPairs(
  requested: Record<string, unknown> | null | undefined,
  { omit = [] }: { omit?: string[] } = {},
): { key: string; label: string; value: string }[] {
  const r = requested ?? {};
  const keys = [...ORDER.filter((k) => k in r), ...Object.keys(r).filter((k) => !ORDER.includes(k) && !HIDDEN.has(k))].filter((k) => !omit.includes(k));
  return keys
    .map((key) => {
      if (key === "slot_status") {
        return { key, label: "Free times", value: r[key] === "NONE_AVAILABLE" ? "None when they asked — arrange a time" : fmtRequestedValue(r[key]) };
      }
      const raw = r[key];
      const value = key === "preferred_time" && typeof raw === "string" ? fmtSlotTime(raw.trim()) : fmtRequestedValue(raw);
      return { key, label: prettyKey(key), value };
    })
    .filter((p) => p.value);
}

const str = (v: unknown) => {
  const s = fmtRequestedValue(v);
  return s || null;
};

/** What they asked for: the service, or the offer they picked. */
export const requestService = (req: Pick<BookingRequest, "requested">) =>
  str(req.requested?.service) ?? str(req.requested?.offer);

/** When they'd like it: "Tue 21 Oct · 4:30 PM", "Fri 17 Oct · evening". */
export function requestPreferred(req: Pick<BookingRequest, "requested">): string | null {
  const when = (v: unknown, fmt: (s: string) => string) => (typeof v === "string" && v.trim() ? fmt(v.trim()) : str(v));
  const date = when(req.requested?.preferred_date, fmtSlotDate);
  const time = when(req.requested?.preferred_time, fmtSlotTime);
  if (date && time) return `${date} · ${time}`;
  return date ?? time;
}

// ── Where the patient came from (lead source) ───────────────────────────────
//
// A campaign is credited only with proof (AUTOMATIC: they came through its
// booking flow or replied to / tapped its message) or when an agent confirms
// it (CONFIRMED). A campaign that merely reached them lately is SUGGESTED —
// shown, never counted until someone confirms it.

/** Picker labels — the server's own (source-options) win when loaded. */
export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  CAMPAIGN: "A campaign",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  REFERRAL: "Referral / word of mouth",
  WALK_IN: "Walk-in / phone call",
  RETURNING: "Returning patient",
  OTHER: "Other",
};

export const LEAD_SOURCE_ORDER: LeadSource[] = ["CAMPAIGN", "INSTAGRAM", "GOOGLE", "REFERRAL", "WALK_IN", "RETURNING", "OTHER"];

/** As a noun in a list or report: "Campaign", "Instagram", "Not recorded". */
export function leadSourceName(key: string | null | undefined): string {
  if (!key || key === "UNKNOWN") return "Not recorded";
  if (key === "CAMPAIGN") return "Campaign";
  return LEAD_SOURCE_LABEL[key as LeadSource] ?? prettyKey(key);
}

export type SourceFields = Pick<
  BookingRequest,
  "campaign" | "suggestedCampaign" | "leadSource" | "sourceStatus" | "sourceNote" | "source" | "flowRunId"
>;

export type SourceTone = "proven" | "confirmed" | "suggested" | "plain" | "unset";

/** Chip colours per tone (theme-aware palette classes). */
export const SOURCE_CHIP: Record<SourceTone, string> = {
  proven: "bg-brand-100 text-brand-fg border-brand/30",
  confirmed: "bg-brand-100 text-brand-fg border-brand/30",
  suggested: "bg-amber-50 text-amber-700 border-amber-200",
  plain: "bg-gray-50 text-gray-700 border-gray-200",
  unset: "bg-white text-gray-400 border-dashed border-gray-300",
};

/**
 * What to say about where a request's patient came from:
 * "Campaign: X · proven" / "Campaign: X · confirmed" / "Suggested: X (not
 * confirmed)" / "Instagram" / "Other: note" / "Source not set".
 */
export function requestSourceInfo(req: Partial<SourceFields>): {
  text: string;
  tone: SourceTone;
  campaign: { id: number; name: string } | null;
  title: string;
} {
  const ls = req.leadSource ?? null;
  const status = req.sourceStatus ?? null;
  if (req.campaign && (ls === "CAMPAIGN" || ls == null) && status !== "SUGGESTED") {
    const proven = status === "AUTOMATIC";
    return {
      text: `Campaign: ${req.campaign.name}${status ? (proven ? " · proven" : " · confirmed") : ""}`,
      tone: proven ? "proven" : "confirmed",
      campaign: req.campaign,
      title: proven
        ? `${provenHow(req)} — counted for the campaign.`
        : status === "CONFIRMED" ? "An agent confirmed this campaign — counted for it." : "Credited to this campaign.",
    };
  }
  if (ls && ls !== "CAMPAIGN" && status !== "SUGGESTED") {
    const note = req.sourceNote?.trim();
    return {
      text: ls === "OTHER" ? (note ? `Other: ${note}` : "Other") : LEAD_SOURCE_LABEL[ls],
      tone: "plain",
      campaign: null,
      title: "Where the patient came from, as recorded by an agent.",
    };
  }
  if (req.suggestedCampaign) {
    return {
      text: `Suggested: ${req.suggestedCampaign.name} (not confirmed)`,
      tone: "suggested",
      campaign: req.suggestedCampaign,
      title: "They received this campaign recently, with no proof it brought them. Not counted until an agent confirms it.",
    };
  }
  return { text: "Source not set", tone: "unset", campaign: null, title: "Nobody has recorded where this patient came from yet." };
}

/** "They came through its booking flow" / "They replied to it". */
export function provenHow(req: Partial<Pick<BookingRequest, "source" | "flowRunId">>): string {
  return req.source === "FLOW" || req.flowRunId ? "They came through its booking flow" : "They replied to / tapped its message";
}

/** Short wording for list rows and banners. */
export function requestSource(req: Partial<SourceFields>): string {
  return requestSourceInfo(req).text;
}

/** Whether booking needs the agent to say where the patient came from. */
export const sourceKnown = (req: Partial<Pick<BookingRequest, "sourceStatus">> | null | undefined) =>
  req?.sourceStatus === "AUTOMATIC" || req?.sourceStatus === "CONFIRMED";

/** The picker's working state. */
export type SourceDraft = { leadSource: LeadSource | ""; campaignId: number | null; note: string };

/** Start the picker from what the request knows (suggested campaign preselected). */
export function sourceDraftFrom(req: Partial<SourceFields> | null | undefined): SourceDraft {
  if (!req) return { leadSource: "", campaignId: null, note: "" };
  if (req.sourceStatus === "SUGGESTED" || (!req.leadSource && !req.campaign && req.suggestedCampaign)) {
    return { leadSource: "CAMPAIGN", campaignId: req.suggestedCampaign?.id ?? null, note: "" };
  }
  if (req.leadSource) {
    return { leadSource: req.leadSource, campaignId: req.campaign?.id ?? null, note: req.sourceNote ?? "" };
  }
  if (req.campaign) return { leadSource: "CAMPAIGN", campaignId: req.campaign.id, note: "" };
  return { leadSource: "", campaignId: null, note: "" };
}

/** Client-side check mirroring the server; returns the input or an error. */
export function sourceInputFrom(d: SourceDraft): { ok: true; input: LeadSourceInput } | { ok: false; error: string } {
  if (!d.leadSource) return { ok: false, error: "Choose where this patient came from." };
  if (d.leadSource === "CAMPAIGN") {
    if (!d.campaignId) return { ok: false, error: "Pick the campaign." };
    return { ok: true, input: { leadSource: "CAMPAIGN", campaignId: d.campaignId } };
  }
  if (d.leadSource === "OTHER") {
    const note = d.note.trim();
    if (!note) return { ok: false, error: "Say where they came from." };
    return { ok: true, input: { leadSource: "OTHER", note } };
  }
  return { ok: true, input: { leadSource: d.leadSource } };
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
