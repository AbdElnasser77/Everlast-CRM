"use client";

// Transcripts report: find chats (agent, line, follow-up, late, unanswered,
// search) and tick up to 100 for printing. Screen only.

import { useMemo, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import type { ChatsReportChat } from "@/types";
import { formatPhone } from "../format";
import { MAX_TRANSCRIPTS, chatOutcomeKey, outcomeOrNone } from "./reportFormat";

export type ChatFilter = {
  /** "" = anyone; UNASSIGNED = nobody assigned; else a person's name (assigned or replied). */
  agent: string;
  line: string;
  /** "" = any; NONE = no follow-up; FOLLOW_UP = has one. */
  outcome: string;
  late: boolean;
  unanswered: boolean;
  search: string;
};

export const EMPTY_FILTER: ChatFilter = { agent: "", line: "", outcome: "", late: false, unanswered: false, search: "" };
export const UNASSIGNED = "__unassigned";

/** FOLLOW_UP or NONE — a legacy outcome (Booked / Not interested / No answer) counts as none. */
const outcomeKey = (c: ChatsReportChat) => chatOutcomeKey(c.outcome);
const FOLLOW_UP_FILTER_LABEL: Record<string, string> = { FOLLOW_UP: "With a follow-up", NONE: "No follow-up" };

/** What a supervisor usually wants to read: late or unanswered. */
export const worthReading = (c: ChatsReportChat) => c.lateResponses > 0 || c.unanswered;

export function matches(c: ChatsReportChat, f: ChatFilter): boolean {
  if (f.agent === UNASSIGNED ? !!c.assignedTo : f.agent && c.assignedTo !== f.agent && !c.repliedBy.includes(f.agent)) return false;
  if (f.line && (c.line ?? "") !== f.line) return false;
  if (f.outcome && outcomeKey(c) !== f.outcome) return false;
  if (f.late && c.lateResponses === 0) return false;
  if (f.unanswered && !c.unanswered) return false;
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = [c.patient, c.phone, formatPhone(c.phone), c.line, c.assignedTo, ...c.repliedBy, ...c.tags, c.campaign].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** The filter in words, for the report's cover. */
export function describeFilter(f: ChatFilter): string[] {
  const out: string[] = [];
  if (f.agent) out.push(f.agent === UNASSIGNED ? "Unassigned chats" : `Agent: ${f.agent}`);
  if (f.line) out.push(`Line: ${f.line}`);
  if (f.outcome) out.push(FOLLOW_UP_FILTER_LABEL[f.outcome] ?? outcomeOrNone(f.outcome));
  if (f.late) out.push("With late replies");
  if (f.unanswered) out.push("Unanswered");
  if (f.search.trim()) out.push(`Search: “${f.search.trim()}”`);
  return out;
}

const BADGE = "text-[10.5px] font-semibold rounded px-1.5 py-px border whitespace-nowrap";
const SELECT = "h-8 text-[12.5px] text-gray-700 bg-white border border-gray-200 hover:border-gray-300 rounded-lg pl-2 pr-7 outline-none focus:border-brand/50 cursor-pointer";
const ACTION =
  "text-[12px] font-medium text-gray-600 border border-gray-200 hover:border-brand/40 hover:text-brand-fg hover:bg-brand-100 rounded-lg px-2.5 py-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default";

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`text-[12px] font-semibold rounded-lg px-2.5 h-8 border transition-colors cursor-pointer ${
        on ? "bg-brand text-white border-brand" : "text-gray-600 bg-white border-gray-200 hover:border-brand/40 hover:text-brand-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function ChatFilterPicker({
  chats,
  filter,
  onFilter,
  selected,
  onChange,
  status,
}: {
  chats: ChatsReportChat[];
  filter: ChatFilter;
  onFilter: (f: ChatFilter) => void;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  status: "idle" | "loading" | "error";
}) {
  const full = selected.size >= MAX_TRANSCRIPTS;
  const set = (patch: Partial<ChatFilter>) => onFilter({ ...filter, ...patch });

  const agents = useMemo(() => [...new Set(chats.flatMap((c) => [c.assignedTo, ...c.repliedBy]).filter((x): x is string => !!x))].sort(), [chats]);
  const lines = useMemo(() => [...new Set(chats.map((c) => c.line).filter((x): x is string => !!x))].sort(), [chats]);
  const outcomes = useMemo(() => {
    const present = new Set<string>(chats.map(outcomeKey));
    return (["FOLLOW_UP", "NONE"] as const).filter((k) => present.has(k));
  }, [chats]);
  const visible = useMemo(() => chats.filter((c) => matches(c, filter)), [chats, filter]);
  const filtered = describeFilter(filter).length > 0;

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_TRANSCRIPTS) next.add(id);
    onChange(next);
  };
  const addShown = () => {
    const next = new Set(selected);
    for (const c of visible) {
      if (next.size >= MAX_TRANSCRIPTS) break;
      next.add(c.id);
    }
    onChange(next);
  };
  const removeShown = () => {
    const next = new Set(selected);
    for (const c of visible) next.delete(c.id);
    onChange(next);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-x-3 gap-y-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800">Choose chats</p>
          <p className="text-[11.5px] text-gray-400">Filter, then tick the chats whose full transcript goes in the PDF (max {MAX_TRANSCRIPTS}).</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-fg bg-brand-100 rounded-md px-2 py-1 tabular-nums">
          {status === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {selected.size} selected{full ? ` (max ${MAX_TRANSCRIPTS})` : ""}
        </span>
      </div>

      {/* Filters */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-1.5 flex-wrap">
        <select aria-label="Agent" value={filter.agent} onChange={(e) => set({ agent: e.target.value })} className={SELECT}>
          <option value="">Any agent</option>
          <option value={UNASSIGNED}>Unassigned</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {lines.length > 1 && (
          <select aria-label="Line" value={filter.line} onChange={(e) => set({ line: e.target.value })} className={SELECT}>
            <option value="">Any line</option>
            {lines.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Follow-up" value={filter.outcome} onChange={(e) => set({ outcome: e.target.value })} className={SELECT}>
          <option value="">Any follow-up</option>
          {outcomes.map((o) => (
            <option key={o} value={o}>
              {FOLLOW_UP_FILTER_LABEL[o]}
            </option>
          ))}
        </select>
        <Toggle on={filter.late} onChange={(v) => set({ late: v })}>
          Late replies
        </Toggle>
        <Toggle on={filter.unanswered} onChange={(v) => set({ unanswered: v })}>
          Unanswered
        </Toggle>
        <label className="ml-auto relative flex items-center">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 pointer-events-none" />
          <input
            value={filter.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Patient, phone, tag…"
            aria-label="Search chats"
            className="h-8 w-48 text-[12.5px] bg-white border border-gray-200 rounded-lg pl-8 pr-2 outline-none focus:border-brand/50"
          />
        </label>
      </div>

      {/* Bulk actions */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1.5 flex-wrap">
        <span className="text-[12px] text-gray-500 mr-1 tabular-nums">
          {visible.length} of {chats.length} chat{chats.length === 1 ? "" : "s"} shown
        </span>
        <button type="button" onClick={addShown} disabled={visible.length === 0 || full} className={ACTION}>
          Select shown{visible.length > MAX_TRANSCRIPTS ? ` (first ${MAX_TRANSCRIPTS})` : ""}
        </button>
        <button type="button" onClick={removeShown} disabled={visible.length === 0} className={ACTION}>
          Unselect shown
        </button>
        <button type="button" onClick={() => onChange(new Set())} disabled={selected.size === 0} className={ACTION}>
          Clear selection
        </button>
        {filtered && (
          <button type="button" onClick={() => onFilter(EMPTY_FILTER)} className={`${ACTION} ml-auto`}>
            Reset filters
          </button>
        )}
      </div>

      {chats.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-gray-400">No chats in this period.</p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-gray-400">No chat matches these filters.</p>
      ) : (
        <ul className="max-h-96 overflow-y-auto divide-y divide-gray-50">
          {visible.map((c) => {
            const on = selected.has(c.id);
            const disabled = !on && full;
            return (
              <li key={c.id}>
                <label
                  className={`flex items-start gap-3 px-4 py-2 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"} ${on ? "bg-brand-100/50" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled}
                    onChange={() => toggle(c.id)}
                    className="mt-0.5 w-4 h-4 accent-brand cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-gray-800 truncate" dir="auto">
                        {c.patient || formatPhone(c.phone)}
                      </span>
                      {c.patient && <span className="text-[11.5px] text-gray-400">{formatPhone(c.phone)}</span>}
                    </span>
                    <span className="block text-[11.5px] text-gray-400 truncate">
                      {c.line || "—"} · {c.assignedTo || "Unassigned"} · {c.patientMessages + c.staffMessages + c.botMessages + c.campaignMessages} msgs
                    </span>
                  </span>
                  <span className="flex items-center gap-1 flex-wrap justify-end shrink-0 max-w-[50%]">
                    {c.lateResponses > 0 && <span className={`${BADGE} bg-red-50 text-red-700 border-red-200`}>{c.lateResponses} late</span>}
                    {c.unanswered && <span className={`${BADGE} bg-red-50 text-red-700 border-red-200`}>Unanswered</span>}
                    {outcomeKey(c) !== "NONE" && <span className={`${BADGE} bg-gray-50 text-gray-500 border-gray-200`}>{outcomeOrNone(c.outcome)}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {status === "error" && <p className="px-4 py-2 text-[12px] text-red-600 border-t border-gray-100">Transcripts couldn’t be loaded — see below.</p>}
    </div>
  );
}
