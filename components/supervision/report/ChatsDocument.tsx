// Chats — one row per chat with a message in the period: who handled it, how
// fast, the longest wait, outcome, booking and source.

import type { ChatsReport, ChatsReportChat } from "@/types";
import { formatMinutes, formatPhone, notBookedReasonLabel } from "../format";
import {
  CHAT_STATUS_ORDER,
  OUTCOME_ORDER,
  type TimeFormat,
  chatStatusLabel,
  leadSourceReportLabel,
  orderedEntries,
  outcomeOrNone,
  requestStatusLabel,
} from "./reportFormat";
import { CountTable, Empty, Kpi, ReportCover, ReportEnd, Section, docContext, n, standardFacts } from "./parts";

/** The chat's booking request as one phrase: "Booked", "Couldn’t book · Price", "Open · in progress". */
export function chatBookingLabel(c: Pick<ChatsReportChat, "bookingRequest" | "notBookedReason">): string {
  if (!c.bookingRequest) return "";
  if (c.bookingRequest === "NOT_BOOKED") return `Couldn’t book · ${notBookedReasonLabel(c.notBookedReason)}`;
  return requestStatusLabel(c.bookingRequest);
}

function Summary({ report }: { report: ChatsReport }) {
  const s = report.summary;
  const rows = report.chats;
  const sum = (f: (c: ChatsReportChat) => number) => rows.reduce((a, c) => a + f(c), 0);
  const withRequest = rows.filter((c) => c.bookingRequest).length;
  return (
    <Section title="Summary">
      <div className="sr-kpis sr-kpis-5">
        <Kpi label="Chats" value={n(s.chats)} sub="with a message in the period" />
        <Kpi label="Unanswered" value={n(s.unanswered)} sub="patient still waiting" tone={s.unanswered > 0 ? "bad" : undefined} />
        <Kpi label="With late replies" value={n(s.withLateResponses)} sub={`${report.slaMinutes} min or more`} tone={s.withLateResponses > 0 ? "bad" : undefined} />
        <Kpi label="Patient messages" value={n(sum((c) => c.patientMessages))} />
        <Kpi label="Staff messages" value={n(sum((c) => c.staffMessages))} sub={`${n(sum((c) => c.botMessages))} bot · ${n(sum((c) => c.campaignMessages))} campaign`} />
        <Kpi label="Booking requests" value={n(withRequest)} sub="chats with one" />
        <Kpi label="Outcome: booked" value={n(s.byOutcome.BOOKED ?? 0)} tone={(s.byOutcome.BOOKED ?? 0) > 0 ? "good" : undefined} />
        <Kpi label="Appointments" value={n(sum((c) => c.appointments))} sub="on these chats, all time" />
        <Kpi label="Opted out" value={n(rows.filter((c) => c.optedOut).length)} sub="patients" />
        <Kpi label="Chats with notes" value={n(rows.filter((c) => c.notes > 0).length)} sub={`${n(sum((c) => c.notes))} notes`} />
      </div>
      <div className="sr-threecol">
        <div>
          <div className="sr-h3">By outcome</div>
          <CountTable
            head={["Outcome", "Chats"]}
            rows={orderedEntries(s.byOutcome, OUTCOME_ORDER, { last: ["NONE"] }).map(([k, v]) => ({ key: k, label: outcomeOrNone(k), count: v, muted: k === "NONE" }))}
            shareOf={s.chats}
            empty="No chats in this period."
          />
        </div>
        <div>
          <div className="sr-h3">By status</div>
          <CountTable
            head={["Status", "Chats"]}
            rows={orderedEntries(s.byStatus, CHAT_STATUS_ORDER).map(([k, v]) => ({ key: k, label: chatStatusLabel(k), count: v }))}
            shareOf={s.chats}
            empty="No chats in this period."
          />
          <p className="sr-note">Status now, when the report was made.</p>
        </div>
        <div>
          <div className="sr-h3">By line</div>
          <CountTable
            head={["Line", "Chats"]}
            rows={orderedEntries(s.byLine, [], { last: ["—"] }).map(([k, v]) => ({ key: k, label: k === "—" ? "Unknown line" : k, count: v, muted: k === "—" }))}
            shareOf={s.chats}
            empty="No chats in this period."
          />
        </div>
      </div>
    </Section>
  );
}

