"use client";

// The frame every supervisor report page shares: access gate, period presets
// and custom range (≤ 92 days), WhatsApp line filter, both mirrored to the URL
// so a report can be bookmarked; loading / error; Download buttons; and the A4
// preview that prints. "Download PDF" opens the browser's print dialog — the
// print CSS (reportFormat.ts) hides the CRM around the sheet, so "Save as PDF"
// gives a clean document.

import { Suspense, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Loader2, type LucideIcon } from "lucide-react";
import type { ReportQuery } from "@/lib/api";
import { homePathFor } from "@/lib/permissions";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { useActiveNumber } from "@/components/WhatsAppNumberProvider";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorPanel } from "@/components/ErrorPanel";
import { personName } from "@/components/supervision/format";
import {
  MAX_REPORT_DAYS,
  PRESETS,
  type Preset,
  type ReportRange,
  parseRange,
  periodLabel,
  presetRange,
  rangeProblem,
  reportCss,
} from "./reportFormat";

export const REPORTS_HOME = "/supervision/reports";

function parsePositiveInt(v: string | null): number | null {
  const x = Number(v);
  return v && Number.isInteger(x) && x > 0 ? x : null;
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// ── Gate ──────────────────────────────────────────────────────────────────

function AccessRestricted() {
  const router = useRouter();
  const { me } = useCurrentUser();
  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-6">
      <div className="max-w-md mx-auto mt-16 bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
        <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h2 className="text-[17px] font-bold text-gray-700 mb-2">Access Restricted</h2>
        <p className="text-[13px] text-gray-400">Supervisor reports are for supervisors and admins. Ask an admin if you need them.</p>
        <button
          type="button"
          onClick={() => router.push(homePathFor(me))}
          className="mt-6 inline-flex items-center gap-2 bg-brand hover:bg-[#2f5840] active:bg-[#264a33] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
        >
          Go back
        </button>
      </div>
    </div>
  );
}

/** Supervisors and admins only (team:supervise); a Suspense boundary for useSearchParams. */
export function ReportGate({ children }: { children: ReactNode }) {
  const { ready, can } = useCurrentUser();
  if (!ready) return <PageSpinner />;
  if (!can("team:supervise")) return <AccessRestricted />;
  return <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
}

// ── Period + line (URL state) ─────────────────────────────────────────────

export type ReportPeriod = {
  range: ReportRange;
  from: string;
  to: string;
  numberId: number | undefined;
  /** Why the custom range can't run, or null. */
  problem: string | null;
  /** Changes whenever the report must be fetched again. */
  key: string;
  label: string;
  pickPreset: (p: Preset) => void;
  setRange: Dispatch<SetStateAction<ReportRange>>;
  setNumberId: (id: number | undefined) => void;
};

export function useReportPeriod(): ReportPeriod {
  const params = useSearchParams();
  const [range, setRange] = useState<ReportRange>(() => parseRange(params));
  const [numberId, setNumberId] = useState<number | undefined>(() => parsePositiveInt(params.get("number")) ?? undefined);
  const { from, to } = range;
  const problem = range.preset === "custom" ? rangeProblem(from, to) : null;

  useEffect(() => {
    const q = new URLSearchParams();
    q.set("range", range.preset);
    q.set("from", range.from);
    q.set("to", range.to);
    if (numberId) q.set("number", String(numberId));
    window.history.replaceState(null, "", `?${q}`);
  }, [range, numberId]);

  return {
    range,
    from,
    to,
    numberId,
    problem,
    key: `${from}|${to}|${numberId ?? ""}`,
    label: periodLabel(from, to),
    pickPreset: (p) => {
      if (p === "custom") setRange((r) => ({ ...r, preset: "custom" }));
      else setRange({ preset: p, ...presetRange(p) });
    },
    setRange,
    setNumberId,
  };
}

type Loaded<T> = { key: string; data: T | null; error: Error | null };

/**
 * Fetches a report for the period. `load` must be a stable (module-level)
 * function. Stale answers — from a period the user has since left — are dropped.
 */
