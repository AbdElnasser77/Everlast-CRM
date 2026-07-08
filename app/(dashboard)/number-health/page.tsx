"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Ban,
  HelpCircle,
  RefreshCw,
} from "lucide-react";
import { apiGetWhatsAppStatus, apiGetWhatsAppNumbers } from "@/lib/api";
import type { WhatsAppPhoneStatus, WhatsAppPhoneNumberSummary } from "@/types";

type Severity = "good" | "warning" | "serious" | "critical" | "neutral";

const SEVERITY_STYLES: Record<Severity, { bg: string; text: string; border: string }> = {
  good: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  warning: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  serious: { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
  critical: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  neutral: { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
};

const SEVERITY_ICONS: Record<Severity, typeof CheckCircle2> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  serious: AlertOctagon,
  critical: Ban,
  neutral: HelpCircle,
};

// Meta's documented phone-number status values — the direct answer to
// "is this number banned/flagged". Anything else falls back to neutral.
const STATUS_META: Record<string, { severity: Severity; label: string; description: string }> = {
  CONNECTED: {
    severity: "good",
    label: "Connected",
    description: "Sending normally, within your messaging limit.",
  },
  FLAGGED: {
    severity: "warning",
    label: "Flagged",
    description: "Quality rating dropped — on track for a lower messaging tier unless it recovers within a few days.",
  },
  RESTRICTED: {
    severity: "serious",
    label: "Restricted",
    description: "Messaging limit reached — new outbound sends are paused for 24 hours. Replies to customer-initiated chats still work.",
  },
  BANNED: {
    severity: "critical",
    label: "Banned",
    description: "This number can no longer send messages. An appeal through Meta is required to restore it.",
  },
};

const QUALITY_META: Record<string, { severity: Severity; label: string }> = {
  GREEN: { severity: "good", label: "Healthy" },
  YELLOW: { severity: "warning", label: "Medium — at risk" },
  RED: { severity: "critical", label: "Low — action needed" },
  NA: { severity: "neutral", label: "Not yet rated" },
  UNKNOWN: { severity: "neutral", label: "Unknown" },
};

const TIER_LABELS: Record<string, string> = {
  TIER_50: "50 conversations / 24h",
  TIER_250: "250 conversations / 24h",
  TIER_1K: "1,000 conversations / 24h",
  TIER_10K: "10,000 conversations / 24h",
  TIER_100K: "100,000 conversations / 24h",
  TIER_UNLIMITED: "Unlimited",
};

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
      <p className="text-[15px] font-semibold text-gray-800 break-words">{value}</p>
    </div>
  );
}

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function NumberHealthPage() {
  const [user, setUser] = useState<{ role: string } | null>(null);
  const [status, setStatus] = useState<WhatsAppPhoneStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<WhatsAppPhoneNumberSummary[] | null>(null);
  const [numbersError, setNumbersError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
  }, []);

  const load = useCallback((isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    Promise.allSettled([apiGetWhatsAppStatus(), apiGetWhatsAppNumbers()])
      .then(([statusResult, numbersResult]) => {
        if (statusResult.status === "fulfilled") {
          setStatus(statusResult.value.data);
          setError(null);
        } else {
          setError(statusResult.reason instanceof Error ? statusResult.reason.message : "Couldn't load WhatsApp number status.");
        }
        if (numbersResult.status === "fulfilled") {
          setNumbers(numbersResult.value.data);
          setNumbersError(null);
        } else {
          setNumbers(null);
          setNumbersError(numbersResult.reason instanceof Error ? numbersResult.reason.message : "Couldn't load numbers list.");
        }
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    if (user?.role === "ADMIN") load(false);
  }, [user, load]);

  // Quality rating / status shift over hours, not seconds, so a light
  // background poll is enough — no need for socket push here. Uses the same
  // quiet refresh path as the manual button (spinner on the icon only, no
  // full-page loading flash).
  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    const interval = setInterval(() => load(true), 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, load]);

  if (!user) return null;

  if (user.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <Lock className="w-10 h-10 text-gray-300" />
        <h1 className="text-lg font-semibold text-gray-500">Admin access only</h1>
      </div>
    );
  }

  const statusMeta = status ? (STATUS_META[status.status] ?? { severity: "neutral" as Severity, label: status.status, description: "Unrecognized status returned by WhatsApp." }) : null;
  const qualityMeta = status ? (QUALITY_META[status.qualityRating] ?? { severity: "neutral" as Severity, label: status.qualityRating }) : null;
  const StatusIcon = statusMeta ? SEVERITY_ICONS[statusMeta.severity] : HelpCircle;

  return (
    <div className="flex-1 overflow-y-auto bg-[#f9f9f8]">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EEF6F1] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#3B694C]" />
            </div>
            <div>
              <h1 className="text-[22px] font-bold text-gray-900">Number Health</h1>
              <p className="text-[13px] text-gray-400 mt-0.5">
                {status ? `Last checked ${formatCheckedAt(status.fetchedAt)}` : "WhatsApp phone number reputation and status"}
              </p>
            </div>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-24">
            <svg className="w-8 h-8 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white border border-red-200 rounded-2xl p-6 text-center">
            <AlertOctagon className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-gray-800 mb-1">Couldn't load number status</p>
            <p className="text-[13px] text-gray-500">{error}</p>
          </div>
        )}

        {!loading && !error && status && statusMeta && qualityMeta && (
          <>
            {/* Primary status banner */}
            <div className={`rounded-2xl border p-6 flex items-start gap-4 ${SEVERITY_STYLES[statusMeta.severity].bg} ${SEVERITY_STYLES[statusMeta.severity].border}`}>
              <StatusIcon className={`w-8 h-8 shrink-0 ${SEVERITY_STYLES[statusMeta.severity].text}`} />
              <div>
                <p className={`text-[17px] font-bold ${SEVERITY_STYLES[statusMeta.severity].text}`}>{statusMeta.label}</p>
                <p className="text-[13px] text-gray-600 mt-1">{statusMeta.description}</p>
              </div>
            </div>

            {/* Quality rating */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Quality rating</p>
                <p className="text-[13px] text-gray-500">Meta's rolling assessment of this number's message quality.</p>
              </div>
              <span className={`text-[13px] font-bold px-3 py-1.5 rounded-full ${SEVERITY_STYLES[qualityMeta.severity].bg} ${SEVERITY_STYLES[qualityMeta.severity].text}`}>
                {qualityMeta.label}
              </span>
            </div>

            {/* Detail tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatTile label="Verified name" value={status.verifiedName || "—"} />
              <StatTile label="Phone number" value={status.displayPhoneNumber || "—"} />
              <StatTile label="Name status" value={status.nameStatus || "—"} />
              <StatTile label="Code verification" value={status.codeVerificationStatus || "—"} />
              <StatTile label="Throughput" value={status.throughputLevel || "—"} />
              <StatTile
                label="Messaging limit"
                value={status.messagingLimitTier ? (TIER_LABELS[status.messagingLimitTier] ?? status.messagingLimitTier) : "Not available for this account"}
              />
            </div>

            {/* All numbers on the WhatsApp Business Account */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-[14px] font-bold text-gray-900">All numbers on this account</p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  Every phone number on your WhatsApp Business Account, not just the one this app sends from.
                </p>
              </div>
              {numbersError ? (
                <div className="px-5 py-6 text-center text-[13px] text-gray-500">{numbersError}</div>
              ) : numbers && numbers.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {numbers.map((n) => {
                    const nStatusMeta = STATUS_META[n.status] ?? { severity: "neutral" as Severity, label: n.status };
                    const nQualityMeta = QUALITY_META[n.qualityRating] ?? { severity: "neutral" as Severity, label: n.qualityRating };
                    return (
                      <div key={n.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">{n.displayPhoneNumber || n.id}</p>
                            {n.isPrimary && (
                              <span className="text-[10px] font-semibold text-[#3B694C] bg-[#EEF6F1] px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                                This app
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-gray-400 truncate">{n.verifiedName || "—"}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${SEVERITY_STYLES[nQualityMeta.severity].bg} ${SEVERITY_STYLES[nQualityMeta.severity].text}`}>
                            {nQualityMeta.label}
                          </span>
                          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${SEVERITY_STYLES[nStatusMeta.severity].bg} ${SEVERITY_STYLES[nStatusMeta.severity].text}`}>
                            {nStatusMeta.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-6 text-center text-[13px] text-gray-400">No numbers found.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
