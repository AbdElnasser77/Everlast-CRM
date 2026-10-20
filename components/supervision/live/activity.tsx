// How one SupervisionActivity reads on the live wall: icon, accent colour, a
// short headline and an optional detail line. Kept apart from the wall so the
// wording lives in one place (the feed and the pop-up notifications share it).

import type { ReactNode } from "react";
import {
  CalendarClock,
  CalendarX,
  CircleCheck,
  Flag,
  Hand,
  MessageCircle,
  Reply,
  UserPlus,
  Workflow,
  Zap,
} from "lucide-react";
import type { SupervisionActivity } from "@/types";
import { dateTime, humanizeKey, messagePreview, patientName, personName } from "../format";

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
      const who = actor ?? "Someone";
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
      if (!outcome) {
        // Cancelled by someone, or by the server when the patient wrote again (no actor).
        return {
          icon: <CalendarX className={icon} />,
          tone: "gray",
          title: actor ? (
            <>
              <B>{actor}</B> cancelled the follow-up for <B>{patient}</B>
            </>
          ) : (
            <>
              Follow-up for <B>{patient}</B> cancelled
            </>
          ),
          text: extra,
          notify: false,
          plainTitle: actor ? `${actor} cancelled the follow-up for ${patient}` : `Follow-up for ${patient} cancelled`,
        };
      }
      // Legacy outcomes (Booked / Not interested / No answer) from older history.
      const label = humanizeKey(outcome).toLowerCase();
      return {
        icon: <Flag className={icon} />,
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
