"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lock,
  ShieldCheck,
  AlertOctagon,
  RefreshCw,
} from "lucide-react";
import { apiGetWhatsAppStatus, apiGetWhatsAppNumbers, ApiError } from "@/lib/api";
import type { WhatsAppPhoneStatus, WhatsAppPhoneNumberSummary } from "@/types";

type Severity = "good" | "warning" | "critical" | "neutral";

const SEVERITY_STYLES: Record<Severity, { bg: string; text: string; border: string; dot: string }> = {
  good: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  warning: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", dot: "bg-amber-500" },
  critical: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200", dot: "bg-red-500" },
  neutral: { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" },
};

// Meta's documented phone-number status values. FLAGGED and RESTRICTED both
// read as amber ("needs attention, not yet critical") — BANNED is the only
// state that's actually critical/red.
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
    severity: "warning",
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
  GREEN: { severity: "good", label: "High" },
  YELLOW: { severity: "warning", label: "Medium" },
  RED: { severity: "critical", label: "Low" },
  NA: { severity: "neutral", label: "Unknown" },
  UNKNOWN: { severity: "neutral", label: "Unknown" },
};

// Order matters — this is the ladder's left-to-right rendering order.
// Confirm exact enum strings against a live /status response; some accounts
// report TIER_2K instead of TIER_1K for the second rung.
const TIERS: { key: string; cap: number | null; label: string }[] = [
  { key: "TIER_250", cap: 250, label: "250" },
  { key: "TIER_1K", cap: 1000, label: "1,000" },
  { key: "TIER_2K", cap: 2000, label: "2,000" },
  { key: "TIER_10K", cap: 10000, label: "10,000" },
  { key: "TIER_100K", cap: 100000, label: "100,000" },
  { key: "TIER_UNLIMITED", cap: null, label: "Unlimited" },
];

function QualityDot({ severity, label }: { severity: Severity; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_STYLES[severity].dot}`} />
      <span className={`text-[13px] font-semibold ${SEVERITY_STYLES[severity].text}`}>{label}</span>
    </span>
  );
}

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

// Ladder shows every tier as a segment; the one matching the account's
// current tier gets a "Current" badge and accent styling. A null tier (test
// numbers never get one) greys the whole thing out with an explanatory note
// instead of treating it as missing/broken data.
function MessagingLimitsLadder({ tier }: { tier: string | null }) {
  const currentIndex = tier ? TIERS.findIndex((t) => t.key === tier) : -1;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[14px] font-bold text-gray-900">Messaging limits</p>
          <p className="text-[12px] text-gray-400 mt-0.5">Business-initiated conversations / rolling 24h</p>
        </div>
      </div>

      <div className={`grid grid-cols-6 gap-2 ${tier ? "" : "opacity-40"}`}>
        {TIERS.map((t, i) => {
          const isCurrent = i === currentIndex;
          return (
            <div
              key={t.key}
              className={`relative rounded-xl border px-2 py-3 text-center ${
                isCurrent ? "bg-[#EEF6F1] border-[#3B694C]" : "bg-gray-50 border-gray-200"
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wide bg-[#3B694C] text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  Current
                </span>
              )}
              <p className={`text-[12px] font-bold ${isCurrent ? "text-[#3B694C]" : "text-gray-600"}`}>{t.label}</p>
            </div>
          );
        })}
      </div>

      {!tier && (
        <p className="text-[12px] text-gray-400 mt-4">
          No messaging tier yet — Meta hasn't assigned one. This happens for test/sandbox numbers, but also for a genuine
          new production number that hasn't sent a business-initiated message yet. A tier appears after your first send.
        </p>
      )}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="rounded-2xl border border-gray-100 bg-gray-50 h-24" />
      <div className="rounded-2xl border border-gray-100 bg-gray-50 h-32" />
      <div className="rounded-2xl border border-gray-100 bg-gray-50 h-24" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 h-16" />
        ))}
      </div>
    </div>
  );
}

