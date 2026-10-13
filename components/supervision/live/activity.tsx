// How one SupervisionActivity reads on the live wall: icon, accent colour, a
// short headline and an optional detail line. Kept apart from the wall so the
// wording lives in one place (the feed and the pop-up notifications share it).

import type { ReactNode } from "react";
import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CircleCheck,
  ClipboardList,
  Hand,
  MessageCircle,
  PhoneMissed,
  Reply,
  ThumbsDown,
  UserPlus,
  Workflow,
  Zap,
} from "lucide-react";
import type { SupervisionActivity } from "@/types";
import { dateTime, humanizeKey, messagePreview, notBookedReasonLabel, patientName, personName } from "../format";

export type Tone = "sky" | "green" | "violet" | "amber" | "red" | "gray";

/** Live-wall classes per tone: accent bar, icon disc, and a text colour. The -700 text
 *  shades turn into the bright -300s in dark mode (see the palette in app/globals.css). */
export const TONE: Record<Tone, { bar: string; icon: string; text: string }> = {
  sky: { bar: "bg-sky-400", icon: "bg-sky-400/15 text-sky-700", text: "text-sky-700" },
  green: { bar: "bg-emerald-400", icon: "bg-emerald-400/15 dark:bg-brand/40 text-emerald-700", text: "text-emerald-700" },
  violet: { bar: "bg-violet-400", icon: "bg-violet-400/15 text-violet-700", text: "text-violet-700" },
  amber: { bar: "bg-amber-400", icon: "bg-amber-400/15 text-amber-700", text: "text-amber-700" },
  red: { bar: "bg-red-400", icon: "bg-red-400/15 text-red-700", text: "text-red-700" },
  gray: { bar: "bg-wall-ink/25", icon: "bg-wall-ink/10 text-wall-ink/60", text: "text-wall-ink/60" },
};

export interface Described {
  icon: ReactNode;
  tone: Tone;
  title: ReactNode;
  text: string | null;
  /** Worth a pop-up notification on the wall. */
  notify: boolean;
  /** Plain-text headline for the notification card. */
  plainTitle: string;
}

function str(d: Record<string, unknown> | null, key: string): string | null {
  const v = d?.[key];
  return typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null;
}

function appointmentLine(appointmentAt: string | null, service: string | null): string | null {
  const parts: string[] = [];
  if (appointmentAt && !Number.isNaN(new Date(appointmentAt).getTime())) parts.push(dateTime(appointmentAt));
  if (service) parts.push(service);
  return parts.length ? parts.join(" · ") : null;
}

const STATUS_WORD: Record<string, string> = { OPEN: "reopened", PENDING: "marked pending", RESOLVED: "resolved" };

const B = ({ children }: { children: ReactNode }) => <span className="font-semibold text-wall-ink">{children}</span>;

