"use client";

// Which chats' full transcripts go into the report. Screen only.

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { SupervisionReport } from "@/types";
import { formatPhone, personName } from "../format";
import { MAX_TRANSCRIPTS, PICKS, hasOutcome, outcomeLabel, pickIds } from "./reportFormat";

type ReportChat = SupervisionReport["chats"][number];

const QUICK = [
  { label: "Late & unanswered", test: PICKS.attention },
  { label: "None", test: null },
  { label: `All (max ${MAX_TRANSCRIPTS})`, test: PICKS.all },
] as const;

const BADGE = "text-[10.5px] font-semibold rounded px-1.5 py-px border whitespace-nowrap";

export function TranscriptPicker({
  chats,
  selected,
  onChange,
  status,
}: {
  chats: ReportChat[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  /** What the transcript fetch is doing, shown next to the count. */
  status: "idle" | "loading" | "error";
}) {
  const [search, setSearch] = useState("");
  const full = selected.size >= MAX_TRANSCRIPTS;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) =>
      [c.customer.name, c.customer.phone, c.line, c.assignedAgent ? personName(c.assignedAgent) : "unassigned"]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [chats, search]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_TRANSCRIPTS) next.add(id);
    onChange(next);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-x-3 gap-y-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800">Transcripts</p>
          <p className="text-[11.5px] text-gray-400">Full chat transcripts to include at the end of the report.</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-fg bg-brand-100 rounded-md px-2 py-1 tabular-nums">
          {status === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {selected.size} selected{full ? ` (max ${MAX_TRANSCRIPTS})` : ""}
        </span>
      </div>

      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-1.5 flex-wrap">
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            disabled={chats.length === 0}
            onClick={() => onChange(q.test ? pickIds(chats, q.test) : new Set())}
            className="text-[12px] font-medium text-gray-600 border border-gray-200 hover:border-brand/40 hover:text-brand-fg hover:bg-brand-100 rounded-lg px-2.5 py-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            {q.label}
          </button>
        ))}
        <label className="ml-auto relative flex items-center">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a chat"
            aria-label="Find a chat"
            className="h-8 w-44 text-[12.5px] bg-white border border-gray-200 rounded-lg pl-8 pr-2 outline-none focus:border-brand/50"
          />
        </label>
      </div>

      {chats.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-gray-400">No chats in this period.</p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-gray-400">No chat matches “{search}”.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto divide-y divide-gray-50">
          {visible.map((c) => {
            const on = selected.has(c.id);
            const disabled = !on && full;
            return (
              <li key={c.id}>
                <label
                  className={`flex items-start gap-3 px-4 py-2 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"} ${on ? "bg-[#f6faf7]" : ""}`}
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
                        {c.customer.name || formatPhone(c.customer.phone)}
                      </span>
                      {c.customer.name && <span className="text-[11.5px] text-gray-400">{formatPhone(c.customer.phone)}</span>}
                    </span>
                    <span className="block text-[11.5px] text-gray-400 truncate">
                      {c.line || "—"} · {c.assignedAgent ? personName(c.assignedAgent) : "Unassigned"} · {c.messages} msg{c.messages === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 flex-wrap justify-end shrink-0 max-w-[50%]">
                    {c.lateResponses > 0 && <span className={`${BADGE} bg-red-50 text-red-700 border-red-200`}>{c.lateResponses} late</span>}
                    {c.unanswered && <span className={`${BADGE} bg-red-50 text-red-700 border-red-200`}>Unanswered</span>}
                    {/* Only a follow-up shows; a legacy outcome counts as none. */}
                    {hasOutcome(c.outcome) && <span className={`${BADGE} bg-gray-50 text-gray-500 border-gray-200`}>{outcomeLabel(c.outcome)}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {status === "error" && <p className="px-4 py-2 text-[12px] text-red-600 border-t border-gray-100">Transcripts couldn’t be loaded — see the report below.</p>}
    </div>
  );
}
