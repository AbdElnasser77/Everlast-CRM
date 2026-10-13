// Building blocks shared by every printed report: cover, sections, KPI tiles,
// count tables and CSS bars. Plain markup styled by the .sr-* classes in
// reportFormat.ts (literal colours, so the sheet stays light in dark mode and
// prints the same).

import type { ReactNode } from "react";
import { BAND_LABEL, BAND_ORDER, CLINIC_TZ, makeTimeFormat, percent, periodLabel } from "./reportFormat";
import type { DetailedReportMeta, ResponseBands } from "@/types";

export const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-GB"));

export function Empty({ children }: { children: ReactNode }) {
  return <div className="sr-empty">{children}</div>;
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bad" | "good" }) {
  return (
    <div className={`sr-kpi${tone === "bad" ? " sr-kpi-bad" : tone === "good" ? " sr-kpi-good" : ""}`}>
      <div className="sr-kpi-label">{label}</div>
      <div className="sr-kpi-value">{value}</div>
      {sub ? <div className="sr-kpi-sub">{sub}</div> : null}
    </div>
  );
}

export function Section({ title, aside, pageBreak, children }: { title: string; aside?: ReactNode; pageBreak?: boolean; children: ReactNode }) {
  return (
    <section className={`sr-section${pageBreak ? " sr-break" : ""}`}>
      <h2 className="sr-h2">
        <span>{title}</span>
        {aside ? <small>{aside}</small> : null}
      </h2>
      {children}
    </section>
  );
}

/** The report's head: brand, title and a grid of facts (period, line, generated…). */
export function ReportCover({ title, facts }: { title: string; facts: { label: string; value: ReactNode }[] }) {
  return (
    <header className="sr-cover">
      <div className="sr-brand">Everlast Wellness</div>
      <h1 className="sr-title">{title}</h1>
      <dl className="sr-meta">
        {facts.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

export function ReportEnd({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <footer className="sr-end">
      <span>{left}</span>
      <span>{right}</span>
    </footer>
  );
}

/** Label / count table with an optional share column and total row. */
export function CountTable({
  head,
  rows,
  shareOf,
  total = true,
  empty = "Nothing in this period.",
}: {
  head: [string, string];
  rows: { key: string; label: ReactNode; count: number; muted?: boolean }[];
  /** Show each row's share of this number (usually the total). */
  shareOf?: number;
  total?: boolean;
  empty?: ReactNode;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const sum = rows.reduce((a, r) => a + r.count, 0);
  return (
    <table className="sr-table">
      <thead>
        <tr>
          <th>{head[0]}</th>
          <th className="sr-num">{head[1]}</th>
          {shareOf !== undefined && <th className="sr-num">Share</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className={r.muted ? "sr-muted" : undefined}>{r.label}</td>
            <td className="sr-num">{n(r.count)}</td>
            {shareOf !== undefined && <td className="sr-num sr-muted">{shareOf > 0 ? percent((r.count / shareOf) * 100) : "—"}</td>}
          </tr>
        ))}
        {total && rows.length > 1 && (
          <tr className="sr-total">
            <td>Total</td>
            <td className="sr-num">{n(sum)}</td>
            {shareOf !== undefined && <td className="sr-num">{shareOf > 0 ? percent((sum / shareOf) * 100) : "—"}</td>}
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** Width as a CSS percentage of max (0 when max is 0). */
export const widthPct = (v: number, max: number) => `${max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%`;

/** A labelled horizontal bar. */
export function BarRow({ label, value, max, display, className }: { label: ReactNode; value: number; max: number; display?: ReactNode; className?: string }) {
  return (
    <div className="sr-bar-row">
      <span className="sr-bar-label">{label}</span>
      <span className="sr-bar-track">
        <span className={`sr-bar-fill${className ? ` ${className}` : ""}`} style={{ width: widthPct(value, max) }} />
      </span>
      <span className="sr-bar-value">{display ?? n(value)}</span>
    </div>
  );
}

/** A tiny inline bar for table cells. */
export function MiniBar({ value, max }: { value: number; max: number }) {
  return (
    <span className="sr-mini" aria-hidden>
      <span style={{ width: widthPct(value, max) }} />
    </span>
  );
}

/** Response-time bands as one stacked bar. */
export function BandStack({ bands }: { bands: ResponseBands }) {
  const total = BAND_ORDER.reduce((a, k) => a + (bands[k] ?? 0), 0);
  if (total === 0) return <span className="sr-muted">—</span>;
  return (
    <span className="sr-stack" title={BAND_ORDER.map((k) => `${BAND_LABEL[k]}: ${bands[k] ?? 0}`).join(" · ")}>
      {BAND_ORDER.map((k) => ((bands[k] ?? 0) > 0 ? <span key={k} className={`sr-band-${k}`} style={{ width: widthPct(bands[k], total) }} /> : null))}
    </span>
  );
}

export function BandLegend() {
  return (
    <div className="sr-legend">
      {BAND_ORDER.map((k) => (
        <span key={k}>
          <i className={`sr-band-${k}`} />
          {BAND_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

/** Time formats and labels for one detailed report. */
export function docContext(meta: Pick<DetailedReportMeta, "period" | "generatedAt">) {
  const tz = meta.period.timezone || CLINIC_TZ;
  const refYear = Number(meta.period.toDay.slice(0, 4)) || new Date().getFullYear();
  return {
    tz,
    tf: makeTimeFormat(tz, refYear),
    /** Always with the year. */
    generated: makeTimeFormat(tz, 0),
    period: periodLabel(meta.period.fromDay, meta.period.toDay),
  };
}
export type DocContext = ReturnType<typeof docContext>;

/** Period, line, generated, by, time zone — plus one report-specific fact to fill the row. */
export function standardFacts(ctx: DocContext, meta: Pick<DetailedReportMeta, "generatedAt">, lineLabel: string, generatedBy: string, extra: { label: string; value: ReactNode }) {
  return [
    { label: "Period", value: ctx.period },
    { label: "WhatsApp line", value: lineLabel },
    extra,
    { label: "Generated", value: ctx.generated.dateTime(meta.generatedAt) },
    { label: "By", value: generatedBy },
    { label: "Time zone", value: ctx.tz },
  ];
}
