// The small status chips the chat list and the detail pane share, so a chat
// reads the same in both places.

import { CalendarCheck, CalendarClock, CalendarX, ClipboardList, Clock, PhoneMissed, ThumbsDown, Workflow } from "lucide-react";
import type { Booking, BookingRequest, ConversationOutcome, SupervisionFlowState } from "@/types";
import { WAIT_WARN_MINUTES, formatMinutes, shortDate, dateTime, notBookedReasonLabel, personName } from "./format";

const CHIP = "inline-flex items-center gap-1 text-[10.5px] font-semibold rounded px-1.5 py-px border whitespace-nowrap";

/** How long the patient has been waiting: gray, amber from 15m, red from the SLA. */
export function WaitChip({ minutes, slaMinutes, size = "sm" }: { minutes: number | null; slaMinutes: number; size?: "sm" | "md" }) {
  if (minutes === null) return null;
  const tone =
    minutes >= slaMinutes
      ? "bg-red-100 text-red-700 border-red-300"
      : minutes >= WAIT_WARN_MINUTES
        ? "bg-amber-50 text-amber-700 border-amber-300"
        : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span
      title={`Patient has been waiting ${formatMinutes(minutes)} of working time (quiet hours not counted)`}
      className={`${CHIP} ${tone} ${size === "md" ? "text-[12px] px-2 py-0.5 rounded-md" : ""}`}
    >
      <Clock className={size === "md" ? "w-3.5 h-3.5" : "w-3 h-3"} />
      waiting {formatMinutes(minutes)}
    </span>
  );
}

/** What the agent recorded: Booked (with the appointment), Follow up (due), etc. */
export function OutcomeChip({
  outcome,
  booking,
  followUpAt,
  followUpOverdue,
}: {
  outcome: ConversationOutcome | null;
  booking?: Pick<Booking, "appointmentAt" | "status"> | null;
  followUpAt?: string | null;
  followUpOverdue?: boolean;
}) {
  if (!outcome) return null;
  if (outcome === "BOOKED") {
    const cancelled = booking?.status === "CANCELLED";
    return (
      <span
        title={booking ? `Appointment ${dateTime(booking.appointmentAt)}${cancelled ? " (cancelled)" : ""}` : "Booked"}
        className={`${CHIP} ${cancelled ? "bg-gray-50 text-gray-400 border-gray-200 line-through" : "bg-brand-200 text-brand-strong border-brand/30"}`}
      >
        <CalendarCheck className="w-3 h-3" />
        Booked ✓{booking ? ` · ${shortDate(booking.appointmentAt)}` : ""}
      </span>
    );
  }
  if (outcome === "FOLLOW_UP") {
    return (
      <span
        title={followUpAt ? `Follow up due ${dateTime(followUpAt)}` : "Follow up"}
        className={`${CHIP} ${followUpOverdue ? "bg-red-50 text-red-700 border-red-300" : "bg-sky-50 text-sky-700 border-sky-200"}`}
      >
        <CalendarClock className="w-3 h-3" />
        Follow up{followUpAt ? ` · ${shortDate(followUpAt)}` : ""}
        {followUpOverdue && " · overdue"}
      </span>
    );
  }
  if (outcome === "NOT_INTERESTED") {
    return (
      <span className={`${CHIP} bg-gray-100 text-gray-500 border-gray-200`}>
        <ThumbsDown className="w-3 h-3" /> Not interested
      </span>
    );
  }
  return (
    <span className={`${CHIP} bg-gray-100 text-gray-500 border-gray-200`}>
      <PhoneMissed className="w-3 h-3" /> No answer
    </span>
  );
}

