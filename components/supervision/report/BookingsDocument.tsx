// Bookings & couldn't book — every booking request opened or closed in the
// period: what was asked, where the patient came from, who took it and how
// fast, the appointments booked, or why it couldn't be booked.

import type { BookingsReport, BookingsReportRequest } from "@/types";
import { requestedPairs } from "@/lib/bookingRequests";
import { formatMinutes, formatPhone, notBookedReasonLabel } from "../format";
import {
  LEAD_SOURCE_REPORT_LAST,
  LEAD_SOURCE_REPORT_ORDER,
  OPENED_VIA_LABEL,
  REASON_ORDER,
  REQUEST_STATUS_ORDER,
  SOURCE_STATUS_LABEL,
  type TimeFormat,
  leadSourceReportLabel,
  orderedEntries,
  percent,
  requestStatusLabel,
  share,
} from "./reportFormat";
import { CountTable, Empty, Kpi, ReportCover, ReportEnd, Section, docContext, n, standardFacts } from "./parts";

/** Where the patient came from, as one line + detail. */
export function requestSourceText(r: Pick<BookingsReportRequest, "leadSource" | "sourceStatus" | "campaign" | "suggestedCampaign">): {
  main: string;
  detail: string | null;
  muted: boolean;
} {
  if (r.leadSource && r.sourceStatus !== "SUGGESTED") {
    const how = r.sourceStatus ? SOURCE_STATUS_LABEL[r.sourceStatus] ?? null : null;
    const camp = r.leadSource === "CAMPAIGN" && r.campaign ? r.campaign : null;
    return { main: leadSourceReportLabel(r.leadSource), detail: [camp, how].filter(Boolean).join(" · ") || null, muted: false };
  }
  if (r.campaign && r.sourceStatus !== "SUGGESTED") {
    return { main: "Campaign", detail: r.campaign, muted: false };
  }
  if (r.suggestedCampaign) return { main: "Suggested campaign", detail: `${r.suggestedCampaign} (not confirmed)`, muted: true };
  return { main: "Not recorded", detail: null, muted: true };
}

function Summary({ report }: { report: BookingsReport }) {
  const s = report.summary;
  const booked = s.byStatus.BOOKED ?? 0;
  const notBooked = s.byStatus.NOT_BOOKED ?? 0;
  const open = (s.byStatus.NEW ?? 0) + (s.byStatus.IN_PROGRESS ?? 0);
  const flow = s.byOpenedVia.FLOW ?? 0;
  const agent = s.byOpenedVia.AGENT ?? 0;
  return (
    <Section title="Summary">
      <div className="sr-kpis sr-kpis-5">
        <Kpi label="Booking requests" value={n(s.requests)} sub={`Flow ${n(flow)} · Agent ${n(agent)}`} />
        <Kpi label="Booked" value={n(booked)} tone={booked > 0 ? "good" : undefined} />
        <Kpi label="Couldn’t book" value={n(notBooked)} />
        <Kpi label="Still open" value={n(open)} sub={`${n(s.byStatus.NEW ?? 0)} not picked up`} tone={open > 0 ? "bad" : undefined} />
        <Kpi label="Booking rate" value={percent(s.bookingRate)} sub="booked ÷ (booked + couldn’t book)" />
        <Kpi label="Patients booked" value={n(s.patientsBooked)} />
        <Kpi label="Appointments booked" value={n(s.appointmentsBooked)} sub={`${n(s.appointmentsCancelled)} cancelled`} />
        <Kpi label="Avg time to pick up" value={formatMinutes(s.avgMinutesToPickUp)} sub="working time" />
        <Kpi label="Avg time to close" value={formatMinutes(s.avgMinutesToClose)} sub="booked or couldn’t book" />
        <Kpi label="Opened by the booking flow" value={percent(share(flow, s.requests))} sub={`${n(flow)} of ${n(s.requests)}`} />
      </div>
    </Section>
  );
}