type ErrorKind = "forbidden" | "upstream" | "generic";

export default function NumberHealthPage() {
  const [user, setUser] = useState<{ role: string } | null>(null);
  const [status, setStatus] = useState<WhatsAppPhoneStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ kind: ErrorKind; message: string } | null>(null);
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
          const err = statusResult.reason;
          // 403 → not an admin (defense in depth; the page already gates on
          // role client-side). 502 → WhatsApp's API failed upstream, not a
          // CRM problem. Anything else → generic. Never treat this as a
          // session issue — a real 401 is already handled globally by
          // apiFetch before it ever reaches here.
          if (err instanceof ApiError && err.status === 403) {
            setError({ kind: "forbidden", message: "Admins only." });
          } else if (err instanceof ApiError && err.status === 502) {
            setError({ kind: "upstream", message: err.message });
          } else {
            setError({ kind: "generic", message: err instanceof Error ? err.message : "Couldn't load WhatsApp number status." });
          }
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

  // Quality rating / status shift over hours, not seconds — a light
  // background poll is enough, no need for socket push here. Uses the same
  // quiet refresh path as the manual button (icon spinner only, no
  // full-page loading flash).
  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    const interval = setInterval(() => load(true), 60 * 1000);
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
                {status ? `Last updated ${formatCheckedAt(status.fetchedAt)}` : "WhatsApp phone number reputation and status"}
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

        {loading && <HeaderSkeleton />}

        {!loading && error?.kind === "forbidden" && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
            <Lock className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-gray-800">Admins only</p>
          </div>
        )}

        {!loading && error?.kind === "upstream" && (
          <div className="bg-white border border-amber-200 rounded-2xl p-6 text-center">
            <AlertOctagon className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-gray-800 mb-1">WhatsApp connection error</p>
            <p className="text-[13px] text-gray-500">{error.message}</p>
            <p className="text-[12px] text-gray-400 mt-2">This is a WhatsApp/Meta API problem, not your CRM session — you're still logged in.</p>
          </div>
        )}

        {!loading && error?.kind === "generic" && (
          <div className="bg-white border border-red-200 rounded-2xl p-6 text-center">
            <AlertOctagon className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-gray-800 mb-1">Couldn't load number status</p>
            <p className="text-[13px] text-gray-500">{error.message}</p>
          </div>
        )}

        {!loading && !error && status && statusMeta && qualityMeta && (
          <>
            {/* Primary status banner */}
            <div className={`rounded-2xl border p-6 flex items-center justify-between gap-4 ${SEVERITY_STYLES[statusMeta.severity].bg} ${SEVERITY_STYLES[statusMeta.severity].border}`}>
              <div>
                <span className={`inline-block text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full mb-2 ${SEVERITY_STYLES[statusMeta.severity].bg} ${SEVERITY_STYLES[statusMeta.severity].text} border ${SEVERITY_STYLES[statusMeta.severity].border}`}>
                  {statusMeta.label}
                </span>
                <p className="text-[13px] text-gray-600">{statusMeta.description}</p>
              </div>
            </div>

            {/* Number Health card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Quality rating</p>
                <QualityDot severity={qualityMeta.severity} label={qualityMeta.label} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <StatTile label="Verified name" value={status.verifiedName || "—"} />
                <StatTile label="Phone number" value={status.displayPhoneNumber || "—"} />
                <StatTile label="Name status" value={status.nameStatus || "—"} />
                <StatTile label="Code verification" value={status.codeVerificationStatus || "—"} />
                <StatTile label="Throughput" value={status.throughputLevel || "—"} />
              </div>
            </div>

            {/* Messaging limits ladder */}
            <MessagingLimitsLadder tier={status.messagingLimitTier} />

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
                        <div className="flex items-center gap-3 shrink-0">
                          <QualityDot severity={nQualityMeta.severity} label={nQualityMeta.label} />
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
