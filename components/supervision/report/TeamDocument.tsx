// Team performance — speed (average, median, slowest 10%, bands), volume and
// results per person, the team's day-by-day trend and the busiest hours.
// Charts are plain CSS bars so they print exactly as previewed.

import type { TeamReport, TeamReportAgent } from "@/types";
import { formatMinutes } from "../format";
import { BAND_LABEL, BAND_ORDER, OUTCOME_LABEL, OUTCOME_ORDER, ROLE_LABEL, parseDay, percent, share } from "./reportFormat";
import { BandLegend, BandStack, BarRow, Empty, Kpi, MiniBar, ReportCover, ReportEnd, Section, docContext, n, standardFacts } from "./parts";

const agentName = (a: Pick<TeamReportAgent, "name" | "username">) => a.name || a.username;

function slaTone(p: number | null): "bad" | "good" | undefined {
  if (p === null) return undefined;
  return p < 80 ? "bad" : "good";
}

function TeamSummary({ report }: { report: TeamReport }) {
  const t = report.team;
  return (
    <Section title="Team">
      <div className="sr-kpis">
        <Kpi label="Chats" value={n(t.chats)} sub="with a message in the period" />
        <Kpi label="Patient messages" value={n(t.patientMessages)} />
        <Kpi label="Staff replies" value={n(t.staffReplies)} />
        <Kpi label="First responses" value={n(t.firstResponses)} />
        <Kpi label="Avg first response" value={formatMinutes(t.avgResponseMinutes)} sub="working time" />
        <Kpi label="Median first response" value={formatMinutes(t.medianResponseMinutes)} sub="half were faster" />
        <Kpi label="Slowest 10% from" value={formatMinutes(t.p90ResponseMinutes)} sub="90th percentile" />
        <Kpi label={`Answered within ${report.slaMinutes} min`} value={percent(t.withinSlaPercent)} tone={slaTone(t.withinSlaPercent)} />
        <Kpi label="Late responses" value={n(t.lateResponses)} sub={`${report.slaMinutes} min or more`} tone={t.lateResponses > 0 ? "bad" : undefined} />
        <Kpi label="Unanswered" value={n(t.unanswered)} sub="patient still waiting" tone={t.unanswered > 0 ? "bad" : undefined} />
        <Kpi label="People active" value={n(report.agents.filter((a) => a.replies > 0).length)} sub={`${n(report.agents.length)} with any activity`} />
      </div>
    </Section>
  );
}

function Bands({ report }: { report: TeamReport }) {
  const b = report.team.responseBands;
  const total = BAND_ORDER.reduce((a, k) => a + (b[k] ?? 0), 0);
  const max = Math.max(0, ...BAND_ORDER.map((k) => b[k] ?? 0));
  return (
    <Section title="How fast patients got a first response" aside={total ? `${n(total)} first responses` : undefined}>
      {total === 0 ? (
        <Empty>No first responses in this period.</Empty>
      ) : (
        <div className="sr-bars">
          {BAND_ORDER.map((k) => (
            <BarRow
              key={k}
              label={BAND_LABEL[k]}
              value={b[k] ?? 0}
              max={max}
              className={`sr-band-${k}`}
              display={
                <>
                  {n(b[k] ?? 0)} <span className="sr-muted">· {percent(share(b[k] ?? 0, total))}</span>
                </>
              }
            />
          ))}
        </div>
      )}
      <p className="sr-note">Working time from the patient’s message to the first staff reply. Quiet hours don’t count.</p>
    </Section>
  );
}