function Breakdown({ report }: { report: BookingsReport }) {
  const s = report.summary;
  const notBooked = s.byStatus.NOT_BOOKED ?? 0;
  const statusRows = orderedEntries(s.byStatus, REQUEST_STATUS_ORDER, { keepZeros: true }).map(([k, v]) => ({ key: k, label: requestStatusLabel(k), count: v }));
  const reasonRows = orderedEntries(s.notBookedReasons, REASON_ORDER).map(([k, v]) => ({ key: k, label: notBookedReasonLabel(k), count: v }));
  const sourceRows = orderedEntries(s.byLeadSource, LEAD_SOURCE_REPORT_ORDER, { last: LEAD_SOURCE_REPORT_LAST }).map(([k, v]) => ({
    key: k,
    label: leadSourceReportLabel(k),
    count: v,
    muted: k === "UNKNOWN" || k === "SUGGESTED",
  }));
  const viaRows = orderedEntries(s.byOpenedVia, ["FLOW", "AGENT"]).map(([k, v]) => ({ key: k, label: OPENED_VIA_LABEL[k] ?? k, count: v }));

  return (
    <Section title="Breakdown">
      <div className="sr-twocol">
        <div>
          <div className="sr-h3">By status</div>
          <CountTable head={["Status", "Requests"]} rows={statusRows} shareOf={s.requests} empty="No booking requests in this period." />
        </div>
        <div>
          <div className="sr-h3">Why requests couldn’t be booked</div>
          <CountTable head={["Reason", "Requests"]} rows={reasonRows} shareOf={notBooked} empty="No request was closed as couldn’t book." />
        </div>
      </div>
      <div className="sr-twocol">
        <div>
          <div className="sr-h3">Where patients came from</div>
          <CountTable head={["Source", "Requests"]} rows={sourceRows} shareOf={s.requests} empty="No booking requests in this period." />
          <p className="sr-note">
            Campaign = proven (came through its booking flow or replied to it) or confirmed by an agent. “Suggested” = they received a campaign
            lately but nobody has confirmed it brought them.
          </p>
        </div>
        <div>
          <div className="sr-h3">How requests were opened</div>
          <CountTable head={["Opened by", "Requests"]} rows={viaRows} shareOf={s.requests} empty="No booking requests in this period." />
        </div>
      </div>
    </Section>
  );
}

