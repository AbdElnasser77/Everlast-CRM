// Campaigns — every campaign that started in the period, from sent to replied:
// delivery, reads, replies, failures and opt-outs. A summary table, then one
// block each.

import type { CampaignsReport, CampaignsReportCampaign } from "@/types";
import { type TimeFormat, campaignCategoryLabel, campaignStatusLabel, percent1, share } from "./reportFormat";
import { Empty, Kpi, ReportCover, ReportEnd, Section, docContext, n, standardFacts } from "./parts";

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
  return (
    <Section title="Summary">
      <div className="sr-kpis sr-kpis-3">
        <Kpi label="Campaigns" value={n(t.campaigns)} />
        <Kpi label="Sent" value={n(t.sent)} sub={failed ? `${n(failed)} failed` : "none failed"} tone={failed > 0 ? "bad" : undefined} />
        <Kpi label="Delivered" value={n(t.delivered)} sub={`${pctOf(t.delivered, t.sent)} of sent`} />
        <Kpi label="Read" value={n(t.read)} sub={`${pctOf(t.read, t.sent)} of sent`} />
        <Kpi label="Replied" value={n(t.replied)} sub={`${pctOf(t.replied, t.sent)} of sent`} />
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
            <th className="sr-num">Failed</th>
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
              <td className={`sr-num${c.failed > 0 ? " sr-bad" : ""}`}>{n(c.failed)}</td>
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
              <td className="sr-num">{n(rows.reduce((a, c) => a + c.failed, 0))}</td>
              <td className="sr-num">{n(t.optOuts)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="sr-note">
        Rates are of messages sent. Opt-outs = recipients who opted out of the line within 7 days of the send.
      </p>
    </Section>
  );
}

function Funnel({ c }: { c: CampaignsReportCampaign }) {
  const steps = [
    { label: "Recipients", value: c.recipients, rate: null as number | null },
    { label: "Sent", value: c.sent, rate: share(c.sent, c.recipients) },
    { label: "Delivered", value: c.delivered, rate: c.rates.delivered },
    { label: "Read", value: c.read, rate: c.rates.read },
    { label: "Replied", value: c.replied, rate: c.rates.replied },
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
      <Details report={report} tf={ctx.tf} />
      <ReportEnd
        left={`Everlast Wellness — Campaigns · ${ctx.period} · ${lineLabel}`}
        right={`Generated ${ctx.generated.dateTime(report.generatedAt)} by ${generatedBy}`}
      />
    </div>
  );
}
