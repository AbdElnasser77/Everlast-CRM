"use client";

import { useState, useEffect } from "react";
import { Lock } from "lucide-react";
import {
  apiGetStatsOverview,
  apiGetStatsMessages,
  apiGetStatsAgents,
  apiGetAuditLog,
} from "@/lib/api";
import type { AuditLog, StatsOverview, MessageChartDay, AgentStat } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function getInitials(name: string | null, username: string): string {
  const src = name ?? username;
  return src
    .split(/[\s_-]+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function formatMinutes(min: number | null): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "< 1m";
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function buildLast7Days(chart: MessageChartDay[]) {
  const dataMap = new Map(chart.map((c) => [c.date, c]));
  const days: { label: string; incoming: number; outgoing: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { weekday: "short" });
    const entry = dataMap.get(dateStr);
    days.push({ label, incoming: entry?.incoming ?? 0, outgoing: entry?.outgoing ?? 0 });
  }
  return days;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
      <span className="text-[28px] font-bold text-gray-900 leading-tight">{value}</span>
      <span className={`text-[12px] font-medium leading-tight ${subGreen ? "text-[#3B694C]" : "text-gray-400"}`}>
        {sub}
      </span>
    </div>
  );
}

function BarChart({ days, totalWeek }: { days: { label: string; incoming: number; outgoing: number }[]; totalWeek: number }) {
  const values = days.map((d) => d.incoming + d.outgoing);
  const maxVal = Math.max(...values, 1);
  const chartH = 120;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex-1 min-w-0">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Messages</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">Last 7 days</p>
        </div>
        <span className="text-[13px] font-semibold text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
          {totalWeek} this week
        </span>
      </div>

      <div className="flex items-end gap-2" style={{ height: chartH + 20 }}>
        {days.map((day, i) => {
          const total = day.incoming + day.outgoing;
          const barH = Math.round((total / maxVal) * chartH);
          const isMax = total === Math.max(...values);
          return (
            <div key={i} className="flex flex-col items-center flex-1 gap-1" title={`${day.label}: ${day.incoming} in, ${day.outgoing} out`}>
              <span className="text-[10px] text-gray-400">{total > 0 ? total : ""}</span>
              {barH > 0 ? (
                <div
                  className={isMax ? "bg-[#3B694C]" : "bg-[#3B694C]/20"}
                  style={{ height: barH, borderRadius: "4px 4px 0 0", width: "100%" }}
                />
              ) : (
                <div style={{ height: 3, borderRadius: "4px 4px 0 0", width: "100%" }} className="bg-gray-100" />
              )}
              <span className="text-[11px] text-gray-400 font-medium">{day.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityFeed({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 w-80 lg:w-96 shrink-0 flex flex-col">
      <h2 className="text-[15px] font-bold text-gray-900 mb-4">Recent activity</h2>

      {logs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-gray-400">No recent activity.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 overflow-y-auto max-h-[340px] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
          {logs.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[11px] font-bold text-gray-600 leading-none">
                  {getInitials(null, entry.actorUsername ?? "?")}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-gray-700 leading-snug">
                  <span className="font-semibold text-gray-900">{entry.actorUsername ?? "System"}</span>{" "}
                  {mapAction(entry.action)}{" "}
                  <span className="text-gray-500">{entry.targetType} #{entry.targetId}</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{relativeTime(entry.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { dot: string; label: string; text: string; bg: string }> = {
    ONLINE:   { dot: "bg-green-500",  label: "Online",   text: "text-green-700",  bg: "bg-green-50" },
    ON_BREAK: { dot: "bg-yellow-400", label: "On break", text: "text-yellow-700", bg: "bg-yellow-50" },
    OFFLINE:  { dot: "bg-gray-300",   label: "Offline",  text: "text-gray-500",   bg: "bg-gray-50" },
  };
  const cfg = configs[status] ?? configs.OFFLINE;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function AgentPerformanceTable({ agents }: { agents: AgentStat[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="text-[15px] font-bold text-gray-900 mb-4">Agent Performance</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="pb-3 pr-4 font-semibold">Agent</th>
              <th className="pb-3 pr-4 font-semibold">Status</th>
              <th className="pb-3 pr-4 font-semibold text-right">Assigned</th>
              <th className="pb-3 pr-4 font-semibold text-right">Messages (7d)</th>
              <th className="pb-3 font-semibold text-right">Avg Reply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#EEF6F1] flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-[#3B694C]">{getInitials(agent.name, agent.username)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{agent.name ?? agent.username}</p>
                      {agent.name && <p className="text-[11px] text-gray-400 truncate">@{agent.username}</p>}
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={agent.status} />
                </td>
                <td className="py-3 pr-4 text-right font-semibold text-gray-800">{agent.assignedConversations}</td>
                <td className="py-3 pr-4 text-right font-semibold text-gray-800">{agent.messagesSentLast7Days}</td>
                <td className="py-3 text-right text-gray-500">{formatMinutes(agent.avgResponseTimeMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {agents.length === 0 && (
          <p className="text-center text-[13px] text-gray-400 py-8">No agents found.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [user, setUser] = useState<{ role: string } | null>(null);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [chartDays, setChartDays] = useState<{ label: string; incoming: number; outgoing: number }[]>([]);
  const [agents, setAgents] = useState<AgentStat[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== "ADMIN") {
      setLoading(false);
      return;
    }

    async function fetchAll() {
      setLoading(true);
      const [overviewRes, messagesRes, agentsRes, auditRes] = await Promise.allSettled([
        apiGetStatsOverview(),
        apiGetStatsMessages(7),
        apiGetStatsAgents(),
        apiGetAuditLog(1, 8),
      ]);

      if (overviewRes.status === "fulfilled") setOverview(overviewRes.value.data);
      if (messagesRes.status === "fulfilled") setChartDays(buildLast7Days(messagesRes.value.data.chart));
      if (agentsRes.status === "fulfilled") setAgents(agentsRes.value.data.agents);
      if (auditRes.status === "fulfilled") setAuditLogs(auditRes.value.data);
      setLoading(false);
    }

    fetchAll();
  }, [user]);

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------
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

  const totalWeek = (overview?.messages.last7Days ?? 0);

  return (
    <div className="p-6 lg:p-8 bg-gray-50 min-h-screen overflow-y-auto">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Overview of activity across the workspace
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard
          title="Open conversations"
          value={loading ? "—" : (overview?.conversations.open ?? "—")}
          sub={overview ? `${overview.conversations.unassigned} unassigned` : "—"}
          subGreen
        />
        <StatCard
          title="Pending"
          value={loading ? "—" : (overview?.conversations.pending ?? "—")}
          sub={overview ? `${overview.conversations.total} total` : "—"}
        />
        <StatCard
          title="Messages today"
          value={loading ? "—" : (overview?.messages.today ?? "—")}
          sub={overview ? `${overview.messages.last7Days} last 7 days` : "—"}
          subGreen
        />
        <StatCard
          title="New customers (7d)"
          value={loading ? "—" : (overview?.customers.newLast7Days ?? "—")}
          sub={overview ? `${overview.customers.total} total` : "—"}
        />
      </div>

      {/* Bar chart + activity feed */}
      <div className="mt-6 flex flex-col lg:flex-row gap-6">
        {chartDays.length > 0 ? (
          <BarChart days={chartDays} totalWeek={totalWeek} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 p-5 flex-1 min-w-0 flex items-center justify-center">
            <p className="text-[13px] text-gray-400">{loading ? "Loading chart…" : "No message data"}</p>
          </div>
        )}
        <ActivityFeed logs={auditLogs} />
      </div>

      {/* Agent performance table */}
      <div className="mt-6">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
            <div className="h-4 w-40 bg-gray-100 rounded mb-4" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-4 py-3 border-b border-gray-50">
                <div className="w-8 h-8 rounded-full bg-gray-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 bg-gray-100 rounded" />
                  <div className="h-2.5 w-20 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <AgentPerformanceTable agents={agents} />
        )}
      </div>
    </div>
  );
}
