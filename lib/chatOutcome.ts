/**
 * A chat's follow-up (the one outcome the CRM still sets — see activeOutcome)
 * and the waiting timer, shared by the inbox list, the chat header and the contact
 * panel so all three say it the same way.
 *
 * Times are shown in the browser's zone: the team works in Dubai, and so do the
 * browsers they work from.
 */

import type { Conversation, ConversationNote, ConversationOutcome, ConversationProfile, PersonRef } from "@/types";

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
// outcomes): the chat's outcome and the chat's staff notes.
export type ProfileWithOutcome = Omit<ConversationProfile, "conversation"> & {
  conversation: ConversationProfile["conversation"] & {
    outcome: ConversationOutcome | null;
    outcomeAt: string | null;
    outcomeBy: PersonRef | null;
    followUpAt: string | null;
    awaitingReplySince: string | null;
    lastAgentReplyAt: string | null;
  };
  notes: ConversationNote[];
};

/**
 * The outcomes a chat can be given: only a follow-up. The raw API union
 * (ConversationOutcome) still has the legacy "BOOKED", "NOT_INTERESTED" and
 * "NO_ANSWER" that old chats can carry — see activeOutcome.
 */
export type ActiveOutcome = Extract<ConversationOutcome, "FOLLOW_UP">;

export const OUTCOME_LABEL: Record<ActiveOutcome, string> = {
  FOLLOW_UP: "Follow up",
};

// Chip colours. Follow-up turns red once its time has passed (see isOverdue).
export const OUTCOME_CHIP: Record<ActiveOutcome, string> = {
  FOLLOW_UP: "bg-amber-50 text-amber-700 border-amber-200",
};
export const OVERDUE_CHIP = "bg-red-50 text-red-600 border-red-200";

/**
 * The outcome to show for a chat, or null for none. Legacy data: old chats can
 * still come back from the API with "BOOKED" (booking was removed) or
 * "NOT_INTERESTED" / "NO_ANSWER" (reporting labels that were dropped). Anything
 * but "FOLLOW_UP" reads as "no outcome", so the chat shows the neutral
 * "Follow up" state and a follow-up can be set.
 */
export function activeOutcome(outcome: string | null | undefined): ActiveOutcome | null {
  return outcome === "FOLLOW_UP" ? outcome : null;
}

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

// ── Date inputs (local time) ──────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const toDateTimeInput = (d: Date) => `${toDateInput(d)}T${toTimeInput(d)}`;

/** Quick picks for when to get back to a patient: in 1 hour, tomorrow 10:00, in 3 days (10:00). */
export function followUpPicks(): { label: string; at: Date }[] {
  const now = new Date();
  const inHour = new Date(now.getTime() + 60 * 60_000);
  inHour.setSeconds(0, 0);
  const at10 = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    return d;
  };
  return [
    { label: "In 1 hour", at: inHour },
    { label: "Tomorrow 10:00", at: at10(1) },
    { label: "In 3 days", at: at10(3) },
  ];
}

