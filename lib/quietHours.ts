// Client-side mirror of the API's utils/quietHours.js, so the wizard can warn
// before a bad schedule is submitted. The server is still what enforces it.

export interface QuietHours {
  start: string; // "21:00"
  end: string; // "09:00"
  timezone: string; // "Asia/Dubai"
  enabled: boolean;
  isQuietNow: boolean;
  nextOpenAt: string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function localMinuteOfDay(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function isQuietAt(date: Date, qh: QuietHours | null): boolean {
  if (!qh?.enabled) return false;
  const m = localMinuteOfDay(date, qh.timezone);
  const s = toMinutes(qh.start);
  const e = toMinutes(qh.end);
  return s > e ? m >= s || m < e : m >= s && m < e;
}

// The first allowed moment at or after `date`.
export function nextOpenAfter(date: Date, qh: QuietHours | null): Date {
  if (!qh || !isQuietAt(date, qh)) return date;
  const m = localMinuteOfDay(date, qh.timezone);
  const minutesLeft = (toMinutes(qh.end) - m + 1440) % 1440;
  return new Date(Math.floor(date.getTime() / 60000) * 60000 + minutesLeft * 60000);
}

// "9:00 AM", shown in the viewer's own timezone unless one is given.
export function formatClock(date: Date | string, timeZone?: string): string {
  return new Date(date).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}
