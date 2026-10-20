// Campaigns — every campaign that started in the period, from sent to booked:
// delivery, reads, replies, booking requests, patients booked, couldn't-book
// reasons, top services and opt-outs. A summary table, then one block each.

import type { CampaignsReport, CampaignsReportCampaign } from "@/types";
import { notBookedReasonLabel } from "../format";
import {
  REASON_ORDER,
  type TimeFormat,
  campaignCategoryLabel,
  campaignStatusLabel,
  orderedEntries,
  percent1,
  share,
} from "./reportFormat";
import { CountTable, Empty, Kpi, ReportCover, ReportEnd, Section, docContext, n, standardFacts } from "./parts";

/** Sum a per-campaign count map over all campaigns. */
function sumMaps(rows: CampaignsReportCampaign[], pick: (c: CampaignsReportCampaign) => Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of rows) for (const [k, v] of Object.entries(pick(c) ?? {})) out[k] = (out[k] ?? 0) + (v ?? 0);
  return out;
}

const pctOf = (part: number, whole: number) => percent1(share(part, whole));

function Totals({ report }: { report: CampaignsReport }) {
  const rows = report.campaigns;
  const t = report.totals;
  if (!t || rows.length === 0) {
    return (
      <Section title="Summary">
        <Empty>No campaign started in this period.</Empty>
      </Section>
    );
  }
  const failed = rows.reduce((a, c) => a + c.failed, 0);
  const requestsBooked = rows.reduce((a, c) => a + c.requestsBooked, 0);
  return (
    <Section title="Summary">
      <div className="sr-kpis sr-kpis-5">
        <Kpi label="Campaigns" value={n(t.campaigns)} />
        <Kpi label="Sent" value={n(t.sent)} sub={failed ? `${n(failed)} failed` : "none failed"} tone={failed > 0 ? "bad" : undefined} />
        <Kpi label="Delivered" value={n(t.delivered)} sub={`${pctOf(t.delivered, t.sent)} of sent`} />
        <Kpi label="Read" value={n(t.read)} sub={`${pctOf(t.read, t.sent)} of sent`} />
        <Kpi label="Replied" value={n(t.replied)} sub={`${pctOf(t.replied, t.sent)} of sent`} />
        <Kpi label="Booking requests" value={n(t.bookingRequests)} sub={`${n(requestsBooked)} booked`} />
        <Kpi label="Patients booked" value={n(t.patientsBooked)} sub={`${pctOf(t.patientsBooked, t.sent)} of sent`} tone={t.patientsBooked > 0 ? "good" : undefined} />
        <Kpi label="Booked of replied" value={pctOf(t.patientsBooked, t.replied)} sub="patients booked ÷ replied" />
        <Kpi label="Appointments booked" value={n(t.appointmentsBooked)} />
        <Kpi label="Opt-outs" value={n(t.optOuts)} sub={`${pctOf(t.optOuts, t.sent)} of sent, within 7 days`} tone={t.optOuts > 0 ? "bad" : undefined} />
      </div>
    </Section>
  );
}

