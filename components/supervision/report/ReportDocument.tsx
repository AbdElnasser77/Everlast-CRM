// The Supervisor report itself — what prints. Plain semantic markup styled by
// the .sr-* classes in reportFormat.ts, sized in points so the on-screen
// preview and the PDF read the same.

import type { ReportTranscript, SupervisionReport } from "@/types";
import { LEAD_SOURCE_ORDER, leadSourceName } from "@/lib/bookingRequests";
import { formatMinutes, formatPhone, notBookedReasonLabel, parseStructured, personName } from "../format";
import {
  OUTCOME_LABEL,
  OUTCOME_ORDER,
  REASON_ORDER,
  ROLE_LABEL,
  makeTimeFormat,
  outcomeLabel,
  percent,
  periodLabel,
  requestLabel,
  type TimeFormat,
  CLINIC_TZ,
} from "./reportFormat";
import { Empty, Kpi, Section, n } from "./parts";

/** A transcript longer than this starts on its own page. */
const LONG_TRANSCRIPT = 18;

export type TranscriptsState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: ReportTranscript[]; missing: number };

// ── Sections ──────────────────────────────────────────────────────────────

function Summary({ report }: { report: SupervisionReport }) {
  const s = report.summary;
  const flow = s.bookingRequestsBySource.FLOW ?? 0;
  const agent = s.bookingRequestsBySource.AGENT ?? 0;
  const reasonRows = [
    ...REASON_ORDER.map((k) => [k, s.notBookedReasons[k] ?? 0] as const),
    ...Object.entries(s.notBookedReasons).filter(([k]) => !REASON_ORDER.includes(k as never)).map(([k, v]) => [k, v ?? 0] as const),
  ];
  const outcomeRows = [
    ...OUTCOME_ORDER.map((k) => [k, s.outcomes[k] ?? 0] as const),
    ...Object.entries(s.outcomes).filter(([k]) => !OUTCOME_ORDER.includes(k)),
  ];
  const reasonTotal = reasonRows.reduce((a, [, v]) => a + v, 0);
  const outcomeTotal = outcomeRows.reduce((a, [, v]) => a + v, 0);
  // Where booked appointments came from: known sources in picker order, then
  // anything new from the server, "Not recorded" last.
  const bySource = s.bookingsByLeadSource ?? {};
  const sourceRows = [
    ...LEAD_SOURCE_ORDER.filter((k) => (bySource[k] ?? 0) > 0).map((k) => [k, bySource[k]] as const),
    ...Object.entries(bySource).filter(([k, v]) => k !== "UNKNOWN" && !LEAD_SOURCE_ORDER.includes(k as never) && v > 0),
    ...((bySource.UNKNOWN ?? 0) > 0 ? [["UNKNOWN", bySource.UNKNOWN] as const] : []),
  ];
  const sourceTotal = sourceRows.reduce((a, [, v]) => a + v, 0);

  return (
    <Section title="Summary">
      <div className="sr-kpis">
        <Kpi label="Chats" value={n(s.chats)} sub={`${n(s.patientMessages)} patient messages`} />
        <Kpi label="Patients who wrote" value={n(s.patientsWrote)} />
        <Kpi label="Staff replies" value={n(s.staffReplies)} />
        <Kpi label="Avg first response" value={formatMinutes(s.avgFirstResponseMinutes)} sub={`over ${n(s.firstResponses)} first responses`} />
        <Kpi
          label={`Answered within ${report.slaMinutes} min`}
          value={percent(s.withinSlaPercent)}
          tone={s.withinSlaPercent !== null && s.withinSlaPercent < 80 ? "bad" : s.withinSlaPercent !== null ? "good" : undefined}
        />
        <Kpi label="Late responses" value={n(s.lateResponses)} sub={`over ${report.slaMinutes} min`} tone={s.lateResponses > 0 ? "bad" : undefined} />
        <Kpi label="Unanswered chats" value={n(s.unanswered)} tone={s.unanswered > 0 ? "bad" : undefined} />
        <Kpi label="Booking requests" value={n(s.bookingRequests)} sub={`Flow ${n(flow)} · Agent ${n(agent)}`} />
        <Kpi label="Requests booked" value={n(s.requestsBooked)} tone={s.requestsBooked > 0 ? "good" : undefined} />
        <Kpi label="Couldn’t book" value={n(s.requestsNotBooked)} />
        <Kpi label="Requests still open" value={n(s.requestsStillOpen)} tone={s.requestsStillOpen > 0 ? "bad" : undefined} />
        <Kpi label="Appointments booked" value={n(s.appointmentsBooked)} sub={`${n(s.appointmentsCancelled)} cancelled`} />
      </div>

      <div className="sr-twocol">
        <div>
          <div className="sr-h3">Why requests couldn’t be booked</div>
          <table className="sr-table">
            <thead>
              <tr>
                <th>Reason</th>
                <th className="sr-num">Requests</th>
              </tr>
            </thead>
            <tbody>
              {reasonRows.map(([k, v]) => (
                <tr key={k}>
                  <td>{notBookedReasonLabel(k)}</td>
                  <td className="sr-num">{n(v)}</td>
                </tr>
              ))}
              <tr className="sr-total">
                <td>Total</td>
                <td className="sr-num">{n(reasonTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <div className="sr-h3">Outcomes set by staff</div>
          <table className="sr-table">
            <thead>
              <tr>
                <th>Outcome</th>
                <th className="sr-num">Times set</th>
              </tr>
            </thead>
            <tbody>
              {outcomeRows.map(([k, v]) => (
                <tr key={k}>
                  <td>{OUTCOME_LABEL[k] ?? outcomeLabel(k)}</td>
                  <td className="sr-num">{n(v)}</td>
                </tr>
              ))}
              <tr className="sr-total">
                <td>Total</td>
                <td className="sr-num">{n(outcomeTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="sr-twocol">
        <div>
          <div className="sr-h3">Where bookings came from</div>
          {sourceRows.length === 0 ? (
            <Empty>No appointments booked in this period.</Empty>
          ) : (
            <table className="sr-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="sr-num">Appointments</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map(([k, v]) => (
                  <tr key={k}>
                    <td className={k === "UNKNOWN" ? "sr-muted" : undefined}>{leadSourceName(k)}</td>
                    <td className="sr-num">{n(v)}</td>
                  </tr>
                ))}
                <tr className="sr-total">
                  <td>Total</td>
                  <td className="sr-num">{n(sourceTotal)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="sr-note">
            Campaign = proven (came through its booking flow or replied to it) or confirmed by an agent. A campaign the patient merely received
            isn’t counted until someone confirms it.
          </p>
        </div>
        <div />
      </div>
    </Section>
  );
}

function Team({ report }: { report: SupervisionReport }) {
  const rows = report.agents;
  const sum = (f: (a: SupervisionReport["agents"][number]) => number) => rows.reduce((t, a) => t + f(a), 0);
  // Team average = first-response average weighted by each person's first responses.
  const weighted = rows.filter((a) => a.avgResponseMinutes !== null && a.firstResponses > 0);
  const wCount = weighted.reduce((t, a) => t + a.firstResponses, 0);
  const teamAvg = wCount > 0 ? weighted.reduce((t, a) => t + (a.avgResponseMinutes ?? 0) * a.firstResponses, 0) / wCount : null;
  const late = sum((a) => a.lateResponses);

  return (
    <Section title="Team">
      {rows.length === 0 ? (
        <Empty>No staff activity in this period.</Empty>
      ) : (
        <>
          <table className="sr-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th className="sr-num">Chats</th>
                <th className="sr-num">Replies</th>
                <th className="sr-num">First responses</th>
                <th className="sr-num">Avg response</th>
                <th className="sr-num">Late</th>
                <th className="sr-num">Appts booked</th>
                <th className="sr-num">Requests booked / not</th>
                <th className="sr-num">Outcomes set</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    {personName(a)}
                    {!a.isActive && <span className="sr-sub">inactive</span>}
                  </td>
                  <td className="sr-nowrap">{ROLE_LABEL[a.role] ?? a.role}</td>
                  <td className="sr-num">{n(a.chats)}</td>
                  <td className="sr-num">{n(a.replies)}</td>
                  <td className="sr-num">{n(a.firstResponses)}</td>
                  <td className="sr-num">{formatMinutes(a.avgResponseMinutes)}</td>
                  <td className={`sr-num${a.lateResponses > 0 ? " sr-bad" : ""}`}>{n(a.lateResponses)}</td>
                  <td className="sr-num">{n(a.appointmentsBooked)}</td>
                  <td className="sr-num">
                    {n(a.requestsBooked)} / {n(a.requestsNotBooked)}
                  </td>
                  <td className="sr-num">{n(a.outcomesSet)}</td>
                </tr>
              ))}
              <tr className="sr-total">
                <td colSpan={2}>Total</td>
                <td className="sr-num">{n(sum((a) => a.chats))}</td>
                <td className="sr-num">{n(sum((a) => a.replies))}</td>
                <td className="sr-num">{n(sum((a) => a.firstResponses))}</td>
                <td className="sr-num">{formatMinutes(teamAvg)}</td>
                <td className={`sr-num${late > 0 ? " sr-bad" : ""}`}>{n(late)}</td>
                <td className="sr-num">{n(sum((a) => a.appointmentsBooked))}</td>
                <td className="sr-num">
                  {n(sum((a) => a.requestsBooked))} / {n(sum((a) => a.requestsNotBooked))}
                </td>
                <td className="sr-num">{n(sum((a) => a.outcomesSet))}</td>
              </tr>
            </tbody>
          </table>
          <p className="sr-note">
            Late = a reply that took longer than {report.slaMinutes} minutes of working time. A chat handled by two people counts for each, so the
            chats total can exceed the number of chats.
          </p>
        </>
      )}
    </Section>
  );
}

function Bookings({ report, tf }: { report: SupervisionReport; tf: TimeFormat }) {
  const rows = report.bookings;
  const cancelled = rows.filter((b) => b.status === "CANCELLED").length;
  return (
    <Section title="Bookings" aside={rows.length ? `${n(rows.length)} appointment${rows.length === 1 ? "" : "s"}${cancelled ? ` · ${n(cancelled)} cancelled` : ""}` : undefined} pageBreak>
      {rows.length === 0 ? (
        <Empty>No bookings in this period.</Empty>
      ) : (
        <table className="sr-table sr-table-compact">
          <thead>
            <tr>
              <th>Appointment</th>
              <th>Patient</th>
              <th>Service</th>
              <th>Doctor</th>
              <th>Dok32 ref</th>
              <th>Booked by</th>
              <th>Booked at</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const x = b.status === "CANCELLED";
              return (
                <tr key={b.id} className={x ? "sr-struck" : undefined}>
                  <td className="sr-nowrap">
                    {tf.date(b.appointmentAt)}
                    <span className="sr-sub">{tf.time(b.appointmentAt)}</span>
                  </td>
                  <td>
                    <span dir="auto">{b.customer.name || "—"}</span>
                    <span className="sr-sub sr-nowrap">{formatPhone(b.customer.phone)}</span>
                  </td>
                  <td>
                    {b.service || "—"}
                    {b.note ? <span className="sr-sub" dir="auto">{b.note}</span> : null}
                  </td>
                  <td>{b.doctor || "—"}</td>
                  <td className="sr-nowrap">{b.dok32Ref || "—"}</td>
                  <td>{b.bookedBy ? personName(b.bookedBy) : "—"}</td>
                  <td className="sr-nowrap">{tf.short(b.bookedAt)}</td>
                  <td>
                    {b.leadSource || b.campaign ? leadSourceName(b.leadSource ?? "CAMPAIGN") : <span className="sr-muted">Not recorded</span>}
                    {b.campaign && (b.leadSource === "CAMPAIGN" || !b.leadSource) ? <span className="sr-sub">{b.campaign}</span> : null}
                  </td>
                  <td className={x ? "" : "sr-good"}>{x ? "Cancelled" : "Booked"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function Campaigns({ report, tf }: { report: SupervisionReport; tf: TimeFormat }) {
  const rows = report.campaigns;
  const t = rows.reduce(
    (a, c) => ({ recipients: a.recipients + c.recipients, sent: a.sent + c.sent, failed: a.failed + c.failed, replied: a.replied + c.replied, requests: a.requests + c.bookingRequests, booked: a.booked + c.booked }),
    { recipients: 0, sent: 0, failed: 0, replied: 0, requests: 0, booked: 0 },
  );
  const conv = (booked: number, replied: number) => (replied > 0 ? percent((booked / replied) * 100) : "—");
  return (
    <Section title="Campaigns">
      {rows.length === 0 ? (
        <Empty>No campaigns ran in this period.</Empty>
      ) : (
        <>
          <table className="sr-table sr-table-compact">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Line</th>
                <th>Started</th>
                <th className="sr-num">Recipients</th>
                <th className="sr-num">Sent</th>
                <th className="sr-num">Failed</th>
                <th className="sr-num">Replied</th>
                <th className="sr-num">Booking requests</th>
                <th className="sr-num">Booked</th>
                <th className="sr-num">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.line || "—"}</td>
                  <td className="sr-nowrap">{tf.short(c.startedAt)}</td>
                  <td className="sr-num">{n(c.recipients)}</td>
                  <td className="sr-num">{n(c.sent)}</td>
                  <td className={`sr-num${c.failed > 0 ? " sr-bad" : ""}`}>{n(c.failed)}</td>
                  <td className="sr-num">{n(c.replied)}</td>
                  <td className="sr-num">{n(c.bookingRequests)}</td>
                  <td className="sr-num">{n(c.booked)}</td>
                  <td className="sr-num">{conv(c.booked, c.replied)}</td>
                </tr>
              ))}
              {rows.length > 1 && (
                <tr className="sr-total">
                  <td colSpan={3}>Total</td>
                  <td className="sr-num">{n(t.recipients)}</td>
                  <td className="sr-num">{n(t.sent)}</td>
                  <td className="sr-num">{n(t.failed)}</td>
                  <td className="sr-num">{n(t.replied)}</td>
                  <td className="sr-num">{n(t.requests)}</td>
                  <td className="sr-num">{n(t.booked)}</td>
                  <td className="sr-num">{conv(t.booked, t.replied)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="sr-note">Conversion = booked ÷ replied.</p>
        </>
      )}
    </Section>
  );
}

function Chats({ report, tf }: { report: SupervisionReport; tf: TimeFormat }) {
  const rows = report.chats;
  return (
    <Section title="Chats" aside={rows.length ? `${n(rows.length)} chat${rows.length === 1 ? "" : "s"} with a message in the period` : undefined} pageBreak>
      {rows.length === 0 ? (
        <Empty>No chats in this period.</Empty>
      ) : (
        <>
          <table className="sr-table sr-table-compact">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Line</th>
                <th>Agent</th>
                <th className="sr-num">Msgs (patient)</th>
                <th className="sr-num">Avg response</th>
                <th className="sr-num">Late</th>
                <th>Unans.</th>
                <th>Outcome</th>
                <th>Request</th>
                <th>Last message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span dir="auto">{c.customer.name || formatPhone(c.customer.phone)}</span>
                    {c.customer.name ? <span className="sr-sub sr-nowrap">{formatPhone(c.customer.phone)}</span> : null}
                  </td>
                  <td>{c.line || "—"}</td>
                  <td>{c.assignedAgent ? personName(c.assignedAgent) : <span className="sr-muted">Unassigned</span>}</td>
                  <td className="sr-num">
                    {n(c.messages)} ({n(c.patientMessages)})
                  </td>
                  <td className="sr-num">{formatMinutes(c.avgResponseMinutes)}</td>
                  <td className={`sr-num${c.lateResponses > 0 ? " sr-bad" : ""}`}>{n(c.lateResponses)}</td>
                  <td className={c.unanswered ? "sr-bad" : ""}>{c.unanswered ? "✓" : ""}</td>
                  <td>{outcomeLabel(c.outcome)}</td>
                  <td>{requestLabel(c.request)}</td>
                  <td className="sr-nowrap">{tf.short(c.lastMessageAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.chatsTruncated && (
            <p className="sr-note">
              <strong>Note:</strong> this period has more chats than the report lists — only the first {n(rows.length)} are shown. Pick a shorter
              period or a single line to see them all.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

const WHO_LABEL = { patient: "Patient", bot: "Bot", campaign: "Campaign" } as const;

export function Transcript({ t, tf, first }: { t: ReportTranscript; tf: TimeFormat; first: boolean }) {
  const long = t.messages.length > LONG_TRANSCRIPT;
  // A day heading above the first message of each clinic day.
  const headings: (string | null)[] = [];
  for (let i = 0; i < t.messages.length; i++) {
    const at = t.messages[i].at;
    headings.push(i === 0 || tf.day(at) !== tf.day(t.messages[i - 1].at) ? tf.date(at) : null);
  }
  return (
    <article className={`sr-tx${long && !first ? " sr-tx-long" : ""}${long ? "" : " sr-tx-small"}`}>
      <header className="sr-tx-head">
        <div className="sr-tx-name" dir="auto">
          {t.customer.name || formatPhone(t.customer.phone)}
        </div>
        <div className="sr-tx-meta">
          {formatPhone(t.customer.phone)} · {t.line || "Line unknown"} · Agent: {t.assignedAgent ? personName(t.assignedAgent) : "Unassigned"} ·{" "}
          {n(t.messages.length)} message{t.messages.length === 1 ? "" : "s"}
        </div>
      </header>
      {t.messages.length === 0 ? (
        <p className="sr-note">No messages in this period.</p>
      ) : (
        t.messages.map((m, i) => {
          const heading = headings[i];
          const who = m.from === "agent" ? m.sender || "Agent" : m.from === "patient" ? WHO_LABEL.patient : m.sender ? `${WHO_LABEL[m.from]} · ${m.sender}` : WHO_LABEL[m.from];
          const text = parseStructured(m.text)?.body ?? m.text;
          return (
            <div key={m.id}>
              {heading && <div className="sr-day">{heading}</div>}
              <div className={`sr-msg sr-msg-${m.from}`}>
                <span className="sr-msg-time">{tf.time(m.at)}</span>
                <span className="sr-msg-who" title={who}>
                  {who}
                </span>
                <span className="sr-msg-text" dir="auto">
                  {text || <span className="sr-muted">(no text)</span>}
                </span>
              </div>
            </div>
          );
        })
      )}
      {t.truncated && <p className="sr-note">Transcript cut short — only the first {n(t.messages.length)} messages of this chat in the period are shown.</p>}
    </article>
  );
}

export function Transcripts({ state, tf }: { state: TranscriptsState; tf: TimeFormat }) {
  if (state.status === "none") return null;
  return (
    <Section title="Transcripts" aside={state.status === "ready" ? `${n(state.items.length)} chat${state.items.length === 1 ? "" : "s"}` : undefined} pageBreak>
      {state.status === "loading" ? (
        <Empty>Loading transcripts…</Empty>
      ) : state.status === "error" ? (
        <Empty>Transcripts couldn’t be loaded: {state.message}</Empty>
      ) : state.items.length === 0 ? (
        <Empty>The chosen chats have no messages in this period.</Empty>
      ) : (
        <>
          {state.items.map((t, i) => (
            <Transcript key={t.id} t={t} tf={tf} first={i === 0} />
          ))}
          {state.missing > 0 && <p className="sr-note">{n(state.missing)} chosen chat(s) had no messages in this period.</p>}
        </>
      )}
    </Section>
  );
}

// ── The document ──────────────────────────────────────────────────────────

export function ReportDocument({
  report,
  lineLabel,
  generatedBy,
  transcripts,
}: {
  report: SupervisionReport;
  lineLabel: string;
  generatedBy: string;
  transcripts: TranscriptsState;
}) {
  const tz = report.period.timezone || CLINIC_TZ;
  const period = periodLabel(report.period.fromDay, report.period.toDay);
  const refYear = Number(report.period.toDay.slice(0, 4)) || new Date().getFullYear();
  const tf = makeTimeFormat(tz, refYear);
  const generated = makeTimeFormat(tz, 0); // always with the year

  return (
    <div className="sr-sheet">
      <header className="sr-cover">
        <div className="sr-brand">Everlast Wellness</div>
        <h1 className="sr-title">Supervisor report</h1>
        <dl className="sr-meta">
          <div>
            <dt>Period</dt>
            <dd>{period}</dd>
          </div>
          <div>
            <dt>WhatsApp line</dt>
            <dd>{lineLabel}</dd>
          </div>
          <div>
            <dt>Response target</dt>
            <dd>{report.slaMinutes} minutes</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{generated.dateTime(report.generatedAt)}</dd>
          </div>
          <div>
            <dt>By</dt>
            <dd>{generatedBy}</dd>
          </div>
          <div>
            <dt>Time zone</dt>
            <dd>{tz}</dd>
          </div>
        </dl>
      </header>

      <Summary report={report} />
      <Team report={report} />
      <Bookings report={report} tf={tf} />
      <Campaigns report={report} tf={tf} />
      <Chats report={report} tf={tf} />
      <Transcripts state={transcripts} tf={tf} />

      <footer className="sr-end">
        <span>Everlast Wellness — Supervisor report · {period} · {lineLabel}</span>
        <span>Generated {generated.dateTime(report.generatedAt)} by {generatedBy}</span>
      </footer>
    </div>
  );
}
