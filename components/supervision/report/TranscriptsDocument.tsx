// Transcripts — the chosen chats' full conversations in the period, after a
// cover that says how they were chosen and an index of the chats.

import type { ChatsReport, ChatsReportChat } from "@/types";
import { formatMinutes, formatPhone } from "../format";
import { Transcripts, type TranscriptsState } from "./ReportDocument";
import { chatBookingLabel } from "./ChatsDocument";
import { outcomeOrNone } from "./reportFormat";
import { Empty, ReportCover, ReportEnd, Section, docContext, n } from "./parts";

export function TranscriptsDocument({
  report,
  chosen,
  criteria,
  transcripts,
  lineLabel,
  generatedBy,
}: {
  report: ChatsReport;
  /** The chosen chats, in print order. */
  chosen: ChatsReportChat[];
  /** The filter in words ("Agent: Sara", "Unanswered"…). */
  criteria: string[];
  transcripts: TranscriptsState;
  lineLabel: string;
  generatedBy: string;
}) {
  const ctx = docContext(report);
  const { tf } = ctx;
  return (
    <div className="sr-sheet">
      <ReportCover
        title="Chat transcripts"
        facts={[
          { label: "Period", value: ctx.period },
          { label: "WhatsApp line", value: lineLabel },
          { label: "Chats included", value: `${n(chosen.length)} of ${n(report.chats.length)}` },
          { label: "Generated", value: ctx.generated.dateTime(report.generatedAt) },
          { label: "By", value: generatedBy },
          { label: "Time zone", value: ctx.tz },
        ]}
      />

      <Section title="How these chats were chosen">
        <p style={{ margin: 0, fontSize: "9pt" }}>
          {criteria.length > 0 ? (
            <>
              Filter in use: <strong>{criteria.join(" · ")}</strong>.{" "}
            </>
          ) : (
            <>No filter — chosen from every chat with a message in the period. </>
          )}
          The supervisor ticked {n(chosen.length)} chat{chosen.length === 1 ? "" : "s"}. Each transcript shows only this period’s messages (up to 300 per chat).
        </p>
      </Section>

      <Section title="Chats in this document">
        {chosen.length === 0 ? (
          <Empty>No chats chosen.</Empty>
        ) : (
          <table className="sr-table sr-table-compact sr-index">
            <thead>
              <tr>
                <th className="sr-num">#</th>
                <th>Patient</th>
                <th>Line</th>
                <th>Assigned to</th>
                <th>Outcome</th>
                <th>Booking request</th>
                <th className="sr-num">Avg resp.</th>
                <th className="sr-num">Late</th>
                <th>Unans.</th>
                <th>Last message</th>
              </tr>
            </thead>
            <tbody>
              {chosen.map((c, i) => (
                <tr key={c.id}>
                  <td className="sr-num">{i + 1}</td>
                  <td>
                    <span dir="auto">{c.patient || formatPhone(c.phone)}</span>
                    {c.patient ? <span className="sr-sub sr-nowrap">{formatPhone(c.phone)}</span> : null}
                  </td>
                  <td>{c.line || "—"}</td>
                  <td>{c.assignedTo || <span className="sr-muted">Unassigned</span>}</td>
                  <td className={c.outcome === "BOOKED" ? "sr-good" : undefined}>{c.outcome ? outcomeOrNone(c.outcome) : "—"}</td>
                  <td>{chatBookingLabel(c) || "—"}</td>
                  <td className="sr-num">{formatMinutes(c.avgResponseMinutes)}</td>
                  <td className={`sr-num${c.lateResponses > 0 ? " sr-bad" : ""}`}>{n(c.lateResponses)}</td>
                  <td className={c.unanswered ? "sr-bad" : ""}>{c.unanswered ? "Yes" : ""}</td>
                  <td className="sr-nowrap">{tf.short(c.lastMessageAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Transcripts state={transcripts} tf={tf} />

      <ReportEnd
        left={`Everlast Wellness — Chat transcripts · ${ctx.period} · ${lineLabel}`}
        right={`Generated ${ctx.generated.dateTime(report.generatedAt)} by ${generatedBy}`}
      />
    </div>
  );
}
