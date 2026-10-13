"use client";

import { FileSpreadsheet, Users } from "lucide-react";
import { apiGetTeamReport } from "@/lib/api";
import { TeamDocument } from "@/components/supervision/report/TeamDocument";
import { ReportGate, ReportShell, useGeneratedBy, useLineLabel, useReportData, useReportPeriod } from "@/components/supervision/report/ReportShell";
import { periodLabel, reportFileName } from "@/components/supervision/report/reportFormat";
import { teamCsv } from "@/components/supervision/report/reportCsv";

function TeamScreen() {
  const period = useReportPeriod();
  const { data, error, retry } = useReportData(period, apiGetTeamReport);
  const lineLabel = useLineLabel(period.numberId);
  const generatedBy = useGeneratedBy();
  const label = data ? periodLabel(data.period.fromDay, data.period.toDay) : period.label;

  return (
    <ReportShell
      title="Team performance"
      description="Speed and results per person — response-time bands, slowest replies, outcomes, bookings — with the daily trend and busiest hours."
      icon={Users}
      period={period}
      data={data}
      error={error}
      onRetry={retry}
      pdfName={reportFileName("Team performance", period.from, period.to)}
      footer={`Everlast Wellness — Team performance · ${label}`}
      downloads={[
        {
          label: "Download CSV",
          icon: FileSpreadsheet,
          title: "One row per person — opens in Excel",
          onClick: () => (data ? teamCsv(data, reportFileName("Team performance", period.from, period.to)) : undefined),
          disabled: !data || data.agents.length === 0,
        },
      ]}
    >
      {data && <TeamDocument report={data} lineLabel={lineLabel} generatedBy={generatedBy} />}
    </ReportShell>
  );
}

export default function TeamReportPage() {
  return (
    <ReportGate>
      <TeamScreen />
    </ReportGate>
  );
}