function ChatRow({ c, tf }: { c: ChatsReportChat; tf: TimeFormat }) {
  const others = c.repliedBy.filter((x) => x !== c.assignedTo);
  const booking = chatBookingLabel(c);
  return (
    <tr>
      <td>
        <span dir="auto">{c.patient || formatPhone(c.phone)}</span>
        {c.optedOut && <span className="sr-tag sr-bad">Opted out</span>}
        {c.patient ? <span className="sr-sub sr-nowrap">{formatPhone(c.phone)}</span> : null}
        {c.tags.length > 0 ? (
          <span className="sr-sub" dir="auto">
            {c.tags.join(", ")}
          </span>
        ) : null}
      </td>
      <td>{c.line || "—"}</td>
      <td>
        {c.assignedTo || <span className="sr-muted">Unassigned</span>}
        {others.length > 0 ? <span className="sr-sub">replied: {others.join(", ")}</span> : null}
      </td>
      <td>{chatStatusLabel(c.status)}</td>
      <td className={c.outcome === "BOOKED" ? "sr-good" : undefined}>
        {c.outcome ? outcomeOrNone(c.outcome) : <span className="sr-muted">—</span>}
        {c.outcomeBy ? <span className="sr-sub">by {c.outcomeBy}</span> : null}
        {c.followUpAt ? <span className="sr-sub sr-nowrap">follow up {tf.short(c.followUpAt)}</span> : null}
      </td>
      <td className="sr-nowrap">
        {tf.short(c.firstMessageAt)}
        <span className="sr-sub">{tf.short(c.lastMessageAt)}</span>
      </td>
      <td className="sr-num">
        {n(c.patientMessages)} / {n(c.staffMessages)}
        <span className="sr-sub">
          {n(c.botMessages)} / {n(c.campaignMessages)}
        </span>
      </td>
      <td className="sr-num">{n(c.firstResponses)}</td>
      <td className="sr-num">{formatMinutes(c.avgResponseMinutes)}</td>
      <td className={`sr-num${c.longestWaitMinutes >= 60 ? " sr-bad" : ""}`}>{c.longestWaitMinutes > 0 ? formatMinutes(c.longestWaitMinutes) : "—"}</td>
      <td className={`sr-num${c.lateResponses > 0 ? " sr-bad" : ""}`}>{n(c.lateResponses)}</td>
      <td className={c.unanswered ? "sr-bad" : ""}>{c.unanswered ? "Yes" : ""}</td>
      <td className={c.bookingRequest === "BOOKED" ? "sr-good" : undefined}>{booking || <span className="sr-muted">—</span>}</td>
      <td>
        {c.leadSource ? leadSourceReportLabel(c.leadSource) : c.campaign ? "Campaign" : <span className="sr-muted">—</span>}
        {c.campaign ? <span className="sr-sub">{c.campaign}</span> : null}
      </td>
      <td className="sr-num">{n(c.appointments)}</td>
      <td className="sr-num">{n(c.notes)}</td>
    </tr>
  );
}

function Chats({ report, tf }: { report: ChatsReport; tf: TimeFormat }) {
  const rows = report.chats;
  return (
    <Section title="All chats" aside={rows.length ? `${n(rows.length)} chat${rows.length === 1 ? "" : "s"}, latest first` : undefined} pageBreak>
      {rows.length === 0 ? (
        <Empty>No chats in this period.</Empty>
      ) : (
        <>
          <table className="sr-table sr-table-tiny">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Line</th>
                <th>Assigned to</th>
                <th>Status</th>
                <th>Outcome</th>
                <th>
                  First message
                  <span className="sr-sub">Last message</span>
                </th>
                <th className="sr-num">
                  Patient / staff
                  <span className="sr-sub">Bot / campaign</span>
                </th>
                <th className="sr-num">First resp.</th>
                <th className="sr-num">Avg resp.</th>
                <th className="sr-num">Longest wait</th>
                <th className="sr-num">Late</th>
                <th>Unans.</th>
                <th>Booking request</th>
                <th>Source</th>
                <th className="sr-num">Appts</th>
                <th className="sr-num">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <ChatRow key={c.id} c={c} tf={tf} />
              ))}
            </tbody>
          </table>
          <p className="sr-note">
            Messages and response times count only this period. Longest wait includes a patient still waiting. Booking request = the chat’s latest one.
          </p>
          {report.truncated && (
            <p className="sr-note">
              <strong>Note:</strong> this period has more chats than the report lists — only the first {n(rows.length)} are shown. Pick a shorter period or
              a single line to see them all.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

export function ChatsDocument({ report, lineLabel, generatedBy }: { report: ChatsReport; lineLabel: string; generatedBy: string }) {
  const ctx = docContext(report);
  return (
    <div className="sr-sheet">
      <ReportCover title="Chats" facts={standardFacts(ctx, report, lineLabel, generatedBy, { label: "Response target", value: `${report.slaMinutes} minutes` })} />
      <Summary report={report} />
      <Chats report={report} tf={ctx.tf} />
      <ReportEnd
        left={`Everlast Wellness — Chats · ${ctx.period} · ${lineLabel}`}
        right={`Generated ${ctx.generated.dateTime(report.generatedAt)} by ${generatedBy}`}
      />
    </div>
  );
}