function PerAgent({ report }: { report: BookingsReport }) {
  const rows = [...report.byAgent].sort((a, b) => b.booked - a.booked || b.notBooked - a.notBooked);
  const t = rows.reduce((a, r) => ({ booked: a.booked + r.booked, notBooked: a.notBooked + r.notBooked, appts: a.appts + r.appointments }), { booked: 0, notBooked: 0, appts: 0 });
  return (
    <Section title="Per agent" aside="by the person who closed the request">
      {rows.length === 0 ? (
        <Empty>No request was closed in this period.</Empty>
      ) : (
        <table className="sr-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th className="sr-num">Booked</th>
              <th className="sr-num">Couldn’t book</th>
              <th className="sr-num">Booking rate</th>
              <th className="sr-num">Appointments</th>
              <th className="sr-num">Avg time to close</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.agent}>
                <td>{a.agent}</td>
                <td className="sr-num">{n(a.booked)}</td>
                <td className="sr-num">{n(a.notBooked)}</td>
                <td className="sr-num">{percent(share(a.booked, a.booked + a.notBooked))}</td>
                <td className="sr-num">{n(a.appointments)}</td>
                <td className="sr-num">{formatMinutes(a.avgMinutesToClose)}</td>
              </tr>
            ))}
            {rows.length > 1 && (
              <tr className="sr-total">
                <td>Total</td>
                <td className="sr-num">{n(t.booked)}</td>
                <td className="sr-num">{n(t.notBooked)}</td>
                <td className="sr-num">{percent(share(t.booked, t.booked + t.notBooked))}</td>
                <td className="sr-num">{n(t.appts)}</td>
                <td className="sr-num">{formatMinutes(report.summary.avgMinutesToClose)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function RequestRow({ r, tf }: { r: BookingsReportRequest; tf: TimeFormat }) {
  const asked = requestedPairs(r.requested);
  const src = requestSourceText(r);
  return (
    <tr>
      <td className="sr-nowrap">
        {tf.date(r.createdAt)}
        <span className="sr-sub">{tf.time(r.createdAt)}</span>
      </td>
      <td>
        <span dir="auto">{r.customer.name || "—"}</span>
        <span className="sr-sub sr-nowrap">{formatPhone(r.customer.phone)}</span>
      </td>
      <td>{r.line || "—"}</td>
      <td>
        {asked.length === 0 ? (
          <span className="sr-muted">—</span>
        ) : (
          <ul className="sr-list">
            {asked.map((p) => (
              <li key={p.key} dir="auto">
                <span className="sr-muted">{p.label}:</span> {p.value}
              </li>
            ))}
          </ul>
        )}
        {r.note ? (
          <span className="sr-sub" dir="auto">
            Note: {r.note}
          </span>
        ) : null}
      </td>
      <td>
        <span className={src.muted ? "sr-muted" : undefined}>{src.main}</span>
        {src.detail ? <span className="sr-sub">{src.detail}</span> : null}
        <span className="sr-sub">via {OPENED_VIA_LABEL[r.openedVia]?.toLowerCase() ?? r.openedVia}</span>
      </td>
      <td className={r.status === "BOOKED" ? "sr-good" : r.status === "NEW" ? "sr-bad" : undefined}>{requestStatusLabel(r.status)}</td>
      <td>
        {r.claimedBy || <span className="sr-muted">—</span>}
        {r.claimedAt ? <span className="sr-sub sr-nowrap">{tf.short(r.claimedAt)}</span> : null}
      </td>
      <td>
        {r.handledBy || <span className="sr-muted">—</span>}
        {r.handledAt ? <span className="sr-sub sr-nowrap">{tf.short(r.handledAt)}</span> : null}
      </td>
      <td className="sr-num">
        {formatMinutes(r.minutesToPickUp)}
        <span className="sr-sub">{formatMinutes(r.minutesToClose)}</span>
      </td>
      <td>
        {r.appointments.length === 0 ? (
          <span className="sr-muted">—</span>
        ) : (
          <ul className="sr-list">
            {r.appointments.map((a) => (
              <li key={a.id} className={a.status === "CANCELLED" ? "sr-struck" : undefined}>
                <strong>{a.service || "Service not recorded"}</strong>
                {a.status === "CANCELLED" ? <span className="sr-tag">Cancelled</span> : null}
                <span className="sr-sub">
                  {tf.short(a.appointmentAt)}
                  {a.doctor ? ` · ${a.doctor}` : ""}
                  {a.dok32Ref ? ` · Dok32 ${a.dok32Ref}` : ""}
                </span>
                {a.bookedBy ? <span className="sr-sub">booked by {a.bookedBy}</span> : null}
                {a.note ? (
                  <span className="sr-sub" dir="auto">
                    {a.note}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td>
        {r.status === "NOT_BOOKED" ? notBookedReasonLabel(r.notBookedReason) : <span className="sr-muted">—</span>}
        {r.notBookedNote ? (
          <span className="sr-sub" dir="auto">
            {r.notBookedNote}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function Requests({ report, tf }: { report: BookingsReport; tf: TimeFormat }) {
  const rows = report.requests;
  return (
    <Section title="All requests" aside={rows.length ? `${n(rows.length)} request${rows.length === 1 ? "" : "s"}, oldest first` : undefined} pageBreak>
      {rows.length === 0 ? (
        <Empty>No booking requests were opened or closed in this period.</Empty>
      ) : (
        <>
          <table className="sr-table sr-table-tiny">
            <thead>
              <tr>
                <th>Opened</th>
                <th>Patient</th>
                <th>Line</th>
                <th>Asked for</th>
                <th>Source</th>
                <th>Status</th>
                <th>Taken by</th>
                <th>Handled by</th>
                <th className="sr-num">
                  Pick up
                  <span className="sr-sub">Close</span>
                </th>
                <th>Appointments</th>
                <th>Reason / note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RequestRow key={r.id} r={r} tf={tf} />
              ))}
            </tbody>
          </table>
          <p className="sr-note">Pick up and close are working time from the request. Struck-through appointments were cancelled.</p>
        </>
      )}
    </Section>
  );
}

export function BookingsDocument({ report, lineLabel, generatedBy }: { report: BookingsReport; lineLabel: string; generatedBy: string }) {
  const ctx = docContext(report);
  return (
    <div className="sr-sheet">
      <ReportCover
        title="Bookings & couldn’t book"
        facts={standardFacts(ctx, report, lineLabel, generatedBy, { label: "Covers", value: "Requests opened or closed in the period" })}
      />
      <Summary report={report} />
      <Breakdown report={report} />
      <PerAgent report={report} />
      <Requests report={report} tf={ctx.tf} />
      <ReportEnd
        left={`Everlast Wellness — Bookings & couldn’t book · ${ctx.period} · ${lineLabel}`}
        right={`Generated ${ctx.generated.dateTime(report.generatedAt)} by ${generatedBy}`}
      />
    </div>
  );
}
