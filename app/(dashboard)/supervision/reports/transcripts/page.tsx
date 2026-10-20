"use client";

import { useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { apiGetChatsReport } from "@/lib/api";
import { ErrorPanel } from "@/components/ErrorPanel";
import { ChatFilterPicker, EMPTY_FILTER, type ChatFilter, describeFilter, worthReading } from "@/components/supervision/report/ChatFilterPicker";
import { TranscriptsDocument } from "@/components/supervision/report/TranscriptsDocument";
import { ReportGate, ReportShell, useGeneratedBy, useLineLabel, useReportData, useReportPeriod } from "@/components/supervision/report/ReportShell";
import { useTranscripts } from "@/components/supervision/report/useTranscripts";
import { MAX_TRANSCRIPTS, periodLabel, reportFileName } from "@/components/supervision/report/reportFormat";

// ── Transcripts report ────────────────────────────────────────────────────────
// Find chats with the Chats report's data, tick up to 100, print their full
// conversations for the period behind a cover that says how they were chosen.

function TranscriptsScreen() {
  const period = useReportPeriod();
  const { data, error, retry } = useReportData(period, apiGetChatsReport);
  const lineLabel = useLineLabel(period.numberId);
  const generatedBy = useGeneratedBy();
  const { from, to, key: reportKey } = period;

  const [filter, setFilter] = useState<ChatFilter>(EMPTY_FILTER);
  // Ticked chats; until the user ticks, the ones worth reading (late or unanswered).
  const [selection, setSelection] = useState<{ key: string; ids: Set<number> } | null>(null);
  const selected = useMemo(() => {
    if (!data) return new Set<number>();
    if (selection && selection.key === reportKey) return selection.ids;
    return new Set(data.chats.filter(worthReading).slice(0, MAX_TRANSCRIPTS).map((c) => c.id));
  }, [data, selection, reportKey]);
  const chosen = useMemo(() => (data ? data.chats.filter((c) => selected.has(c.id)) : []), [data, selected]);
  const selectedIds = useMemo(() => chosen.map((c) => c.id), [chosen]);

  const tx = useTranscripts({ reportKey, selectedIds, from, to, enabled: !!data });
  const label = data ? periodLabel(data.period.fromDay, data.period.toDay) : period.label;

  return (
    <ReportShell
      title="Transcripts"
      description="Filter the period’s chats, tick up to 100 and print their full conversations as a PDF."
      icon={ScrollText}
      period={period}
      data={data}
      error={error}
      onRetry={retry}
      pdfName={reportFileName("Transcripts", from, to)}
      pdfReady={tx.state.status !== "loading" && chosen.length > 0}
      pdfBusyLabel={chosen.length === 0 ? "Choose chats first" : "Loading transcripts…"}
      footer={`Everlast Wellness — Chat transcripts · ${label}`}
      controls={
        data && (
          <>
            <ChatFilterPicker
              chats={data.chats}
              filter={filter}
              onFilter={setFilter}
              selected={selected}
              onChange={(ids) => setSelection({ key: reportKey, ids })}
              status={tx.state.status === "loading" ? "loading" : tx.state.status === "error" ? "error" : "idle"}
            />
            {data.truncated && (
              <p className="text-[12px] text-amber-700">
                This period has more chats than can be listed — only {data.chats.length} of them are listed. Pick a shorter period or one line.
              </p>
            )}
            {tx.failure && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <ErrorPanel compact error={tx.failure} reset={tx.retry} title="Couldn't load the transcripts" />
              </div>
            )}
          </>
        )
      }
    >
      {data && (
        <TranscriptsDocument
          report={data}
          chosen={chosen}
          criteria={describeFilter(filter)}
          transcripts={tx.state}
          lineLabel={lineLabel}
          generatedBy={generatedBy}
        />
      )}
    </ReportShell>
  );
}

export default function TranscriptsReportPage() {
  return (
    <ReportGate>
      <TranscriptsScreen />
    </ReportGate>
  );
}
