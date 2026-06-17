"use client";

import { useState, useEffect } from "react";
import { Lock } from "lucide-react";
import { apiGetConversations, apiGetAuditLog } from "@/lib/api";
import type { Conversation, AuditLog } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(username: string | null): string {
  if (!username) return "?";
  return username
    .split(/[\s_-]+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

function mapAction(action: string): string {
  if (action === "conversation.assigned") return "assigned conversation";
  if (action === "conversation.status_changed") return "changed status of conversation";
  return action;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-6 py-24">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
        <Lock className="w-7 h-7 text-red-400" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-[17px] font-bold text-gray-900">Access Denied</h2>
        <p className="text-[14px] text-gray-500">This page is for admins only.</p>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  sub: string;
  subGreen?: boolean;
}

function StatCard({ title, value, sub, subGreen }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide leading-tight">
        {title}
      </span>
      <span className="text-[28px] font-bold text-gray-900 leading-tight">
        {value}
      </span>
      <span
        className={`text-[12px] font-medium leading-tight ${
          subGreen ? "text-[#3B694C]" : "text-gray-400"
        }`}
      >
        {sub}
      </span>
    </div>
  );
}

// Simple inline-SVG bar chart — no external lib
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Placeholder heights as per design spec
const PLACEHOLDER_HEIGHTS = [62, 84, 71, 96, 110, 138, 47];
const BRAND = "#3B694C";

function BarChart({ total }: { total: number }) {
  const maxH = Math.max(...PLACEHOLDER_HEIGHTS);
  const chartH = 120;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex-1 min-w-0">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Messages received</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">Last 7 days</p>
        </div>
        <span className="text-[13px] font-semibold text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
          {total} this week
        </span>
      </div>

      {/* Bar chart */}
      <div
        className="flex items-end gap-2"
        style={{ height: chartH + 20 }}
        aria-label="Messages per day bar chart (placeholder data)"
      >
        {PLACEHOLDER_HEIGHTS.map((h, i) => {
          const barH = Math.round((h / maxH) * chartH);
          const isMax = h === maxH;
          return (
            <div key={DAYS[i]} className="flex flex-col items-center flex-1 gap-1">
              <span className="text-[11px] text-gray-400">{h}</span>
              <div
                className={isMax ? "bg-[#3B694C]" : "bg-[#3B694C]/20"}
                style={{
                  height: barH,
                  borderRadius: "4px 4px 0 0",
                  width: "100%",
                }}
              />
              <span className="text-[11px] text-gray-400 font-medium">
                {DAYS[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityFeed({ logs }: { logs: AuditLog[] }) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-100 p-5 w-80 lg:w-96 shrink-0 flex flex-col"
      style={{ minWidth: 0 }}
    >
      <h2 className="text-[15px] font-bold text-gray-900 mb-4">Recent activity</h2>

      {logs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-gray-400">No recent activity.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 overflow-y-auto max-h-[340px] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
          {logs.map((entry) => {
            const initials = getInitials(entry.actorUsername);
            const actionText = mapAction(entry.action);
            return (
              <div key={entry.id} className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[11px] font-bold text-gray-600 leading-none">
                    {initials}
                  </span>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-gray-700 leading-snug">
                    <span className="font-semibold text-gray-900">
                      {entry.actorUsername ?? "System"}
                    </span>{" "}
                    {actionText}{" "}
                    <span className="text-gray-500">
                      {entry.targetType} #{entry.targetId}
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {relativeTime(entry.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [user, setUser] = useState<{ role: string } | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convTotal, setConvTotal] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Read user from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
  }, []);

  // Fetch data once we know user is ADMIN
  useEffect(() => {
    if (user?.role !== "ADMIN") {
      setLoading(false);
      return;
    }

    async function fetchAll() {
      setLoading(true);
      try {
        const [convRes, auditRes] = await Promise.allSettled([
          apiGetConversations(1, 50),
          apiGetAuditLog(1, 8),
        ]);

        if (convRes.status === "fulfilled") {
          setConversations(convRes.value.data);
          setConvTotal(
            convRes.value.pagination?.total ?? convRes.value.data.length
          );
        }

        if (auditRes.status === "fulfilled") {
          setAuditLogs(auditRes.value.data);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, [user]);

  // ---------------------------------------------------------------------------
  // Derived stats
  // ---------------------------------------------------------------------------
  const awaitingReply = conversations.filter(
    (c) => c.lastSenderType === "CUSTOMER"
  ).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Initial mount — user not yet read from localStorage
  if (user === null && loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-white rounded-xl border border-gray-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (user?.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <Lock className="w-10 h-10 text-gray-300" />
        <h1 className="text-lg font-semibold text-gray-500">Admin access only</h1>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 bg-gray-50 min-h-screen">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Overview of activity across the workspace
          </p>
        </div>
        <button
          type="button"
          className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Export report
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard
          title="Open conversations"
          value={loading ? "—" : convTotal}
          sub="+0 today"
          subGreen
        />
        <StatCard
          title="Awaiting reply"
          value={loading ? "—" : awaitingReply}
          sub="avg 3m 12s"
        />
        <StatCard
          title="AI-handled"
          value="—"
          sub="N/A"
        />
        <StatCard
          title="Conversations"
          value={loading ? "—" : convTotal}
          sub="this week"
        />
      </div>

      {/* Bottom row: chart + activity */}
      <div className="mt-6 flex flex-col lg:flex-row gap-6">
        <BarChart total={convTotal} />
        <ActivityFeed logs={auditLogs} />
      </div>
    </div>
  );
}
