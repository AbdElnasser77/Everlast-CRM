"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  SkipForward,
} from "lucide-react";
import type { Campaign, CampaignRecipient } from "@/types";
import { apiGetCampaign } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "0%";
  return `${Math.round((num / denom) * 100)}%`;
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  SENT: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
  FAILED: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
  SKIPPED: <SkipForward className="w-3.5 h-3.5 text-gray-400" />,
  PENDING: <Clock className="w-3.5 h-3.5 text-amber-400" />,
};

const STATUS_LABEL: Record<string, string> = {
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED: "Skipped",
  PENDING: "Pending",
};

const STATUS_CLASS: Record<string, string> = {
  SENT: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-600",
  SKIPPED: "bg-gray-100 text-gray-500",
  PENDING: "bg-amber-50 text-amber-600",
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "text-gray-800" }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <p className={`text-[28px] font-bold leading-none ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      <p className="text-[12px] text-gray-500 mt-2">{label}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  useEffect(() => {
    apiGetCampaign(Number(id))
      .then((res) => {
        setCampaign(res.data);
        setRecipients(res.data.recipients ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <svg className="w-10 h-10 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-[14px]">
        Campaign not found.
      </div>
    );
  }

  const sentR = recipients.filter((r) => r.status === "SENT");
  const failedR = recipients.filter((r) => r.status === "FAILED");
  const skippedR = recipients.filter((r) => r.status === "SKIPPED");
  const pendingR = recipients.filter((r) => r.status === "PENDING");

  const filtered = recipients.filter((r) => {
    const matchSearch =
      !search ||
      r.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.customer?.phone?.includes(search);
    const matchStatus = statusFilter === "ALL" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const CAMPAIGN_STATUS_CLASS: Record<string, string> = {
    COMPLETED: "bg-green-50 text-green-700",
    RUNNING: "bg-blue-50 text-blue-700",
    SCHEDULED: "bg-amber-50 text-amber-700",
    CANCELLED: "bg-gray-100 text-gray-500",
    DRAFT: "bg-gray-100 text-gray-500",
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f9f9f8]">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Back + header */}
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push("/campaigns")}
            className="mt-0.5 p-2 rounded-xl text-gray-400 hover:bg-white hover:text-gray-600 border border-transparent hover:border-gray-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[20px] font-bold text-gray-900 truncate">{campaign.name}</h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CAMPAIGN_STATUS_CLASS[campaign.status]}`}>
                {campaign.status}
              </span>
            </div>
            <p className="text-[13px] text-gray-400 mt-0.5">
              {campaign.template?.name ?? "—"}
              {campaign.startedAt && ` · Started ${formatDateTime(campaign.startedAt)}`}
              {campaign.completedAt && ` · Completed ${formatDateTime(campaign.completedAt)}`}
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Total sent" value={campaign.sentCount} sub={pct(campaign.sentCount, campaign.totalRecipients) + " of recipients"} />
          <StatCard label="Delivered" value={campaign.deliveredCount ?? 0} sub={pct(campaign.deliveredCount ?? 0, campaign.sentCount)} />
          <StatCard label="Read" value={campaign.readCount ?? 0} sub={pct(campaign.readCount ?? 0, campaign.sentCount)} />
          <StatCard label="Replied" value={campaign.repliedCount ?? 0} sub={pct(campaign.repliedCount ?? 0, campaign.sentCount)} />
          <StatCard label="Failed" value={campaign.failedCount} sub={pct(campaign.failedCount, campaign.totalRecipients)} color={campaign.failedCount > 0 ? "text-red-500" : "text-gray-800"} />
        </div>

        {/* Recipient table */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <p className="text-[11px] font-bold tracking-wider text-gray-400 uppercase">
              Recipients · {recipients.length}
            </p>
            <div className="flex items-center gap-2">
              {/* Status filter */}
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
                {["ALL", "SENT", "FAILED", "SKIPPED", "PENDING"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                      statusFilter === s
                        ? "bg-gray-900 text-white"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {s === "ALL" ? "All" : STATUS_LABEL[s]}
                    {s !== "ALL" && (
                      <span className="ml-1 opacity-60">
                        ({s === "SENT" ? sentR.length : s === "FAILED" ? failedR.length : s === "SKIPPED" ? skippedR.length : pendingR.length})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {/* Search */}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="text-[13px] border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:border-[#3B694C] focus:ring-1 focus:ring-[#3B694C]/20 w-48"
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Contact</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Sent at</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-[13px]">
                      No recipients match your filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#3B694C]/10 flex items-center justify-center text-[11px] font-bold text-[#3B694C] shrink-0">
                            {initials(r.customer?.name)}
                          </div>
                          <span className="font-medium text-gray-800">{r.customer?.name ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.customer?.phone ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[r.status]}`}>
                          {STATUS_ICON[r.status]}
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-[12px]">
                        {r.sentAt ? formatDateTime(r.sentAt) : "—"}
                      </td>
                      <td className="px-5 py-3 text-[12px] text-red-500 max-w-[200px] truncate">
                        {r.error ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
