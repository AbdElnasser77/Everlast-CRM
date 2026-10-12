/**
 * How a chat ended up — Booked / Follow up / Not interested / No answer — and
 * the waiting timer, shared by the inbox list, the chat header and the contact
 * panel so all three say it the same way.
 *
 * Times are shown in the browser's zone: the team works in Dubai, and so do the
 * browsers they work from.
 */

import type { Booking, BookingRequest, Conversation, ConversationNote, ConversationOutcome, ConversationProfile, PersonRef } from "@/types";

// The server returns every scalar column on a conversation row; the shared
// Conversation type only lists what the inbox used before outcomes existed.
export type InboxConversation = Conversation & {
  awaitingReplySince?: string | null;
  outcome?: ConversationOutcome | null;
  outcomeAt?: string | null;
  followUpAt?: string | null;
  lastAgentReplyAt?: string | null;
};

// What GET /conversations/:id/profile returns now (the shared type predates
// outcomes): the chat's outcome, this patient's bookings on any line, and the
// chat's staff notes, and this chat's booking requests.
export type ProfileWithOutcome = Omit<ConversationProfile, "conversation"> & {
  conversation: ConversationProfile["conversation"] & {
    outcome: ConversationOutcome | null;
    outcomeAt: string | null;
    outcomeBy: PersonRef | null;
    followUpAt: string | null;
    awaitingReplySince: string | null;
    lastAgentReplyAt: string | null;
  };
  bookings: Booking[];
  notes: ConversationNote[];
  bookingRequests?: BookingRequest[];
};

export const OUTCOME_LABEL: Record<ConversationOutcome, string> = {
  BOOKED: "Booked",
  FOLLOW_UP: "Follow up",
  NOT_INTERESTED: "Not interested",
  NO_ANSWER: "No answer",
};

// Chip colours. Follow-up turns red once its time has passed (see isOverdue).
export const OUTCOME_CHIP: Record<ConversationOutcome, string> = {
  BOOKED: "bg-[#EEF6F1] text-[#3B694C] border-[#3B694C]/30",
  FOLLOW_UP: "bg-amber-50 text-amber-700 border-amber-200",
  NOT_INTERESTED: "bg-gray-100 text-gray-600 border-gray-200",
  NO_ANSWER: "bg-slate-50 text-slate-500 border-slate-200",
};
export const OVERDUE_CHIP = "bg-red-50 text-red-600 border-red-200";

export const personName = (p: { name?: string | null; username: string } | null | undefined) =>
  p ? p.name || p.username : "Someone";

export function isOverdue(followUpAt: string | null | undefined, now = Date.now()): boolean {
  return !!followUpAt && new Date(followUpAt).getTime() < now;
}

/** "Tue 14 Oct, 4:30 PM" — and the year when it isn't this one. */
export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day.replace(",", "")}, ${time}`;
}

/** Elapsed time, compact: "<1m", "12m", "2h 5m", "3d 4h". */
export function fmtElapsed(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

// Waiting without a reply: neutral, amber from 15 minutes, red from 30.
export const WAIT_AMBER_MIN = 15;
export const WAIT_RED_MIN = 30;
export function waitTone(ms: number): string {
  const m = ms / 60_000;
  if (m >= WAIT_RED_MIN) return "text-red-600 bg-red-50 border-red-200";
  if (m >= WAIT_AMBER_MIN) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-gray-500 bg-gray-50 border-gray-200";
}

/**
 * The booking a chat's "Booked" chip describes: this chat's next live
 * appointment, or — when they've all passed — its latest one.
 */
export function chipBooking(bookings: Booking[] | null | undefined, conversationId: number, now = Date.now()): Booking | null {
  const live = (bookings ?? []).filter((b) => b.status === "BOOKED" && b.conversationId === conversationId);
  if (live.length === 0) return null;
  const t = (b: Booking) => new Date(b.appointmentAt).getTime();
  const upcoming = live.filter((b) => t(b) >= now).sort((a, b) => t(a) - t(b));
  return upcoming[0] ?? live.sort((a, b) => t(b) - t(a))[0];
}

/** Upcoming first (soonest on top), then past ones (latest first), cancelled last. */
export function sortBookings(bookings: Booking[], now = Date.now()): Booking[] {
  const t = (b: Booking) => new Date(b.appointmentAt).getTime();
  const rank = (b: Booking) => (b.status === "CANCELLED" ? 2 : t(b) >= now ? 0 : 1);
  return [...bookings].sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? t(a) - t(b) : t(b) - t(a)));
}

// ── Date inputs (local time) ──────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const toDateTimeInput = (d: Date) => `${toDateInput(d)}T${toTimeInput(d)}`;

/** The next :00 or :30 after now. */
export function nextHalfHour(from = new Date()): Date {
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
}

/** "2026-10-14" + "16:30" (local) → ISO, or null when either is missing/invalid. */
export function localToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
