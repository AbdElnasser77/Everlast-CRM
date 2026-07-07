"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Upload,
  TrendingDown,
  Pause,
  Play,
  Loader2,
} from "lucide-react";
import type { Campaign } from "@/types";
import {
  apiGetCampaigns,
  apiGetActiveCampaignProgress,
  apiCancelCampaign,
  apiPauseCampaign,
  apiResumeCampaign,
} from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useToast } from "@/components/ui/toast";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const STAT_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-50 text-green-700",
  RUNNING: "bg-blue-50 text-blue-700",
  PAUSED: "bg-orange-50 text-orange-600",
  SCHEDULED: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  DRAFT: "bg-gray-100 text-gray-500",
};

// ── Running Campaign Card ─────────────────────────────────────────────────────

function RunningCard({
  campaign,
  onCancel,
  onPause,
  pausing,
}: {
  campaign: Campaign;
  onCancel: (id: number) => void;
  onPause: (id: number) => void;
  pausing: boolean;
}) {
  const { sentCount, failedCount, totalRecipients, startedAt, name } = campaign;
  const done = sentCount + failedCount;
  const pct = totalRecipients > 0 ? Math.round((done / totalRecipients) * 100) : 0;
  // Matches the backend's 5-way send concurrency — effective per-recipient
  // wall time, not a per-message throttle. Keep in sync with the estimate in
  // campaigns/new/page.tsx if that concurrency setting ever changes.
  const remaining = totalRecipients > 0 ? ((totalRecipients - done) * 0.3) : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-[11px] font-bold tracking-wider text-green-600 uppercase">Sending Now</span>
          <span className="text-[13px] font-semibold text-gray-800">{name}</span>
          {startedAt && (
            <span className="text-[12px] text-gray-400">Started {timeAgo(startedAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPause(campaign.id)}
            disabled={pausing}
            className="flex items-center gap-1 text-[12px] font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-3 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pausing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
            Pause
          </button>
          <button
            onClick={() => onCancel(campaign.id)}
            className="text-[12px] font-medium text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 px-3 py-1 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className="absolute left-0 top-0 h-full bg-[#3B694C] rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[12px] text-gray-500 mb-4">
        <span>{done} / {totalRecipients} sent</span>
        {remaining > 0 && <span>≈ {formatDuration(remaining)} left</span>}
      </div>

      <div className="flex items-center gap-6">
        {[
          { label: "Sent", value: sentCount },
          { label: "Delivered", value: campaign.deliveredCount ?? 0 },
          { label: "Read", value: campaign.readCount ?? 0 },
          { label: "Replied", value: campaign.repliedCount ?? 0 },
          { label: "Failed", value: failedCount },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col">
            <span className="text-[22px] font-bold text-gray-800 leading-none">{value}</span>
            <span className="text-[11px] text-gray-400 mt-0.5">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Paused Card ────────────────────────────────────────────────────────────

function PausedCard({
  campaign,
  onCancel,
  onResume,
  resuming,
}: {
  campaign: Campaign;
  onCancel: (id: number) => void;
  onResume: (id: number) => void;
  resuming: boolean;
}) {
  const { sentCount, failedCount, totalRecipients, name } = campaign;
  const done = sentCount + failedCount;
  const pct = totalRecipients > 0 ? Math.round((done / totalRecipients) * 100) : 0;

  return (
    <div className="bg-white border border-orange-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Pause className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-[11px] font-bold tracking-wider text-orange-600 uppercase">Paused</span>
          <span className="text-[13px] font-semibold text-gray-800">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onResume(campaign.id)}
            disabled={resuming}
            className="flex items-center gap-1 text-[12px] font-semibold text-[#3B694C] hover:text-[#2f5540] border border-[#3B694C]/30 hover:border-[#3B694C]/50 px-3 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resuming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Resume
          </button>
          <button
            onClick={() => onCancel(campaign.id)}
            className="text-[12px] font-medium text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 px-3 py-1 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className="absolute left-0 top-0 h-full bg-orange-300 rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[12px] text-gray-500">
        {done} / {totalRecipients} sent — paused before completing.
      </div>
    </div>
  );
}

// ── Scheduled Card ─────────────────────────────────────────────────────────

function ScheduledCard({ campaign, onCancel }: { campaign: Campaign; onCancel: (id: number) => void }) {
  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-4 flex items-center gap-4">
      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
        <Clock className="w-4.5 h-4.5 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-gray-800 truncate">{campaign.name}</p>
        <p className="text-[12px] text-gray-400">
          Scheduled · {campaign.scheduledAt ? formatDateTime(campaign.scheduledAt) : "—"} · {campaign.totalRecipients} recipients
        </p>
      </div>
      <button
        onClick={() => onCancel(campaign.id)}
        className="text-[12px] font-medium text-gray-500 hover:text-red-500 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const router = useRouter();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [pausingIds, setPausingIds] = useState<Set<number>>(new Set());
  const [resumingIds, setResumingIds] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    apiGetCampaigns()
      .then((res) => setCampaigns(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Lightweight poll target — only queries active (RUNNING/PAUSED) campaigns'
  // counters, not the full history + delivered/read/replied joins that
  // apiGetCampaigns does. Never rolls progress backward on a RUNNING campaign.
  const pollLoad = useCallback(() => {
    apiGetActiveCampaignProgress()
      .then((res) => {
        const activeMap = new Map(res.data.map((c) => [c.id, c]));
        let missingTerminal = false;
        setCampaigns((prev) =>
          prev.map((c) => {
            if (c.status !== "RUNNING" && c.status !== "PAUSED") return c;
            const fresh = activeMap.get(c.id);
            if (!fresh) {
              // No longer active — it finished/was cancelled between polls.
              // The lightweight endpoint doesn't carry final delivered/read/
              // replied numbers, so fall back to a full reload for this tick.
              missingTerminal = true;
              return c;
            }
            return {
              ...c,
              status: fresh.status,
              sentCount: Math.max(c.sentCount, fresh.sentCount),
              failedCount: Math.max(c.failedCount, fresh.failedCount),
              totalRecipients: fresh.totalRecipients,
            };
          })
        );
        if (missingTerminal) load();
      })
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    load();
    const socket = getSocket();
    const refresh = () => load();
    const onProgress = (data: { campaignId: number; sentCount: number; failedCount: number; totalRecipients: number }) => {
      // The backend now sends up to 5 recipients concurrently, so their
      // progress events can arrive out of commit-order — never let a
      // late-but-stale event visibly walk the counters backward.
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === data.campaignId
            ? {
                ...c,
                sentCount: Math.max(c.sentCount, data.sentCount),
                failedCount: Math.max(c.failedCount, data.failedCount),
                totalRecipients: data.totalRecipients,
              }
            : c
        )
      );
    };
    socket.on("campaign.started", refresh);
    socket.on("campaign.progress", onProgress);
    socket.on("campaign.completed", refresh);
    socket.on("campaign.cancelled", refresh);
    socket.on("campaign.paused", refresh);
    return () => {
      socket.off("campaign.started", refresh);
      socket.off("campaign.progress", onProgress);
      socket.off("campaign.completed", refresh);
      socket.off("campaign.cancelled", refresh);
      socket.off("campaign.paused", refresh);
    };
  }, [load]);

  // Poll while any campaign is running — catches missed socket events. 1.5s
  // instead of the old 3s since sends now complete several times faster with
  // the backend's concurrent-send batching, so a 3s gap felt laggy/stale.
  const hasRunning = campaigns.some((c) => c.status === "RUNNING");
  useEffect(() => {
    if (!hasRunning) return;
    const interval = setInterval(pollLoad, 1500);
    return () => clearInterval(interval);
  }, [hasRunning, pollLoad]);

  const handleCancel = async (id: number) => {
    try {
      await apiCancelCampaign(id);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel campaign.");
    }
  };

  const handlePause = async (id: number) => {
    setPausingIds((prev) => new Set(prev).add(id));
    try {
      await apiPauseCampaign(id);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't pause campaign.");
    } finally {
      setPausingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleResume = async (id: number) => {
    setResumingIds((prev) => new Set(prev).add(id));
    try {
      await apiResumeCampaign(id);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't resume campaign.");
    } finally {
      setResumingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleExport = () => {
    const completed = campaigns.filter((c) => c.status === "COMPLETED");
    const rows = [
      ["Name", "Status", "Recipients", "Sent", "Failed", "Delivered", "Read", "Replied", "Started", "Completed"],
      ...completed.map((c) => [
        c.name,
        c.status,
        c.totalRecipients,
        c.sentCount,
        c.failedCount,
        c.deliveredCount ?? 0,
        c.readCount ?? 0,
        c.repliedCount ?? 0,
        c.startedAt ? new Date(c.startedAt).toISOString() : "",
        c.completedAt ? new Date(c.completedAt).toISOString() : "",
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const running = campaigns.filter((c) => c.status === "RUNNING");
  const paused = campaigns.filter((c) => c.status === "PAUSED");
  const scheduled = campaigns.filter((c) => c.status === "SCHEDULED");
  const drafts = campaigns.filter((c) => c.status === "DRAFT");
  const sent = campaigns.filter((c) => c.status === "COMPLETED" || c.status === "CANCELLED");

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <svg className="w-10 h-10 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f9f9f8]">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900">Campaigns</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">
              {sent.filter(c => c.status === "COMPLETED").length} sent
              {paused.length > 0 && ` · ${paused.length} paused`}
              {scheduled.length > 0 && ` · ${scheduled.length} scheduled`}
              {drafts.length > 0 && ` · ${drafts.length} draft${drafts.length > 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={() => router.push("/campaigns/new")}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5540] px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New campaign
            </button>
          </div>
        </div>

        {/* Running */}
        {running.length > 0 && (
          <div className="space-y-3">
            {running.map((c) => (
              <RunningCard key={c.id} campaign={c} onCancel={handleCancel} onPause={handlePause} pausing={pausingIds.has(c.id)} />
            ))}
          </div>
        )}

        {/* Paused */}
        {paused.length > 0 && (
          <div className="space-y-3">
            {paused.map((c) => (
              <PausedCard key={c.id} campaign={c} onCancel={handleCancel} onResume={handleResume} resuming={resumingIds.has(c.id)} />
            ))}
          </div>
        )}

        {/* Scheduled */}
        {scheduled.length > 0 && (
          <div className="space-y-2">
            {scheduled.map((c) => (
              <ScheduledCard key={c.id} campaign={c} onCancel={handleCancel} />
            ))}
          </div>
        )}

        {/* Drafts */}
        {drafts.length > 0 && (
          <div>
            <p className="text-[11px] font-bold tracking-wider text-gray-400 uppercase mb-3">Drafts</p>
            <div className="space-y-2">
              {drafts.map((c) => (
                <div key={c.id} className="bg-white border border-dashed border-gray-200 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-gray-800 truncate">{c.name}</p>
                    <p className="text-[12px] text-gray-400">
                      Draft · {c.template?.name ?? "—"} · {c.totalRecipients} recipient{c.totalRecipients !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => router.push(`/campaigns/new?draft=${c.id}`)}
                    className="text-[12px] font-medium text-[#3B694C] hover:text-[#2f5540] border border-[#3B694C]/20 hover:border-[#3B694C]/40 px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer"
                  >
                    Continue editing
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {campaigns.length === 0 && (
          <div className="text-center py-24">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-gray-700">No campaigns yet</p>
            <p className="text-[13px] text-gray-400 mt-1 mb-5">Send your first WhatsApp campaign to your contacts.</p>
            <button
              onClick={() => router.push("/campaigns/new")}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5540] px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New campaign
            </button>
          </div>
        )}

        {/* Sent table */}
        {sent.length > 0 && (
          <div>
            <p className="text-[11px] font-bold tracking-wider text-gray-400 uppercase mb-3">Sent</p>
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Campaign</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Sent</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Recipients</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Delivered</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Read</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Replied</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Failed</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sent.map((c) => {
                    const replyRate = c.sentCount > 0 ? (c.repliedCount ?? 0) / c.sentCount : 0;
                    const lowEngagement = c.status === "COMPLETED" && replyRate < 0.1 && c.sentCount > 5;
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => router.push(`/campaigns/${c.id}`)}>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-gray-800">{c.name}</p>
                          {c.template && (
                            <p className="text-[11px] text-gray-400">{c.template.name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500">
                          {c.startedAt ? formatDateTime(c.startedAt) : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-right text-gray-700 font-medium">{c.totalRecipients}</td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-gray-700">{c.deliveredCount ?? 0}</span>
                          {c.sentCount > 0 && (
                            <span className="text-gray-400 text-[11px] ml-1">
                              · {Math.round(((c.deliveredCount ?? 0) / c.sentCount) * 100)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-gray-700">{c.readCount ?? 0}</span>
                          {c.sentCount > 0 && (
                            <span className="text-gray-400 text-[11px] ml-1">
                              · {Math.round(((c.readCount ?? 0) / c.sentCount) * 100)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-gray-700">{c.repliedCount ?? 0}</span>
                          {c.sentCount > 0 && (
                            <span className="text-gray-400 text-[11px] ml-1">
                              · {Math.round(replyRate * 100)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={c.failedCount > 0 ? "text-red-500 font-medium" : "text-gray-700"}>{c.failedCount}</span>
                          {c.totalRecipients > 0 && c.failedCount > 0 && (
                            <span className="text-gray-400 text-[11px] ml-1">
                              · {Math.round((c.failedCount / c.totalRecipients) * 100)}%
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {lowEngagement ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-600 px-2 py-1 rounded-full">
                              <TrendingDown className="w-3 h-3" />
                              Low engagement
                            </span>
                          ) : c.status === "COMPLETED" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-green-50 text-green-600 px-2 py-1 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                              <XCircle className="w-3 h-3" />
                              Cancelled
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