function SummaryTable({ report, tf }: { report: CampaignsReport; tf: TimeFormat }) {
  const rows = report.campaigns;
  if (rows.length === 0) return null;
  const t = report.totals;
  return (
    <Section title="Campaigns at a glance">
      <table className="sr-table sr-table-compact">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Started</th>
            <th className="sr-num">Sent</th>
            <th className="sr-num">Delivered</th>
            <th className="sr-num">Read</th>
            <th className="sr-num">Replied</th>
            <th className="sr-num">Requests</th>
            <th className="sr-num">Patients booked</th>
            <th className="sr-num">Booked % of sent</th>
            <th className="sr-num">Booked % of replied</th>
            <th className="sr-num">Opt-outs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                {c.name}
                <span className="sr-sub">{c.line || "—"}</span>
              </td>
              <td className="sr-nowrap">{tf.short(c.startedAt)}</td>
              <td className="sr-num">{n(c.sent)}</td>
              <td className="sr-num">
                {n(c.delivered)}
                <span className="sr-sub">{percent1(c.rates.delivered)}</span>
              </td>
              <td className="sr-num">
                {n(c.read)}
                <span className="sr-sub">{percent1(c.rates.read)}</span>
              </td>
              <td className="sr-num">
                {n(c.replied)}
                <span className="sr-sub">{percent1(c.rates.replied)}</span>
              </td>
              <td className="sr-num">{n(c.bookingRequests)}</td>
              <td className="sr-num">{n(c.patientsBooked)}</td>
              <td className="sr-num">{percent1(c.rates.booked)}</td>
              <td className="sr-num">{percent1(c.rates.bookedOfReplied)}</td>
              <td className={`sr-num${c.optOuts > 0 ? " sr-bad" : ""}`}>
                {n(c.optOuts)}
                <span className="sr-sub">{percent1(c.rates.optOut)}</span>
              </td>
            </tr>
          ))}
          {t && rows.length > 1 && (
            <tr className="sr-total">
              <td colSpan={2}>Total</td>
              <td className="sr-num">{n(t.sent)}</td>
              <td className="sr-num">{n(t.delivered)}</td>
              <td className="sr-num">{n(t.read)}</td>
              <td className="sr-num">{n(t.replied)}</td>
              <td className="sr-num">{n(t.bookingRequests)}</td>
              <td className="sr-num">{n(t.patientsBooked)}</td>
              <td className="sr-num">{pctOf(t.patientsBooked, t.sent)}</td>
              <td className="sr-num">{pctOf(t.patientsBooked, t.replied)}</td>
              <td className="sr-num">{n(t.optOuts)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="sr-note">
        Rates are of messages sent, except “booked % of replied”. Requests and bookings count only when the campaign is proven or confirmed by an agent.
        Opt-outs = recipients who opted out of the line within 7 days of the send.
      </p>
    </Section>
  );
}

function Overall({ report }: { report: CampaignsReport }) {
  const rows = report.campaigns;
  if (rows.length === 0) return null;
  const reasons = orderedEntries(sumMaps(rows, (c) => c.notBookedReasons), REASON_ORDER).map(([k, v]) => ({ key: k, label: notBookedReasonLabel(k), count: v }));
  const services = Object.entries(sumMaps(rows, (c) => c.services))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => ({ key: k, label: k === "—" ? "Not recorded" : k, count: v, muted: k === "—" }));
  const notBooked = rows.reduce((a, c) => a + c.requestsNotBooked, 0);
  const appts = rows.reduce((a, c) => a + c.appointmentsBooked, 0);
  return (
    <div className="sr-twocol">
      <div>
        <div className="sr-h3">Why campaign requests couldn’t be booked</div>
        <CountTable head={["Reason", "Requests"]} rows={reasons} shareOf={notBooked} empty="No campaign request was closed as couldn’t book." />
      </div>
      <div>
        <div className="sr-h3">Top services booked</div>
        <CountTable head={["Service", "Appointments"]} rows={services} shareOf={appts} empty="No appointments booked from these campaigns." />
      </div>
    </div>
  );
}

function Funnel({ c }: { c: CampaignsReportCampaign }) {
  const steps = [
    { label: "Recipients", value: c.recipients, rate: null as number | null },
    { label: "Sent", value: c.sent, rate: share(c.sent, c.recipients) },
    { label: "Delivered", value: c.delivered, rate: c.rates.delivered },
    { label: "Read", value: c.read, rate: c.rates.read },
    { label: "Replied", value: c.replied, rate: c.rates.replied },
    { label: "Booking requests", value: c.bookingRequests, rate: share(c.bookingRequests, c.sent) },
    { label: "Patients booked", value: c.patientsBooked, rate: c.rates.booked },
  ];
  const max = Math.max(1, c.recipients, c.sent);
  return (
    <div className="sr-funnel">
      {steps.map((s, i) => (
        <div key={s.label} className="sr-funnel-row">
          <span className="sr-bar-label">{s.label}</span>
          <span className="sr-bar-track">
            <span className="sr-bar-fill" style={{ width: `${Math.min(100, (s.value / max) * 100)}%`, opacity: 1 - i * 0.08 }} />
          </span>
          <span className="sr-bar-value">{n(s.value)}</span>
          <span className="sr-pct">{i === 0 ? "" : percent1(s.rate)}</span>
        </div>
      ))}
    </div>
  );
}

