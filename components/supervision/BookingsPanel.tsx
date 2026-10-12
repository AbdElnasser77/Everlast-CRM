"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, RefreshCw } from "lucide-react";
import { apiGetSupervisionBookings } from "@/lib/api";
import type { Booking } from "@/types";
import { clockTime, dayLabel, formatPhone, localDay, patientName, personInitials, personName, timeAgo } from "./format";

type SupervisedBooking = Booking & {
  customer: { id: number; name: string | null; phone: string };
  conversation: { id: number; whatsappNumberId: number };
  // Not in the API's declared type yet; used when the server includes it.
  campaign?: { id: number; name: string } | null;
};

/** "Campaign: Summer whitening", or "from a campaign" when only the id is known. */
function campaignLabel(b: SupervisedBooking): string | null {
  if (b.campaign?.name) return `Campaign: ${b.campaign.name}`;
  if (b.campaignId) return "from a campaign";
  return null;
}

const PRESETS = [
  { preset: "today", days: 1, label: "Today" },
  { preset: "7d", days: 7, label: "Next 7 days" },
  { preset: "30d", days: 30, label: "Next 30 days" },
] as const;

/** Longest custom range, in days (inclusive). */
const MAX_SPAN_DAYS = 366;

export type BookingPreset = (typeof PRESETS)[number]["preset"];
export type BookingRange = { preset: BookingPreset } | { preset: "custom"; from: string; to: string };
export const DEFAULT_BOOKING_RANGE: BookingRange = { preset: "7d" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(s: string): Date | null {
  if (!DAY_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) || localDay(d) !== s ? null : d;
}

function addDays(day: string, n: number): string {
  const d = parseDay(day);
  if (!d) return day;
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** Inclusive day count from → to (0 when either is invalid). */
function spanDays(from: string, to: string): number {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** Read the range from the URL (?range=today|30d|custom&from=&to=); anything invalid → default. */
export function parseBookingRange(params: { get(name: string): string | null }): BookingRange {
  const r = params.get("range");
  if (r === "today" || r === "30d" || r === "7d") return { preset: r };
  if (r === "custom") {
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    const span = spanDays(from, to);
    if (span >= 1 && span <= MAX_SPAN_DAYS) return { preset: "custom", from, to };
  }
  return DEFAULT_BOOKING_RANGE;
}

/** Write a non-default range into URL params. */
export function writeBookingRange(range: BookingRange, q: URLSearchParams) {
  if (range.preset === "7d") return;
  q.set("range", range.preset);
  if (range.preset === "custom") {
    q.set("from", range.from);
    q.set("to", range.to);
  }
}

/** The concrete YYYY-MM-DD bounds (to inclusive) for a range, against today. */
function resolveRange(range: BookingRange, now: number): { from: string; to: string } {
  if (range.preset === "custom") return { from: range.from, to: range.to };
  const today = localDay(new Date(now));
  const days = PRESETS.find((p) => p.preset === range.preset)?.days ?? 7;
  return { from: today, to: addDays(today, days - 1) };
}

/** "12 Oct – 18 Oct", "12 Oct", "28 Dec 2026 – 3 Jan 2027". */
function rangeWords(from: string, to: string, now: number): string {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return "";
  const year = new Date(now).getFullYear();
  const withYear = a.getFullYear() !== b.getFullYear() || a.getFullYear() !== year;
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  return from === to ? fmt(a) : `${fmt(a)} – ${fmt(b)}`;
}

type Loaded = { key: string; rows: SupervisedBooking[] | null; error: string | null };

/**
 * Upcoming appointments the team booked from chats, grouped by day. Narrowed
 * by the page's number filter and, when an agent is picked on the board, to
 * the bookings that agent made.
 */
export function BookingsPanel({
  numberId,
  agentId,
  agentLabel,
  numberLabels,
  refreshKey,
  now,
  range,
  onRange,
  onOpenChat,
}: {
  numberId: number | undefined;
  agentId: number | null;
  agentLabel: string | null;
  numberLabels: Map<number, string>;
  refreshKey: number;
  now: number;
  /** Appointment-date range; owned by the page so it can live in the URL. */
  range: BookingRange;
  onRange: (r: BookingRange) => void;
  onOpenChat: (conversationId: number) => void;
}) {
  const [showCancelled, setShowCancelled] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const { from, to } = resolveRange(range, now);
  const key = `${numberId ?? ""}|${agentId ?? ""}|${from}|${to}|${showCancelled}`;

  // Editing either date switches to Custom and keeps the range valid
  // (to >= from, at most MAX_SPAN_DAYS) by moving the other end.
  const setFrom = (v: string) => {
    if (!parseDay(v)) return;
    let nextTo = to < v ? v : to;
    if (spanDays(v, nextTo) > MAX_SPAN_DAYS) nextTo = addDays(v, MAX_SPAN_DAYS - 1);
    onRange({ preset: "custom", from: v, to: nextTo });
  };
  const setTo = (v: string) => {
    if (!parseDay(v)) return;
    let nextFrom = from > v ? v : from;
    if (spanDays(nextFrom, v) > MAX_SPAN_DAYS) nextFrom = addDays(v, -(MAX_SPAN_DAYS - 1));
    onRange({ preset: "custom", from: nextFrom, to: v });
  };
  const words = rangeWords(from, to, now);
  const presetLabel = PRESETS.find((p) => p.preset === range.preset)?.label ?? "Custom";

  useEffect(() => {
    let cancelled = false;
    apiGetSupervisionBookings({
      from,
      to,
      numberId,
      agentId: agentId ?? undefined,
      status: showCancelled ? "all" : "BOOKED",
    })
      .then((res) => {
        if (!cancelled) setLoaded({ key, rows: res.data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoaded((prev) =>
          prev && prev.key === key && prev.rows ? prev : { key, rows: null, error: err instanceof Error ? err.message : "Couldn't load bookings" },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [key, numberId, agentId, from, to, showCancelled, refreshKey, retry]);

  const current = loaded && loaded.key === key ? loaded : null;

  const groups = useMemo(() => {
    const out: { day: string; label: string; items: SupervisedBooking[] }[] = [];
    for (const b of current?.rows ?? []) {
      const day = localDay(new Date(b.appointmentAt));
      let g = out[out.length - 1];
      if (!g || g.day !== day) {
        g = { day, label: dayLabel(b.appointmentAt), items: [] };
        out.push(g);
      }
      g.items.push(b);
    }
    return out;
  }, [current]);

  const total = current?.rows?.filter((b) => b.status === "BOOKED").length ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Appointments</h2>
          <p className="text-[12px] text-gray-400">
            <span className="font-semibold text-gray-600">{words}</span>
            {" · "}
            {current?.rows ? `${total} booked` : "Loading…"}
            {agentLabel && ` by ${agentLabel}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-gray-50 border border-gray-100 rounded-lg p-1 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.preset}
                type="button"
                onClick={() => onRange({ preset: p.preset })}
                aria-pressed={range.preset === p.preset}
                className={`text-[12px] font-semibold rounded-md px-3 py-1 transition-colors cursor-pointer ${
                  range.preset === p.preset ? "bg-[#3B694C] text-white" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onRange({ preset: "custom", from, to })}
              aria-pressed={range.preset === "custom"}
              title="Pick any dates with From / To"
              className={`text-[12px] font-semibold rounded-md px-3 py-1 transition-colors cursor-pointer ${
                range.preset === "custom" ? "bg-[#3B694C] text-white" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Custom
            </button>
          </div>
          <div
            className={`flex items-center gap-1.5 text-[12px] rounded-lg border px-2 py-1 ${
              range.preset === "custom" ? "border-[#3B694C]/40 bg-[#F5FAF7]" : "border-gray-100 bg-white"
            }`}
          >
            <label className="flex items-center gap-1 text-gray-400">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
                className="text-[12px] text-gray-700 bg-transparent outline-none cursor-pointer tabular-nums"
              />
            </label>
            <span className="text-gray-300">–</span>
            <label className="flex items-center gap-1 text-gray-400">
              To
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To date"
                className="text-[12px] text-gray-700 bg-transparent outline-none cursor-pointer tabular-nums"
              />
            </label>
          </div>
          <label className="flex items-center gap-1.5 text-[12px] text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="accent-[#3B694C]"
            />
            Show cancelled
          </label>
        </div>
      </div>

      {/* List */}
      {!current ? (
        <div className="p-4 space-y-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-center">
              <div className="w-14 h-4 bg-gray-100 rounded" />
              <div className="flex-1 h-4 bg-gray-100 rounded" />
              <div className="w-20 h-4 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : !current.rows ? (
        <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
          <p className="text-[13px] font-semibold text-gray-700">Couldn&apos;t load bookings</p>
          <p className="text-[12px] font-mono text-red-600 bg-red-50 rounded-lg px-3 py-1.5">{current.error}</p>
          <button
            type="button"
            onClick={() => setRetry((n) => n + 1)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5840] rounded-xl px-4 py-2 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center py-14 px-6 text-center">
          <CalendarDays className="w-8 h-8 text-gray-200 mb-2" />
          <p className="text-[14px] font-semibold text-gray-700">
            No appointments {range.preset === "custom" ? `for ${words}` : `${presetLabel.toLowerCase()} (${words})`}.
          </p>
          <p className="text-[12.5px] text-gray-400 mt-1">When an agent marks a chat as Booked, the appointment shows up here.</p>
        </div>
      ) : (
        <div>
          {groups.map((g) => (
            <div key={g.day}>
              <div className="sticky top-0 z-[1] flex items-baseline justify-between px-4 py-1.5 bg-gray-50/95 backdrop-blur border-y border-gray-100 first:border-t-0">
                <span className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">{g.label}</span>
                <span className="text-[11px] text-gray-400">
                  {g.items.filter((b) => b.status === "BOOKED").length} appointment{g.items.filter((b) => b.status === "BOOKED").length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="divide-y divide-gray-50">
                {g.items.map((b) => {
                  const cancelled = b.status === "CANCELLED";
                  const past = new Date(b.appointmentAt).getTime() < now;
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => onOpenChat(b.conversation.id)}
                        className="group w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-[#F5FAF7] transition-colors cursor-pointer"
                      >
                        <span
                          className={`w-14 shrink-0 text-[13px] font-bold tabular-nums ${cancelled ? "text-gray-300 line-through" : past ? "text-gray-400" : "text-[#3B694C]"}`}
                        >
                          {clockTime(b.appointmentAt)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-[13px] font-semibold truncate ${cancelled ? "text-gray-400 line-through" : "text-gray-900"}`}>
                            {patientName(b.customer)}
                            {b.customer.name && <span className="font-normal text-[11.5px] text-gray-400 ml-1.5 no-underline">{formatPhone(b.customer.phone)}</span>}
                          </span>
                          <span className="block text-[12px] text-gray-500 truncate">
                            {b.service || "No service noted"}
                            {b.doctor && <span className="text-gray-600"> · {b.doctor}</span>}
                            {b.dok32Ref && <span className="text-gray-400 font-mono text-[11px]"> · Dok32 {b.dok32Ref}</span>}
                            {b.note && <span className="text-gray-400"> · {b.note}</span>}
                          </span>
                        </span>
                        {cancelled && <span className="text-[10.5px] font-semibold px-1.5 py-px rounded bg-gray-100 text-gray-500 shrink-0">Cancelled</span>}
                        {campaignLabel(b) && (
                          <span
                            title={campaignLabel(b) ?? undefined}
                            className="hidden md:inline text-[10.5px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-px shrink-0 max-w-[160px] truncate"
                          >
                            {campaignLabel(b)}
                          </span>
                        )}
                        {numberLabels.size > 1 && numberLabels.get(b.whatsappNumberId) && (
                          <span className="hidden sm:inline text-[10.5px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-px shrink-0 max-w-[120px] truncate">
                            {numberLabels.get(b.whatsappNumberId)}
                          </span>
                        )}
                        <span
                          title={`Booked by ${b.createdBy ? personName(b.createdBy) : "—"} · ${timeAgo(b.createdAt, now)}`}
                          className="hidden sm:flex items-center gap-1.5 shrink-0 text-[11.5px] text-gray-500 w-[120px]"
                        >
                          <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[9px] font-bold flex items-center justify-center shrink-0">
                            {personInitials(b.createdBy)}
                          </span>
                          <span className="truncate">{b.createdBy ? personName(b.createdBy) : "—"}</span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#3B694C] shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