export function useReportData<T>(period: ReportPeriod, load: (q: ReportQuery) => Promise<{ data: T }>) {
  const [state, setState] = useState<Loaded<T> | null>(null);
  const [retry, setRetry] = useState(0);
  const { key, from, to, numberId, problem } = period;

  useEffect(() => {
    if (problem) return;
    let cancelled = false;
    load({ from, to, numberId })
      .then((res) => {
        if (!cancelled) setState({ key, data: res.data, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ key, data: null, error: toError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, from, to, numberId, problem, retry, load]);

  const current = state && state.key === key ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? null, retry: () => setRetry((x) => x + 1) };
}

/** "Medical Center (+971 56 199 4818)" for the chosen line, or "All lines". */
export function useLineLabel(numberId: number | null | undefined): string {
  const { numbers } = useActiveNumber();
  return useMemo(() => {
    if (!numberId) return "All lines";
    const x = numbers.find((l) => l.id === numberId);
    if (!x) return `Line #${numberId}`;
    return x.displayPhoneNumber ? `${x.label} (${x.displayPhoneNumber})` : x.label;
  }, [numberId, numbers]);
}

export function useGeneratedBy(): string {
  const { me } = useCurrentUser();
  return me ? personName(me) : "—";
}

/** Opens the print dialog with `fileName` as the suggested PDF name. */
export function printAsPdf(fileName: string) {
  const prev = document.title;
  document.title = fileName;
  const restore = () => {
    document.title = prev;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

// ── The shell ─────────────────────────────────────────────────────────────

export type ReportDownload = {
  label: string;
  icon?: LucideIcon;
  title?: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
};

const PRIMARY_BTN =
  "flex items-center gap-1.5 h-[40px] text-[13px] font-semibold text-white bg-brand hover:bg-[#2f5840] active:bg-[#264a33] px-4 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default";
const SECONDARY_BTN =
  "flex items-center gap-1.5 h-[40px] text-[13px] font-semibold text-brand-fg bg-white border border-brand/30 hover:bg-brand-100 px-3.5 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default";
const LABEL = "block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5";

export function ReportShell({
  title,
  description,
  icon: Icon,
  period,
  data,
  error,
  onRetry,
  pdfName,
  pdfReady,
  pdfBusyLabel,
  downloads = [],
  footer,
  landscape = false,
  controls,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  period: ReportPeriod;
  /** The loaded report; null while loading or on error. */
  data: unknown;
  error: Error | null;
  onRetry: () => void;
  /** Suggested PDF file name (no extension). */
  pdfName: string;
  /** Defaults to "the report has loaded". */
  pdfReady?: boolean;
  /** Shown on the PDF button while the report is loaded but not ready to print. */
  pdfBusyLabel?: string;
  /** Extra downloads (CSV, Excel) next to the PDF button. */
  downloads?: ReportDownload[];
  /** The running footer on each printed page. */
  footer: string;
  landscape?: boolean;
  /** Screen-only panels between the filters and the preview (pickers…). */
  controls?: ReactNode;
  /** The printable document — render only once `data` has loaded. */
  children?: ReactNode;
}) {
  const { numbers } = useActiveNumber();
  const { range, from, to, numberId, problem } = period;
  const loaded = data !== null && data !== undefined;
  const ready = loaded && (pdfReady ?? true);
  const css = useMemo(() => reportCss(footer, { landscape }), [footer, landscape]);
  const [busy, setBusy] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const runDownload = async (d: ReportDownload) => {
    if (busy) return;
    setBusy(d.label);
    setDownloadError(null);
    try {
      await d.onClick();
    } catch (err) {
      setDownloadError(`${d.label} failed: ${toError(err).message || "unknown error"}`);
    } finally {
      setBusy(null);
    }
  };

  const back = `${REPORTS_HOME}${numberId ? `?number=${numberId}` : ""}`;

  return (
    <div className="flex-1 overflow-y-auto bg-canvas [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-brand/25 [&::-webkit-scrollbar-thumb]:rounded-full">
      <div className={`${landscape ? "max-w-[1240px]" : "max-w-[1100px]"} mx-auto px-4 sm:px-6 py-6 space-y-4`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap print:hidden">
          <div className="min-w-0">
            <Link href={back} className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-700 mb-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Reports
            </Link>
            <h1 className="text-[22px] font-bold text-gray-900 flex items-center gap-2">
              <Icon className="w-5 h-5 text-brand-fg" />
              {title}
            </h1>
            <p className="text-[13px] text-gray-400 mt-0.5">{description}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {downloads.map((d) => {
              const DIcon = d.icon ?? Download;
              const isBusy = busy === d.label;
              return (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => runDownload(d)}
                  disabled={!loaded || d.disabled || !!busy}
                  title={d.title}
                  className={SECONDARY_BTN}
                >
                  {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <DIcon className="w-4 h-4" />}
                  {d.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => ready && printAsPdf(pdfName)}
              disabled={!ready}
              title={ready ? "Opens the print dialog — choose “Save as PDF”" : "Waiting for the report to load"}
              className={PRIMARY_BTN}
            >
              {loaded && !ready ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {loaded && !ready ? pdfBusyLabel ?? "Loading…" : "Download PDF"}
            </button>
          </div>
        </div>
        {downloadError && <p className="text-[12.5px] text-red-600 print:hidden">{downloadError}</p>}

        {/* Period + line */}
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-end gap-x-4 gap-y-3 flex-wrap print:hidden">
          <div>
            <p className={LABEL}>Period</p>
            <div className="inline-flex flex-wrap bg-canvas border border-gray-100 rounded-lg p-1 gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => period.pickPreset(p.value)}
                  aria-pressed={range.preset === p.value}
                  className={`text-[12.5px] font-semibold rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
                    range.preset === p.value ? "bg-brand text-white" : "text-gray-500 hover:text-gray-800 hover:bg-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {range.preset === "custom" && (
            <div className="flex items-end gap-2">
              <label className="block">
                <span className={LABEL}>From</span>
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => period.setRange((r) => ({ ...r, preset: "custom", from: e.target.value }))}
                  className="h-[36px] text-[13px] text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 outline-none focus:border-brand/50"
                />
              </label>
              <label className="block">
                <span className={LABEL}>To</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => period.setRange((r) => ({ ...r, preset: "custom", to: e.target.value }))}
                  className="h-[36px] text-[13px] text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 outline-none focus:border-brand/50"
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className={LABEL}>WhatsApp line</span>
            <select
              value={numberId ?? ""}
              onChange={(e) => period.setNumberId(e.target.value ? Number(e.target.value) : undefined)}
              className="h-[36px] text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 rounded-lg pl-2.5 pr-8 outline-none focus:border-brand/50 cursor-pointer"
            >
              <option value="">All lines</option>
              {numbers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                  {x.displayPhoneNumber ? ` · ${x.displayPhoneNumber}` : ""}
                </option>
              ))}
            </select>
          </label>

          <p className="ml-auto text-[12.5px] text-gray-500 self-center">
            {problem ? <span className="text-red-600 font-medium">{problem}</span> : <span className="font-semibold text-gray-700">{period.label}</span>}
            {!problem && <span className="text-gray-400"> · max {MAX_REPORT_DAYS} days</span>}
          </p>
        </div>

        {problem ? null : error ? (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <ErrorPanel compact error={error} reset={onRetry} title="Couldn't load the report" />
          </div>
        ) : !loaded ? (
          <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center gap-2 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin text-brand-fg" />
            <p className="text-[13px]">Building the report for {period.label}…</p>
          </div>
        ) : (
          <>
            {controls}
            <div className="pt-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 print:hidden">
                Preview · A4 {landscape ? "landscape" : "portrait"}
              </p>
              <style dangerouslySetInnerHTML={{ __html: css }} />
              <div className="sr-root">{children}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
