"use client";

// The Marketing dashboard: how campaigns, flows and the audience did over a
// period, and what needs attention now. Period (Today / 7 days / 30 days /
// custom, clinic days, ≤ 92) and WhatsApp line are mirrored to the URL like
// the supervisor reports, so a view can be bookmarked. Data: GET
// /api/stats/marketing (stats:marketing — MARKETING and ADMIN).

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { MarketingStats } from "@/types";
import { apiGetMarketingStats, getActiveNumber } from "@/lib/api";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { useActiveNumber } from "@/components/WhatsAppNumberProvider";
import { ErrorPanel } from "@/components/ErrorPanel";
import { toError } from "@/components/supervision/report/ReportShell";
import { MAX_REPORT_DAYS, addDays, clinicToday, parseDay, periodLabel, rangeProblem } from "@/components/supervision/report/reportFormat";
import { DashboardTabs } from "./parts";
import {
  AttentionSection,
  AudienceSection,
  CampaignsSection,
  FlowsSection,
  FunnelSection,
  LineHealthSection,
  type OpenCampaign,
} from "./sections";

const PRESETS = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "custom", label: "Custom", days: 0 },
] as const;
type Preset = (typeof PRESETS)[number]["value"];
type Range = { preset: Preset; from: string; to: string };

/** The last `days` clinic days, today included. */
function presetRange(preset: Exclude<Preset, "custom">): { from: string; to: string } {
  const today = clinicToday();
  const days = PRESETS.find((p) => p.value === preset)?.days ?? 30;
  return { from: addDays(today, -(days - 1)), to: today };
}

function parseRange(params: { get(name: string): string | null }): Range {
  const preset = PRESETS.find((p) => p.value === params.get("range"))?.value ?? "30d";
  if (preset !== "custom") return { preset, ...presetRange(preset) };
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (parseDay(from) && parseDay(to)) return { preset, from, to };
  return { preset: "30d", ...presetRange("30d") };
}

const LABEL = "block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5";

type Loaded = { key: string; data: MarketingStats | null; error: Error | null };

export function MarketingDashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useCurrentUser();
  const { numbers, activeNumberId, switchNumber } = useActiveNumber();
  const [range, setRange] = useState<Range>(() => parseRange(params));
  const [numberId, setNumberId] = useState<number | undefined>(() => {
    const n = Number(params.get("number"));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  });
  const [state, setState] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(0);

  const { from, to } = range;
  const problem = range.preset === "custom" ? rangeProblem(from, to) : null;
  const key = `${from}|${to}|${numberId ?? ""}`;

  useEffect(() => {
    const q = new URLSearchParams();
    q.set("range", range.preset);
    if (range.preset === "custom") {
      q.set("from", range.from);
      q.set("to", range.to);
    }
    if (numberId) q.set("number", String(numberId));
    window.history.replaceState(null, "", `?${q}`);
  }, [range, numberId]);

  useEffect(() => {
    if (problem) return;
    let cancelled = false;
    apiGetMarketingStats({ from, to, numberId })
      .then((res) => {
        if (!cancelled) setState({ key, data: res.data, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ key, data: null, error: toError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, from, to, numberId, problem, retry]);

  const current = state && state.key === key ? state : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;

  // Campaign pages are per line: switch to the campaign's line first, as
  // Supervision does when opening a chat in the inbox.
  const openCampaign: OpenCampaign = (id, lineId) => {
    const line = String(lineId);
    if (activeNumberId !== line) {
      switchNumber(line);
      // A switch guard (unsaved work elsewhere) may have vetoed it.
      if (getActiveNumber() !== line) return;
    }
    router.push(`/campaigns/${id}`);
  };

  const pickPreset = (p: Preset) => {
    if (p === "custom") setRange((r) => ({ ...r, preset: "custom" }));
    else setRange({ preset: p, ...presetRange(p) });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-canvas min-h-full">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-bold text-2xl text-gray-900">Marketing</h1>
            <p className="text-sm text-gray-400 mt-0.5">Campaigns, flows and your audience — and what needs attention</p>
          </div>
          {can("stats:team") && <DashboardTabs current="marketing" />}
        </div>

        {/* Period + line */}
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-end gap-x-4 gap-y-3 flex-wrap">
          <div>
            <p className={LABEL}>Period</p>
            <div className="inline-flex flex-wrap bg-canvas border border-gray-100 rounded-lg p-1 gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => pickPreset(p.value)}
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
                  onChange={(e) => setRange((r) => ({ ...r, preset: "custom", from: e.target.value }))}
                  className="h-[36px] text-[13px] text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 outline-none focus:border-brand/50"
                />
              </label>
              <label className="block">
                <span className={LABEL}>To</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setRange((r) => ({ ...r, preset: "custom", to: e.target.value }))}
                  className="h-[36px] text-[13px] text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 outline-none focus:border-brand/50"
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className={LABEL}>WhatsApp line</span>
            <select
              value={numberId ?? ""}
              onChange={(e) => setNumberId(e.target.value ? Number(e.target.value) : undefined)}
              className="h-[36px] max-w-full text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 rounded-lg pl-2.5 pr-8 outline-none focus:border-brand/50 cursor-pointer"
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

          <p className="sm:ml-auto text-[12.5px] text-gray-500 self-center">
            {problem ? (
              <span className="text-red-600 font-medium">{problem}</span>
            ) : (
              <>
                <span className="font-semibold text-gray-700">{periodLabel(from, to)}</span>
                <span className="text-gray-400"> · Dubai time · max {MAX_REPORT_DAYS} days</span>
              </>
            )}
          </p>
        </div>

        {problem ? null : error ? (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <ErrorPanel compact error={error} reset={() => setRetry((x) => x + 1)} title="Couldn't load the marketing figures" />
          </div>
        ) : !data ? (
          <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center gap-2 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin text-brand-fg" />
            <p className="text-[13px]">Counting {periodLabel(from, to)}…</p>
          </div>
        ) : (
          <>
            <AttentionSection attention={data.attention} open={openCampaign} />
            <FunnelSection funnel={data.campaignFunnel} optOutWindowDays={data.definitions.optOutWindowDays} />
            <CampaignsSection campaigns={data.campaigns} open={openCampaign} />
            <FlowsSection flows={data.flows} stalledMinutes={data.definitions.stalledFlowMinutes} canOpen={can("campaign:read")} />
            <AudienceSection audience={data.audience} lineScoped={!!data.numberId} canOpenLists={can("list:read")} canOpenSettings={can("settings:write")} />
            <LineHealthSection lines={data.lineHealth} />
          </>
        )}
      </div>
    </div>
  );
}
