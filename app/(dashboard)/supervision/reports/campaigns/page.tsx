"use client";

import { FileSpreadsheet, Megaphone } from "lucide-react";
import { apiGetCampaignsReport } from "@/lib/api";
import { CampaignsDocument } from "@/components/supervision/report/CampaignsDocument";
import { ReportGate, ReportShell, useGeneratedBy, useLineLabel, useReportData, useReportPeriod } from "@/components/supervision/report/ReportShell";
import { periodLabel, reportFileName } from "@/components/supervision/report/reportFormat";
import { campaignsCsv } from "@/components/supervision/report/reportCsv";

function CampaignsScreen() {
  const period = useReportPeriod();
  const { data, error, retry } = useReportData(period, apiGetCampaignsReport);
  const lineLabel = useLineLabel(period.numberId);
  const generatedBy = useGeneratedBy();
  const label = data ? periodLabel(data.period.fromDay, data.period.toDay) : period.label;

  return (
    <ReportShell
      title="Campaigns"
      description="Each campaign that started in the period, from sent to booked — delivery, reads, replies, requests, patients booked, opt-outs."
      icon={Megaphone}
      period={period}
      data={data}
      error={error}
      onRetry={retry}
      pdfName={reportFileName("Campaigns", period.from, period.to)}
      footer={`Everlast Wellness — Campaigns · ${label}`}
      downloads={[
        {
          label: "Download CSV",
          icon: FileSpreadsheet,
          title: "One row per campaign — opens in Excel",
          onClick: () => (data ? campaignsCsv(data, reportFileName("Campaigns", period.from, period.to)) : undefined),
          disabled: !data || data.campaigns.length === 0,
        },
      ]}
    >
      {data && <CampaignsDocument report={data} lineLabel={lineLabel} generatedBy={generatedBy} />}
    </ReportShell>
  );
}

export default function CampaignsReportPage() {
  return (
    <ReportGate>
      <CampaignsScreen />
    </ReportGate>
  );
}