/** Where the patient is in a flow: asked to book, dropped halfway, or still in it. */
export function FlowChip({ flow, booked }: { flow: SupervisionFlowState | null; booked?: boolean }) {
  if (!flow) return null;
  const name = flow.flowName || "flow";
  if (flow.bookingRequested && !booked) {
    return (
      <span title={`“${name}” collected a booking request`} className={`${CHIP} bg-violet-50 text-violet-700 border-violet-200`}>
        <CalendarClock className="w-3 h-3" /> Booking requested
      </span>
    );
  }
  if (flow.droppedHalfway) {
    return (
      <span
        title={flow.status === "STALLED" ? `Idle in “${name}” for over an hour` : `Left “${name}” before finishing (${flow.status.toLowerCase()})`}
        className={`${CHIP} bg-orange-50 text-orange-700 border-orange-200 max-w-[200px]`}
      >
        <Workflow className="w-3 h-3 shrink-0" />
        <span className="truncate">Dropped at “{name}”</span>
      </span>
    );
  }
  if (flow.status === "ACTIVE") {
    return (
      <span title={`In “${name}” right now`} className={`${CHIP} bg-brand-100 text-brand-fg border-brand/20 max-w-[180px]`}>
        <Workflow className="w-3 h-3 shrink-0" />
        <span className="truncate">In flow</span>
      </span>
    );
  }
  return null;
}

/**
 * A booking request's state: "Request · New" (nobody has it), "Request · Sara"
 * (Sara is on it), "Booked", "Couldn't book · Price".
 */
export function RequestChip({
  request,
  overSla,
}: {
  request: Pick<BookingRequest, "status" | "claimedBy" | "claimedAt" | "notBookedReason" | "bookings">;
  /** Open past the SLA — the "New" chip turns red. */
  overSla?: boolean;
}) {
  if (request.status === "NEW") {
    return (
      <span
        title="Booking request nobody has picked up yet"
        className={`${CHIP} ${overSla ? "bg-red-50 text-red-700 border-red-300" : "bg-amber-50 text-amber-700 border-amber-300"}`}
      >
        <ClipboardList className="w-3 h-3" /> Request · New
      </span>
    );
  }
  if (request.status === "IN_PROGRESS") {
    const who = personName(request.claimedBy);
    return (
      <span
        title={`${who} is booking this${request.claimedAt ? ` (took it ${dateTime(request.claimedAt)})` : ""}`}
        className={`${CHIP} bg-sky-50 text-sky-700 border-sky-200 max-w-[180px]`}
      >
        <ClipboardList className="w-3 h-3 shrink-0" />
        <span className="truncate">Request · {request.claimedBy ? who : "in progress"}</span>
      </span>
    );
  }
  if (request.status === "BOOKED") {
    const n = request.bookings?.length ?? 0;
    return (
      <span className={`${CHIP} bg-brand-200 text-brand-strong border-brand/30`}>
        <CalendarCheck className="w-3 h-3" /> Booked{n > 1 ? ` · ${n} appointments` : ""}
      </span>
    );
  }
  return (
    <span className={`${CHIP} bg-gray-100 text-gray-500 border-gray-200`}>
      <CalendarX className="w-3 h-3" /> Couldn’t book · {notBookedReasonLabel(request.notBookedReason)}
    </span>
  );
}

export function NumberChip({ label }: { label: string }) {
  return (
    <span
      title={`WhatsApp line: ${label}`}
      className="inline-flex items-center text-[10.5px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-px max-w-[130px] truncate"
    >
      {label}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-brand-100 text-brand-fg",
  PENDING: "bg-amber-50 text-amber-600",
  RESOLVED: "bg-gray-100 text-gray-500",
};

export function StatusChip({ status }: { status: "OPEN" | "PENDING" | "RESOLVED" }) {
  return (
    <span className={`text-[10.5px] font-semibold px-1.5 py-px rounded ${STATUS_STYLE[status] ?? STATUS_STYLE.OPEN}`}>
      {status === "OPEN" ? "Open" : status === "PENDING" ? "Pending" : "Resolved"}
    </span>
  );
}

export const PRESENCE: Record<"ONLINE" | "ON_BREAK" | "OFFLINE", { dot: string; label: string }> = {
  ONLINE: { dot: "bg-green-500", label: "Online" },
  ON_BREAK: { dot: "bg-amber-400", label: "On break" },
  OFFLINE: { dot: "bg-gray-300", label: "Offline" },
};
