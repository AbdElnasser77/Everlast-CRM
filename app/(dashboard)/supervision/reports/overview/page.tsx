"use client";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { apiGetSupervisionReport } from "@/lib/api";
import { useActiveNumber } from "@/components/WhatsAppNumberProvider";
import { ErrorPanel } from "@/components/ErrorPanel";
import { ReportDocument } from "@/components/supervision/report/ReportDocument";
import { TranscriptPicker } from "@/components/supervision/report/TranscriptPicker";
import { ReportGate, ReportShell, useGeneratedBy, useReportData, useReportPeriod } from "@/components/supervision/report/ReportShell";
import { useTranscripts } from "@/components/supervision/report/useTranscripts";
import { PICKS, periodLabel, pickIds, reportFileName } from "@/components/supervision/report/reportFormat";

// ── Overview report ───────────────────────────────────────────────────────────
//
// A period's numbers (summary, team, bookings, campaigns, chats) plus chosen
// chat transcripts, as one A4 document. The old /supervision/report URL
// redirects here.

function OverviewScreen() {
  const period = useReportPeriod();
  const { data: report, error, retry } = useReportData(period, apiGetSupervisionReport);
  const { numbers } = useActiveNumber();
  const generatedBy = useGeneratedBy();
  const { from, to, key: reportKey } = period;

  // Ticked chats; until the user ticks, the default pick for this report.
  const [selection, setSelection] = useState<{ key: string; ids: Set<number> } | null>(null);
  const selected = useMemo(() => {
    if (!report) return new Set<number>();
    if (selection && selection.key === reportKey) return selection.ids;
    return pickIds(report.chats, PICKS.default);
  }, [report, selection, reportKey]);
  const selectedIds = useMemo(() => (report ? report.chats.filter((c) => selected.has(c.id)).map((c) => c.id) : []), [report, selected]);

  const tx = useTranscripts({ reportKey, selectedIds, from, to, enabled: !!report });

  const lineLabel = useMemo(() => {
    if (!report?.line) return "All lines";
    const x = numbers.find((l) => l.id === report.line?.id);
    const label = report.line.label ?? x?.label ?? `Line #${report.line.id}`;
    return x?.displayPhoneNumber ? `${label} (${x.displayPhoneNumber})` : label;
  }, [report, numbers]);
  const label = report ? periodLabel(report.period.fromDay, report.period.toDay) : period.label;

  return (
    <ReportShell
      title="Overview report"
      description="A period’s chats, response times, bookings and campaigns — with chosen transcripts — as a PDF."
      icon={FileText}
      period={period}
      data={report}
      error={error}
      onRetry={retry}
      pdfName={reportFileName("Overview report", from, to)}
      pdfReady={tx.state.status !== "loading"}
      pdfBusyLabel="Loading transcripts…"
      footer={`Everlast Wellness — Overview report · ${label}`}
      controls={
        report && (
          <>
            <TranscriptPicker
              chats={report.chats}
              selected={selected}
              onChange={(ids) => setSelection({ key: reportKey, ids })}
              status={tx.state.status === "loading" ? "loading" : tx.state.status === "error" ? "error" : "idle"}
            />
            {tx.failure && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <ErrorPanel compact error={tx.failure} reset={tx.retry} title="Couldn't load the transcripts" />
              </div>
            )}
          </>
        )
      }
    >
      {report && <ReportDocument report={report} lineLabel={lineLabel} generatedBy={generatedBy} transcripts={tx.state} />}
    </ReportShell>
  );
}

export default function OverviewReportPage() {
  return (
    <ReportGate>
      <OverviewScreen />
    </ReportGate>
  );
}
