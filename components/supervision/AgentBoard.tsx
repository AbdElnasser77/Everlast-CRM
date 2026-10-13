"use client";

import { useMemo } from "react";
import { UserRound, Users } from "lucide-react";
import type { SupervisionAgent, SupervisionOverview } from "@/types";
import { PRESENCE } from "./chips";
import { formatMinutes, personInitials, personName, timeAgo } from "./format";

export type AgentFilter = number | "unassigned" | null;

const PRESENCE_ORDER = { ONLINE: 0, ON_BREAK: 1, OFFLINE: 2 } as const;

const SCROLLER =
  "flex gap-3 overflow-x-auto pb-1.5 -mb-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(59,105,76,0.25)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-brand/25 [&::-webkit-scrollbar-thumb]:rounded-full";

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "red" | "green" | "muted" }) {
  return (
    <div className="min-w-0">
      <p
        className={`text-[15px] font-bold leading-tight tabular-nums ${
          tone === "red" ? "text-red-600" : tone === "green" ? "text-brand-fg" : tone === "muted" ? "text-gray-300" : "text-gray-800"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5 truncate">{label}</p>
    </div>
  );
}

function cardClass(active: boolean, alert: boolean) {
  return `shrink-0 w-[248px] text-left bg-white rounded-xl border p-3.5 transition-colors cursor-pointer ${
    active
      ? "border-brand bg-brand-50 ring-1 ring-brand/15"
      : alert
        ? "border-red-200 hover:border-red-300"
        : "border-gray-100 hover:border-gray-200"
  }`;
}

function AgentCard({ agent, active, now, onClick }: { agent: SupervisionAgent; active: boolean; now: number; onClick: () => void }) {
  const presence = PRESENCE[agent.status] ?? PRESENCE.OFFLINE;
  const late = agent.waitingOverSla > 0;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cardClass(active, late)}>
      <div className="flex items-center gap-2.5">
        <span className="relative shrink-0">
          <span
            className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold ${
              agent.status === "OFFLINE" ? "bg-gray-100 text-gray-500" : "bg-brand-100 text-brand-fg"
            }`}
          >
            {personInitials(agent)}
          </span>
          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${presence.dot}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-gray-900 truncate">{personName(agent)}</p>
          <p className="text-[11px] text-gray-400 truncate">
            {presence.label}
            {agent.status !== "ONLINE" && agent.lastActiveAt ? ` · active ${timeAgo(agent.lastActiveAt, now)}` : ""}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1.5 mt-3 pt-2.5 border-t border-gray-50">
        <Stat label="Open" value={agent.openChats} tone={agent.openChats === 0 ? "muted" : undefined} />
        <Stat
          label={late ? `${agent.waitingOverSla} late` : "Waiting"}
          value={agent.waiting}
          tone={late ? "red" : agent.waiting === 0 ? "muted" : undefined}
        />
        <Stat label="Replies" value={agent.repliesToday} tone={agent.repliesToday === 0 ? "muted" : undefined} />
        <Stat label="Avg" value={formatMinutes(agent.avgResponseMinutes)} tone={agent.avgResponseMinutes === null ? "muted" : undefined} />
        <Stat label="Booked" value={agent.bookedToday} tone={agent.bookedToday > 0 ? "green" : "muted"} />
      </div>
    </button>
  );
}

/**
 * One card per agent with today's numbers. Clicking a card narrows the chat
 * list to that agent's chats; clicking it again (or "Everyone") clears it.
 * Ordered by presence, then name, so cards don't jump around on refresh.
 */
export function AgentBoard({
  overview,
  loading,
  agentFilter,
  onAgentFilter,
  now,
}: {
  overview: SupervisionOverview | null;
  loading: boolean;
  agentFilter: AgentFilter;
  onAgentFilter: (a: AgentFilter) => void;
  now: number;
}) {
  const agents = useMemo(
    () =>
      [...(overview?.agents ?? [])].sort(
        (a, b) =>
          (PRESENCE_ORDER[a.status] ?? 3) - (PRESENCE_ORDER[b.status] ?? 3) ||
          personName(a).localeCompare(personName(b)),
      ),
    [overview],
  );

  if (!overview) {
    return (
      <div className={SCROLLER}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`shrink-0 w-[248px] h-[118px] bg-white rounded-xl border border-gray-100 p-3.5 ${loading ? "animate-pulse" : ""}`}>
            <div className="flex gap-2.5">
              <div className="w-9 h-9 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="h-3 w-24 bg-gray-100 rounded" />
                <div className="h-2.5 w-16 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const online = agents.filter((a) => a.status === "ONLINE").length;
  const unassigned = overview.kpis.unassignedWaiting;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="text-[15px] font-bold text-gray-900">Team</h2>
        <p className="text-[12px] text-gray-400">
          {online} of {agents.length} online
        </p>
      </div>
      <div className={SCROLLER}>
        <button
          type="button"
          onClick={() => onAgentFilter(null)}
          aria-pressed={agentFilter === null}
          className={`${cardClass(agentFilter === null, false)} !w-[150px] flex flex-col justify-between`}
        >
          <span className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-gray-900">Everyone</span>
            <span className="block text-[11px] text-gray-400">All chats, all agents</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onAgentFilter(agentFilter === "unassigned" ? null : "unassigned")}
          aria-pressed={agentFilter === "unassigned"}
          className={`${cardClass(agentFilter === "unassigned", unassigned > 0)} !w-[170px] flex flex-col justify-between`}
        >
          <span className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full border border-dashed border-amber-300 bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <UserRound className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-gray-900">Unassigned</span>
              <span className="block text-[11px] text-gray-400">Nobody owns these</span>
            </span>
          </span>
          <span className="mt-3 pt-2.5 border-t border-gray-50 block">
            <Stat label="Waiting" value={unassigned} tone={unassigned > 0 ? "red" : "muted"} />
          </span>
        </button>

        {agents.map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            now={now}
            active={agentFilter === a.id}
            onClick={() => onAgentFilter(agentFilter === a.id ? null : a.id)}
          />
        ))}

        {agents.length === 0 && (
          <div className="shrink-0 flex items-center px-4 text-[13px] text-gray-400">No agents on the team yet.</div>
        )}
      </div>
    </div>
  );
}
