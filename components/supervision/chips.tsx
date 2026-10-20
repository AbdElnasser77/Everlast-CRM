// The small status chips the chat list and the detail pane share, so a chat
// reads the same in both places.

import { CalendarClock, Clock, Workflow } from "lucide-react";
import type { ConversationOutcome, SupervisionFlowState } from "@/types";
import { activeOutcome } from "@/lib/chatOutcome";
import { WAIT_WARN_MINUTES, formatMinutes, shortDate, dateTime } from "./format";

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

/** The chat's follow-up, and when it's due. */
export function OutcomeChip({
  outcome,
  followUpAt,
  followUpOverdue,
}: {
  outcome: ConversationOutcome | null;
  followUpAt?: string | null;
  followUpOverdue?: boolean;
}) {
  // Legacy: older chats may still carry "BOOKED", "NOT_INTERESTED" or "NO_ANSWER"
  // — they read as no outcome (see activeOutcome).
  if (!activeOutcome(outcome)) return null;
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

/** Where the patient is in a flow: dropped halfway, or still in it. */
export function FlowChip({ flow }: { flow: SupervisionFlowState | null }) {
  if (!flow) return null;
  const name = flow.flowName || "flow";
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