export function describeActivity(a: SupervisionActivity): Described {
  const icon = "w-[18px] h-[18px]";
  const patient = patientName(a.customer);
  const actor = a.actor ? personName(a.actor) : null;
  const d = a.details;
  const extra = a.text ? messagePreview({ content: a.text }) : null;

  switch (a.type) {
    case "patient_message":
      return {
        icon: <MessageCircle className={icon} />,
        tone: "sky",
        title: <B>{patient}</B>,
        text: extra || "Sent a message",
        notify: false,
        plainTitle: `${patient} wrote`,
      };

    case "agent_message":
      return {
        icon: <Reply className={icon} />,
        tone: "green",
        title: (
          <>
            <B>{actor ?? "Team"}</B> <span className="text-wall-ink/40">→</span> <B>{patient}</B>
          </>
        ),
        text: extra,
        notify: false,
        plainTitle: `${actor ?? "Team"} replied to ${patient}`,
      };

    case "conversation.assigned": {
      const to = str(d, "agentUsername");
      const from = str(d, "previousAgentUsername");
      return {
        icon: <UserPlus className={icon} />,
        tone: "violet",
        title: (
          <>
            {actor ? <B>{actor}</B> : "Chat"} {actor ? "assigned" : "with"} <B>{patient}</B> {to ? <>to <B>{to}</B></> : "was unassigned"}
          </>
        ),
        text: from ? `Was with ${from}` : extra,
        notify: false,
        plainTitle: `${patient} assigned${to ? ` to ${to}` : ""}`,
      };
    }

    case "conversation.claimed":
      return {
        icon: <Hand className={icon} />,
        tone: "violet",
        title: (
          <>
            <B>{actor ?? "An agent"}</B> took <B>{patient}</B>
          </>
        ),
        text: extra,
        notify: false,
        plainTitle: `${actor ?? "An agent"} took ${patient}`,
      };

    case "conversation.status_changed": {
      const status = str(d, "status") ?? "";
      const word = STATUS_WORD[status] ?? `set ${humanizeKey(status || "status")}`;
      return {
        icon: <CircleCheck className={icon} />,
        tone: status === "RESOLVED" ? "gray" : "sky",
        title: (
          <>
            <B>{actor ?? "Someone"}</B> {word} <B>{patient}</B>
          </>
        ),
        text: extra,
        notify: false,
        plainTitle: `${actor ?? "Someone"} ${word} ${patient}`,
      };
    }

    case "conversation.outcome_set": {
      const outcome = str(d, "outcome");
      const appt = appointmentLine(str(d, "appointmentAt"), str(d, "service"));
      const who = actor ?? "Someone";
      if (outcome === "BOOKED") {
        return {
          icon: <CalendarCheck className={icon} />,
          tone: "green",
          title: (
            <>
              <B>{who}</B> booked <B>{patient}</B>
            </>
          ),
          text: appt ?? extra,
          notify: true,
          plainTitle: `${who} booked ${patient}`,
        };
      }
      if (outcome === "FOLLOW_UP") {
        const due = str(d, "followUpAt");
        return {
          icon: <CalendarClock className={icon} />,
          tone: "sky",
          title: (
            <>
              <B>{who}</B> set a follow-up for <B>{patient}</B>
            </>
          ),
          text: due && !Number.isNaN(new Date(due).getTime()) ? `Due ${dateTime(due)}` : extra,
          notify: false,
          plainTitle: `${who} set a follow-up for ${patient}`,
        };
      }
      const label = outcome === "NOT_INTERESTED" ? "not interested" : outcome === "NO_ANSWER" ? "no answer" : humanizeKey(outcome ?? "outcome").toLowerCase();
      return {
        icon: outcome === "NOT_INTERESTED" ? <ThumbsDown className={icon} /> : <PhoneMissed className={icon} />,
        tone: "gray",
        title: (
          <>
            <B>{who}</B> marked <B>{patient}</B> {label}
          </>
        ),
        text: extra,
        notify: false,
        plainTitle: `${who} marked ${patient} ${label}`,
      };
    }

    case "conversation.booking_cancelled":
      return {
        icon: <CalendarX className={icon} />,
        tone: "red",
        title: (
          <>
            <B>{actor ?? "Someone"}</B> cancelled <B>{patient}</B>&rsquo;s booking
          </>
        ),
        text: appointmentLine(str(d, "appointmentAt"), str(d, "service")) ?? extra,
        notify: false,
        plainTitle: `${patient}'s booking was cancelled`,
      };

    case "flow.handed_off": {
      const flow = str(d, "flowName");
      return {
        icon: <Workflow className={icon} />,
        tone: "amber",
        title: (
          <>
            Flow handed <B>{patient}</B> to the team
          </>
        ),
        text: flow ? `From “${flow}”${extra ? ` · ${extra}` : ""}` : extra,
        notify: true,
        plainTitle: `Flow handed ${patient} to the team`,
      };
    }

    case "booking_request.created":
      return {
        icon: <ClipboardList className={icon} />,
        tone: "amber",
        title: (
          <>
            <B>{patient}</B> asked to book
          </>
        ),
        text: extra || "New booking request — nobody has it yet",
        notify: true,
        plainTitle: `New booking request from ${patient}`,
      };

    case "booking_request.booked": {
      const list = Array.isArray(d?.appointments) ? (d?.appointments as Record<string, unknown>[]) : [];
      const first = list[0] ?? null;
      const line = first ? appointmentLine(str(first, "appointmentAt"), str(first, "service")) : null;
      return {
        icon: <CalendarCheck className={icon} />,
        tone: "green",
        title: (
          <>
            <B>{actor ?? "Someone"}</B> booked <B>{patient}</B>
          </>
        ),
        text: line ? `${line}${list.length > 1 ? ` · +${list.length - 1} more` : ""}` : extra,
        notify: true,
        plainTitle: `${actor ?? "Someone"} booked ${patient}`,
      };
    }

    case "booking_request.not_booked":
      return {
        icon: <CalendarX className={icon} />,
        tone: "gray",
        title: (
          <>
            <B>{actor ?? "Someone"}</B> couldn&rsquo;t book <B>{patient}</B>
          </>
        ),
        text: notBookedReasonLabel(str(d, "reason")),
        notify: false,
        plainTitle: `Couldn't book ${patient}`,
      };

    default:
      return {
        icon: <Zap className={icon} />,
        tone: "gray",
        title: (
          <>
            {actor && <B>{actor}</B>} {humanizeKey(a.type.split(".").pop() ?? a.type).toLowerCase()} · <B>{patient}</B>
          </>
        ),
        text: extra,
        notify: false,
        plainTitle: humanizeKey(a.type),
      };
  }
}
