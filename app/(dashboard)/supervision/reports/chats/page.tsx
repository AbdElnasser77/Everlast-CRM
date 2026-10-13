"use client";

import { FileSpreadsheet, MessagesSquare } from "lucide-react";
import { apiGetChatsReport } from "@/lib/api";
import { ChatsDocument } from "@/components/supervision/report/ChatsDocument";
import { ReportGate, ReportShell, useGeneratedBy, useLineLabel, useReportData, useReportPeriod } from "@/components/supervision/report/ReportShell";
import { periodLabel, reportFileName } from "@/components/supervision/report/reportFormat";

function ChatsScreen() {
  const period = useReportPeriod();
  const { data, error, retry } = useReportData(period, apiGetChatsReport);
  const lineLabel = useLineLabel(period.numberId);
  const generatedBy = useGeneratedBy();
  const { from, to } = period;
  const label = data ? periodLabel(data.period.fromDay, data.period.toDay) : period.label;

  return (
    <ReportShell
      title="Chats"
      description="One row per chat with a message in the period — who handled it, how fast, the longest wait, outcome, booking and source."
      icon={MessagesSquare}
      period={period}
      data={data}
      error={error}
      onRetry={retry}
      pdfName={reportFileName("Chats", from, to)}
      footer={`Everlast Wellness — Chats · ${label}`}
      landscape
      downloads={[
        {
          label: "Download Excel",
          icon: FileSpreadsheet,
          title: "All chats as an .xlsx workbook — filter and sort in Excel",
          disabled: !data || data.chats.length === 0,
          onClick: async () => {
            if (!data) return;
            // Loaded only now, so exceljs stays out of the page bundle.
            const { downloadChatsXlsx } = await import("@/components/supervision/report/chatsXlsx");
            await downloadChatsXlsx(data, reportFileName("Chats", from, to), lineLabel);
          },
        },
      ]}
    >
      {data && <ChatsDocument report={data} lineLabel={lineLabel} generatedBy={generatedBy} />}
    </ReportShell>
  );
}

export default function ChatsReportPage() {
  return (
    <ReportGate>
      <ChatsScreen />
    </ReportGate>
  );
}
