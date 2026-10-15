"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Stethoscope, Hash, Megaphone, CircleCheck, CircleHelp, Compass, CalendarClock, TriangleAlert } from "lucide-react";
import type { Booking, BookingRequestStatus } from "@/types";
import { apiCheckSlot } from "@/lib/api";
import { fmtWhen, personName, toDateInput } from "@/lib/chatOutcome";
import {
  REQUEST_STATUS_CHIP, REQUEST_STATUS_LABEL, SOURCE_CHIP, type SourceFields, requestSlot, requestSourceInfo, requestedPairs,
} from "@/lib/bookingRequests";

export function RequestStatusChip({ status, className = "" }: { status: BookingRequestStatus; className?: string }) {
  return (
    <span className={`shrink-0 inline-flex items-center text-[10.5px] font-semibold px-1.5 py-px rounded border ${REQUEST_STATUS_CHIP[status]} ${className}`}>
      {REQUEST_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Where the patient came from: "Campaign: X · proven" / "· confirmed",
 * "Suggested: X (not confirmed)" in amber, "Instagram", "Other: note",
 * "Source not set". `campaignHref` links a credited campaign's name.
 */
export function LeadSourceChip({ req, campaignHref, className = "" }: {
  req: Partial<SourceFields>;
  campaignHref?: (id: number) => string;
  className?: string;
}) {
  const info = requestSourceInfo(req);
  const Icon = info.tone === "proven" || info.tone === "confirmed" ? CircleCheck
    : info.tone === "suggested" ? CircleHelp
    : info.tone === "unset" ? Compass
    : Megaphone;
  const linked = campaignHref && info.campaign && (info.tone === "proven" || info.tone === "confirmed");
  return (
    <span
      title={info.title}
      className={`inline-flex max-w-full items-center gap-1 text-[11px] font-medium px-1.5 py-px rounded border ${SOURCE_CHIP[info.tone]} ${className}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span className="truncate">
        {linked ? (
          <>
            Campaign:{" "}
            <Link href={campaignHref(info.campaign!.id)} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
              {info.campaign!.name}
            </Link>
            {info.text.endsWith(" · proven") ? " · proven" : info.text.endsWith(" · confirmed") ? " · confirmed" : ""}
          </>
        ) : info.text}
      </span>
    </span>
  );
}

/**
 * What the patient asked for, as label/value pairs. A slot they picked in the
 * flow (checked free in the clinic system) comes first, on its own; with
 * `liveCheck` it is checked again now ("Still free" / "No longer free").
 */
export function RequestedDetails({ requested, empty = "No details collected.", liveCheck = false }: {
  requested: Record<string, unknown> | null | undefined;
  empty?: string;
  liveCheck?: boolean;
}) {
  const slot = requestSlot(requested);
  const pairs = requestedPairs(requested, { omit: slot ? ["preferred_date", "preferred_time"] : [] });
  if (!slot && pairs.length === 0) return <p className="text-[12px] text-gray-400">{empty}</p>;
  return (
    <>
      {slot && <PickedSlot slot={slot} liveCheck={liveCheck} />}
      {pairs.length > 0 && (
        <dl className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px] ${slot ? "mt-2" : ""}`}>
          {pairs.map((p) => (
            <div key={p.key} className="contents">
              <dt className="text-gray-400">{p.label}</dt>
              <dd className="text-gray-800 font-medium break-words">{p.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

/** "Tue 21 Oct · 4:30 PM", free when requested — and, live, whether it still is. */
function PickedSlot({ slot, liveCheck }: { slot: NonNullable<ReturnType<typeof requestSlot>>; liveCheck: boolean }) {
  // Keyed by the slot, so an answer about another one never shows.
  const key = `${slot.date} ${slot.time}`;
  const [checked, setChecked] = useState<{ key: string; free: boolean } | null>(null);
  // A past day has nothing left to check.
  const check = liveCheck && slot.date >= toDateInput(new Date());

  useEffect(() => {
    if (!check) return;
    let cancelled = false;
    apiCheckSlot(slot.date, slot.time)
      .then((res) => { if (!cancelled) setChecked({ key, free: res.data.free }); })
      .catch(() => {}); // clinic system unreachable (503): say nothing
    return () => { cancelled = true; };
  }, [check, key, slot.date, slot.time]);

  const live = check && checked?.key === key ? checked.free : null;
  return (
    <div className="rounded-lg border border-brand/20 bg-white px-3 py-2">
      <p className="flex items-center gap-1.5 text-[14px] font-bold text-gray-900">
        <CalendarClock className="w-4 h-4 text-brand-fg shrink-0" /> {slot.label}
      </p>
      <p className="mt-0.5 text-[11px] text-gray-500">✓ Was free in the clinic system when requested</p>
      {live === true && (
        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-px rounded border bg-brand-100 text-brand-fg border-brand/30">
          <CircleCheck className="w-3 h-3" /> Still free
        </span>
      )}
      {live === false && (
        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-px rounded border bg-amber-50 text-amber-700 border-amber-200">
          <TriangleAlert className="w-3 h-3" /> No longer free — offer another time
        </span>
      )}
    </div>
  );
}

/** One appointment: when, service, doctor, Dok32 ref, note, who recorded it. */
export function AppointmentCard({ booking: b, now, footer, action }: {
  booking: Booking;
  now: number;
  footer?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const cancelled = b.status === "CANCELLED";
  const upcoming = !cancelled && new Date(b.appointmentAt).getTime() >= now;
  return (
    <div className={`rounded-xl border p-3 ${cancelled ? "border-gray-100 bg-gray-50 opacity-60" : upcoming ? "border-brand/20 bg-brand-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start gap-2">
        <p className={`flex-1 text-[13px] font-bold ${cancelled ? "text-gray-500 line-through" : "text-gray-900"}`}>{fmtWhen(b.appointmentAt)}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${upcoming ? "bg-brand-200 text-brand-fg" : "bg-gray-100 text-gray-500"}`}>
          {cancelled ? "Cancelled" : upcoming ? "Upcoming" : "Past"}
        </span>
      </div>
      {b.service && <p className={`mt-0.5 text-[12px] font-medium ${cancelled ? "text-gray-500" : "text-gray-800"}`}>{b.service}</p>}
      {(b.doctor || b.dok32Ref) && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-gray-600">
          {b.doctor && <span className="inline-flex items-center gap-1"><Stethoscope className="w-3 h-3 text-gray-400" />{b.doctor}</span>}
          {b.dok32Ref && <span className="inline-flex items-center gap-1" title="Dok32 reference"><Hash className="w-3 h-3 text-gray-400" />Dok32 {b.dok32Ref}</span>}
        </p>
      )}
      {b.note && <p className="mt-0.5 text-[12px] text-gray-500 whitespace-pre-wrap break-words">{b.note}</p>}
      <p className="mt-1.5 text-[11px] text-gray-400">
        {footer ?? <>Booked by {personName(b.createdBy)}</>}
      </p>
      {action}
    </div>
  );
}
