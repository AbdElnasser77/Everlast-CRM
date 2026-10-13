"use client";

// Transcripts for the ticked chats: fetches only the ones not fetched yet for
// this report, after the ticking settles, and keeps them while the period and
// line stay the same.

import { useEffect, useMemo, useState } from "react";
import { apiGetReportTranscripts } from "@/lib/api";
import type { ReportTranscript } from "@/types";
import type { TranscriptsState } from "./ReportDocument";
import { toError } from "./ReportShell";

/** Wait for the ticking to settle before fetching transcripts. */
const TRANSCRIPT_DEBOUNCE_MS = 500;

/** null = asked for, but the chat had no messages in the period. */
type TranscriptCache = { key: string; byId: Map<number, ReportTranscript | null> };

export function useTranscripts({
  reportKey,
  selectedIds,
  from,
  to,
  enabled,
}: {
  /** Changes with the period / line; the cache is dropped when it does. */
  reportKey: string;
  /** In print order. */
  selectedIds: number[];
  from: string;
  to: string;
  enabled: boolean;
}): { state: TranscriptsState; failure: Error | null; retry: () => void } {
  const [cache, setCache] = useState<TranscriptCache | null>(null);
  const [txError, setTxError] = useState<{ key: string; error: Error } | null>(null);
  const [txRetry, setTxRetry] = useState(0);

  const byId = cache && cache.key === reportKey ? cache.byId : null;
  const missingKey = selectedIds.filter((id) => !byId?.has(id)).join(",");
  const failure = txError && txError.key === `${reportKey}#${missingKey}` ? txError.error : null;

  useEffect(() => {
    if (!enabled || !missingKey) return;
    let cancelled = false;
    const ids = missingKey.split(",").map(Number);
    const timer = setTimeout(() => {
      apiGetReportTranscripts({ ids, from, to })
        .then((res) => {
          if (cancelled) return;
          setCache((prev) => {
            const map = new Map(prev && prev.key === reportKey ? prev.byId : []);
            for (const t of res.data) map.set(t.id, t);
            for (const id of ids) if (!map.has(id)) map.set(id, null);
            return { key: reportKey, byId: map };
          });
        })
        .catch((err) => {
          if (!cancelled) setTxError({ key: `${reportKey}#${missingKey}`, error: toError(err) });
        });
    }, TRANSCRIPT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, missingKey, reportKey, from, to, txRetry]);

  const state: TranscriptsState = useMemo(() => {
    if (selectedIds.length === 0) return { status: "none" };
    if (failure) return { status: "error", message: failure.message || "Unknown error" };
    if (missingKey) return { status: "loading" };
    const items = selectedIds.map((id) => byId?.get(id) ?? null).filter((t): t is ReportTranscript => !!t);
    return { status: "ready", items, missing: selectedIds.length - items.length };
  }, [selectedIds, failure, missingKey, byId]);

  return {
    state,
    failure,
    retry: () => {
      setTxError(null);
      setTxRetry((x) => x + 1);
    },
  };
}
