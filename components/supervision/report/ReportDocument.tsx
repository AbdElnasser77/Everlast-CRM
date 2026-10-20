// The Supervisor report itself — what prints. Plain semantic markup styled by
// the .sr-* classes in reportFormat.ts, sized in points so the on-screen
// preview and the PDF read the same.

import type { ReportTranscript, SupervisionReport } from "@/types";
import { formatMinutes, formatPhone, parseStructured, personName } from "../format";
import {
  OUTCOME_LABEL,
  outcomeCounts,
  ROLE_LABEL,
  makeTimeFormat,
  outcomeLabel,
  percent,
  periodLabel,
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
  // Follow-ups set and cancelled; legacy outcomes (Booked / Not interested / No answer) aren't listed.
  const outcomeRows = outcomeCounts(s.outcomes);
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
        <Kpi label="Late responses" value={n(s.lateResponses)} sub={`${report.slaMinutes} min or more`} tone={s.lateResponses > 0 ? "bad" : undefined} />
        <Kpi label="Unanswered" value={n(s.unanswered)} sub="patient still waiting" tone={s.unanswered > 0 ? "bad" : undefined} />
      </div>

      <div className="sr-twocol">
        <div>
          <div className="sr-h3">Follow-ups by staff</div>
          <table className="sr-table">
            <thead>
              <tr>
                <th>Follow-up</th>
                <th className="sr-num">Times</th>
              </tr>
            </thead>
            <tbody>
              {outcomeRows.map(([k, v]) => (
                <tr key={k}>
                  <td>{OUTCOME_LABEL[k]}</td>
                  <td className="sr-num">{n(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <th className="sr-num">Follow-up changes</th>
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
                <td className="sr-num">{n(sum((a) => a.outcomesSet))}</td>
              </tr>
            </tbody>
          </table>
          <p className="sr-note">
            Late = a first response that took {report.slaMinutes} minutes or more of working time. A chat handled by two people counts for each, so the
            chats total can exceed the number of chats.
          </p>
        </>
      )}
    </Section>
  );
}

function Campaigns({ report, tf }: { report: SupervisionReport; tf: TimeFormat }) {
  const rows = report.campaigns;
  const t = rows.reduce(
    (a, c) => ({ recipients: a.recipients + c.recipients, sent: a.sent + c.sent, failed: a.failed + c.failed, replied: a.replied + c.replied }),
    { recipients: 0, sent: 0, failed: 0, replied: 0 },
  );
  const replyRate = (replied: number, sent: number) => (sent > 0 ? percent((replied / sent) * 100) : "—");
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
                <th className="sr-num">Reply rate</th>
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
                  <td className="sr-num">{replyRate(c.replied, c.sent)}</td>
                </tr>
              ))}
              {rows.length > 1 && (
                <tr className="sr-total">
                  <td colSpan={3}>Total</td>
                  <td className="sr-num">{n(t.recipients)}</td>
                  <td className="sr-num">{n(t.sent)}</td>
                  <td className="sr-num">{n(t.failed)}</td>
                  <td className="sr-num">{n(t.replied)}</td>
                  <td className="sr-num">{replyRate(t.replied, t.sent)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="sr-note">Reply rate = replied ÷ sent.</p>
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
                <th>Follow-up</th>
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