function AgentSpeed({ report }: { report: TeamReport }) {
  const rows = report.agents;
  return (
    <Section title="Per person — speed" pageBreak>
      {rows.length === 0 ? (
        <Empty>No staff activity in this period.</Empty>
      ) : (
        <>
          <BandLegend />
          <table className="sr-table sr-table-compact">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th className="sr-num">Active days</th>
                <th className="sr-num">Chats</th>
                <th className="sr-num">Replies</th>
                <th className="sr-num">First resp.</th>
                <th className="sr-num">Avg</th>
                <th className="sr-num">Median</th>
                <th className="sr-num">Slowest 10%</th>
                <th className="sr-num">Within {report.slaMinutes}m</th>
                <th className="sr-num">Late</th>
                <th>Response bands</th>
                <th className="sr-num">Open now</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    {agentName(a)}
                    {!a.isActive && <span className="sr-sub">inactive</span>}
                  </td>
                  <td className="sr-nowrap">{ROLE_LABEL[a.role] ?? a.role}</td>
                  <td className="sr-num">{n(a.activeDays)}</td>
                  <td className="sr-num">{n(a.chatsHandled)}</td>
                  <td className="sr-num">{n(a.replies)}</td>
                  <td className="sr-num">{n(a.firstResponses)}</td>
                  <td className="sr-num">{formatMinutes(a.avgResponseMinutes)}</td>
                  <td className="sr-num">{formatMinutes(a.medianResponseMinutes)}</td>
                  <td className="sr-num">{formatMinutes(a.p90ResponseMinutes)}</td>
                  <td className={`sr-num${a.withinSlaPercent !== null && a.withinSlaPercent < 80 ? " sr-bad" : ""}`}>{percent(a.withinSlaPercent)}</td>
                  <td className={`sr-num${a.lateResponses > 0 ? " sr-bad" : ""}`}>{n(a.lateResponses)}</td>
                  <td style={{ minWidth: "70pt" }}>
                    <BandStack bands={a.responseBands} />
                  </td>
                  <td className="sr-num">{n(a.openChatsNow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sr-note">
            Chats = chats the person replied in. Slowest 10% = the response time 90% of their first responses beat. Open now = chats assigned to them
            and not resolved, at the time the report was made.
          </p>
        </>
      )}
    </Section>
  );
}

function AgentResults({ report }: { report: TeamReport }) {
  const rows = report.agents;
  if (rows.length === 0) return null;
  // Follow-ups set / cancelled. Legacy outcomes (Booked / Not interested / No answer) in old periods aren't listed.
  const outcomeKeys = OUTCOME_ORDER;
  const sum = (f: (a: TeamReportAgent) => number) => rows.reduce((t, a) => t + f(a), 0);
  return (
    <Section title="Per person — results">
      <table className="sr-table sr-table-compact">
        <thead>
          <tr>
            <th>Name</th>
            {outcomeKeys.map((k) => (
              <th key={k} className="sr-num">
                {OUTCOME_LABEL[k]}
              </th>
            ))}
            <th className="sr-num">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{agentName(a)}</td>
              {outcomeKeys.map((k) => (
                <td key={k} className="sr-num">
                  {n(a.outcomes[k] ?? 0)}
                </td>
              ))}
              <td className="sr-num">{n(a.notesWritten)}</td>
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className="sr-total">
              <td>Total</td>
              {outcomeKeys.map((k) => (
                <td key={k} className="sr-num">
                  {n(sum((a) => a.outcomes[k] ?? 0))}
                </td>
              ))}
              <td className="sr-num">{n(sum((a) => a.notesWritten))}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="sr-note">
        Follow up / Follow-up cancelled = times the person set or cancelled a follow-up on a chat.
      </p>
    </Section>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayName(day: string): string {
  const d = parseDay(day);
  return d ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : day;
}

function Daily({ report }: { report: TeamReport }) {
  const rows = report.daily;
  const maxMsgs = Math.max(0, ...rows.map((d) => d.patientMessages));
  const sum = (f: (d: TeamReport["daily"][number]) => number) => rows.reduce((t, d) => t + f(d), 0);
  return (
    <Section title="Day by day" pageBreak>
      {rows.length === 0 ? (
        <Empty>No days in this period.</Empty>
      ) : (
        <table className="sr-table sr-table-compact">
          <thead>
            <tr>
              <th>Day</th>
              <th>Patient messages</th>
              <th className="sr-num">Chats</th>
              <th className="sr-num">Staff replies</th>
              <th className="sr-num">Avg first response</th>
              <th className="sr-num">Late</th>
              <th className="sr-num">Unanswered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.day}>
                <td className="sr-nowrap">{dayName(d.day)}</td>
                <td className="sr-nowrap">
                  <MiniBar value={d.patientMessages} max={maxMsgs} />
                  {n(d.patientMessages)}
                </td>
                <td className="sr-num">{n(d.chats)}</td>
                <td className="sr-num">{n(d.staffReplies)}</td>
                <td className="sr-num">{formatMinutes(d.avgFirstResponseMinutes)}</td>
                <td className={`sr-num${d.lateResponses > 0 ? " sr-bad" : ""}`}>{n(d.lateResponses)}</td>
                <td className={`sr-num${d.unanswered > 0 ? " sr-bad" : ""}`}>{n(d.unanswered)}</td>
              </tr>
            ))}
            {rows.length > 1 && (
              <tr className="sr-total">
                <td>Total</td>
                <td>{n(sum((d) => d.patientMessages))}</td>
                <td className="sr-num sr-muted">—</td>
                <td className="sr-num">{n(sum((d) => d.staffReplies))}</td>
                <td className="sr-num">{formatMinutes(report.team.avgResponseMinutes)}</td>
                <td className="sr-num">{n(sum((d) => d.lateResponses))}</td>
                <td className="sr-num">{n(sum((d) => d.unanswered))}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <p className="sr-note">A chat active on several days counts on each, so daily chats don’t add up to the period’s total.</p>
    </Section>
  );
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function Hours({ report }: { report: TeamReport }) {
  const hours = Array.from({ length: 24 }, (_, h) => report.hourly.find((x) => x.hour === h) ?? { hour: h, patientMessages: 0, staffReplies: 0 });
  const max = Math.max(0, ...hours.map((h) => Math.max(h.patientMessages, h.staffReplies)));
  const busiest = [...hours].sort((a, b) => b.patientMessages - a.patientMessages).filter((h) => h.patientMessages > 0).slice(0, 3);
  return (
    <Section title="Busiest hours" aside="clinic time">
      {max === 0 ? (
        <Empty>No messages in this period.</Empty>
      ) : (
        <>
          <div className="sr-legend">
            <span>
              <i className="sr-hour-p" />
              Patient messages
            </span>
            <span>
              <i className="sr-hour-s" />
              Staff replies
            </span>
          </div>
          <div className="sr-hours">
            {hours.map((h) => (
              <div key={h.hour} className="sr-hour" title={`${hh(h.hour)} — ${h.patientMessages} patient, ${h.staffReplies} staff`}>
                <span className="sr-hour-p" style={{ height: `${(h.patientMessages / max) * 100}%` }} />
                <span className="sr-hour-s" style={{ height: `${(h.staffReplies / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="sr-hour-labels">
            {hours.map((h) => (
              <span key={h.hour}>{h.hour % 3 === 0 ? String(h.hour).padStart(2, "0") : ""}</span>
            ))}
          </div>
          <p className="sr-note">
            Busiest:{" "}
            {busiest.map((h, i) => (
              <span key={h.hour}>
                {i > 0 ? ", " : ""}
                <strong>
                  {hh(h.hour)}–{hh((h.hour + 1) % 24)}
                </strong>{" "}
                ({n(h.patientMessages)} patient messages)
              </span>
            ))}
            .
          </p>
          <table className="sr-table sr-table-tiny" style={{ marginTop: "6pt" }}>
            <thead>
              <tr>
                <th>Hour</th>
                {hours.map((h) => (
                  <th key={h.hour} className="sr-num">
                    {String(h.hour).padStart(2, "0")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="sr-nowrap">Patient</td>
                {hours.map((h) => (
                  <td key={h.hour} className="sr-num">
                    {h.patientMessages || ""}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sr-nowrap">Staff</td>
                {hours.map((h) => (
                  <td key={h.hour} className="sr-num">
                    {h.staffReplies || ""}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </>
      )}
    </Section>
  );
}

export function TeamDocument({ report, lineLabel, generatedBy }: { report: TeamReport; lineLabel: string; generatedBy: string }) {
  const ctx = docContext(report);
  return (
    <div className="sr-sheet">
      <ReportCover title="Team performance" facts={standardFacts(ctx, report, lineLabel, generatedBy, { label: "Response target", value: `${report.slaMinutes} minutes` })} />
      <TeamSummary report={report} />
      <Bands report={report} />
      <Hours report={report} />
      <AgentSpeed report={report} />
      <AgentResults report={report} />
      <Daily report={report} />
      <ReportEnd
        left={`Everlast Wellness — Team performance · ${ctx.period} · ${lineLabel}`}
        right={`Generated ${ctx.generated.dateTime(report.generatedAt)} by ${generatedBy}`}
      />
    </div>
  );
}