function CampaignBlock({ c, tf }: { c: CampaignsReportCampaign; tf: TimeFormat }) {
  const reasons = orderedEntries(c.notBookedReasons, REASON_ORDER).map(([k, v]) => ({ key: k, label: notBookedReasonLabel(k), count: v }));
  const services = Object.entries(c.services ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: k === "—" ? "Not recorded" : k, count: v, muted: k === "—" }));
  return (
    <div className="sr-block">
      <div className="sr-block-head">
        <span className="sr-block-title">{c.name}</span>
        <span className="sr-muted" style={{ fontSize: "8pt" }}>
          {campaignStatusLabel(c.status)}
        </span>
      </div>
      <dl className="sr-facts">
        <div>
          <dt>Line</dt>
          <dd>{c.line || "—"}</dd>
        </div>
        <div>
          <dt>Template</dt>
          <dd>{c.template || "—"}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{campaignCategoryLabel(c.category)}</dd>
        </div>
        <div>
          <dt>Created / approved by</dt>
          <dd>
            {c.createdBy || "—"} / {c.approvedBy || "—"}
          </dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{tf.dateTime(c.startedAt)}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{c.completedAt ? tf.dateTime(c.completedAt) : "—"}</dd>
        </div>
        <div>
          <dt>Failed / skipped</dt>
          <dd className={c.failed > 0 ? "sr-bad" : undefined}>
            {n(c.failed)} / {n(c.skipped)}
          </dd>
        </div>
        <div>
          <dt>Opt-outs (7 days)</dt>
          <dd className={c.optOuts > 0 ? "sr-bad" : undefined}>
            {n(c.optOuts)} · {percent1(c.rates.optOut)}
          </dd>
        </div>
      </dl>
      <Funnel c={c} />
      <div className="sr-threecol" style={{ marginTop: "8pt" }}>
        <div>
          <div className="sr-h3" style={{ marginTop: 0 }}>
            Booking requests
          </div>
          <table className="sr-table sr-table-compact">
            <tbody>
              <tr>
                <td>Booked</td>
                <td className="sr-num sr-good">{n(c.requestsBooked)}</td>
              </tr>
              <tr>
                <td>Couldn’t book</td>
                <td className="sr-num">{n(c.requestsNotBooked)}</td>
              </tr>
              <tr>
                <td>Still open</td>
                <td className={`sr-num${c.requestsOpen > 0 ? " sr-bad" : ""}`}>{n(c.requestsOpen)}</td>
              </tr>
              <tr className="sr-total">
                <td>Counted for this campaign</td>
                <td className="sr-num">{n(c.bookingRequests)}</td>
              </tr>
            </tbody>
          </table>
          {c.suggestedRequests > 0 && (
            <p className="sr-note">
              + {n(c.suggestedRequests)} request{c.suggestedRequests === 1 ? "" : "s"} from people who got this campaign (not confirmed it brought them).
            </p>
          )}
          <p className="sr-note">
            {n(c.appointmentsBooked)} appointment{c.appointmentsBooked === 1 ? "" : "s"} for {n(c.patientsBooked)} patient{c.patientsBooked === 1 ? "" : "s"} ·{" "}
            {percent1(c.rates.bookedOfReplied)} of those who replied.
          </p>
        </div>
        <div>
          <div className="sr-h3" style={{ marginTop: 0 }}>
            Couldn’t book because
          </div>
          <CountTable head={["Reason", "Requests"]} rows={reasons} empty="None." />
        </div>
        <div>
          <div className="sr-h3" style={{ marginTop: 0 }}>
            Services booked
          </div>
          <CountTable head={["Service", "Appts"]} rows={services} empty="None." />
        </div>
      </div>
    </div>
  );
}

function Details({ report, tf }: { report: CampaignsReport; tf: TimeFormat }) {
  const rows = report.campaigns;
  if (rows.length === 0) return null;
  return (
    <Section title="Each campaign" aside={`${n(rows.length)} campaign${rows.length === 1 ? "" : "s"}, oldest first`} pageBreak>
      {rows.map((c) => (
        <CampaignBlock key={c.id} c={c} tf={tf} />
      ))}
      <p className="sr-note">Funnel percentages are of messages sent (recipients → sent: of recipients).</p>
    </Section>
  );
}

export function CampaignsDocument({ report, lineLabel, generatedBy }: { report: CampaignsReport; lineLabel: string; generatedBy: string }) {
  const ctx = docContext(report);
  return (
    <div className="sr-sheet">
      <ReportCover title="Campaigns" facts={standardFacts(ctx, report, lineLabel, generatedBy, { label: "Covers", value: "Campaigns started in the period" })} />
      <Totals report={report} />
      <SummaryTable report={report} tf={ctx.tf} />
      <Overall report={report} />
      <Details report={report} tf={ctx.tf} />
      <ReportEnd
        left={`Everlast Wellness — Campaigns · ${ctx.period} · ${lineLabel}`}
        right={`Generated ${ctx.generated.dateTime(report.generatedAt)} by ${generatedBy}`}
      />
    </div>
  );
}
