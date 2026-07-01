"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ArrowLeft, Loader2, Search, ChevronRight, ChevronLeft } from "lucide-react";
import type { Template, Customer, Conversation } from "@/types";
import {
  apiGetTemplates,
  apiGetCampaign,
  apiGetCustomers,
  apiGetConversations,
  apiCreateCampaign,
  apiUpdateCampaign,
  apiSendCampaignNow,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";

// ── Constants ────────────────────────────────────────────────────────────────

const COST_PER_MSG = 0.018;
const SEND_RATE_S = 2.5;


const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: "General",
  CAMPAIGN: "Promotion",
  RE_ENGAGEMENT: "Re-engage",
};

const CATEGORY_COLORS: Record<string, string> = {
  GENERAL: "bg-blue-50 text-blue-600",
  CAMPAIGN: "bg-purple-50 text-purple-600",
  RE_ENGAGEMENT: "bg-orange-50 text-orange-600",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function extractVars(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
  return [...new Set(matches)];
}

function resolvePreview(text: string | null | undefined, sampleName: string): string {
  if (!text) return "";
  const first = sampleName.split(" ")[0] || "Customer";
  return text
    .replace(/\{\{first_name\}\}/g, first)
    .replace(/\{\{customer_name\}\}/g, sampleName || "Customer")
    .replace(/\{\{agent_name\}\}/g, "Team");
}

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepDot({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state: "done" | "active" | "pending";
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
          state === "done"
            ? "bg-[#3B694C] text-white"
            : state === "active"
            ? "bg-[#3B694C] text-white ring-4 ring-[#DCF2E3]"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        {state === "done" ? <Check className="w-3 h-3" /> : n}
      </div>
      <span
        className={`text-[13px] font-medium ${
          state === "active" ? "text-gray-900" : state === "done" ? "text-[#3B694C]" : "text-gray-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ── WhatsApp Preview Bubble ───────────────────────────────────────────────────

function WaBubble({ template, sampleName }: { template: Template; sampleName: string }) {
  const header = resolvePreview(template.header, sampleName);
  const body = resolvePreview(template.body, sampleName);
  const footer = template.footer;
  const buttons = template.buttons;

  return (
    <div className="bg-[#3B694C] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[280px] shadow-md">
      {header && (
        <p className="text-white font-semibold text-[13px] mb-1">{header}</p>
      )}
      <p className="text-white text-[13px] leading-relaxed whitespace-pre-wrap">{body}</p>
      {footer && (
        <p className="text-white/60 text-[11px] mt-1">{footer}</p>
      )}
      {buttons && buttons.length > 0 && (
        <div className="mt-2 space-y-1">
          {buttons.map((b) => (
            <div key={b.id} className="bg-white/20 rounded-lg px-3 py-1 text-center">
              <span className="text-white text-[12px] font-medium">{b.title}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-white/40 text-[10px] text-right mt-1">
        {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ✓✓
      </p>
    </div>
  );
}

// ── Step 1: Choose Template ───────────────────────────────────────────────────

function Step1({
  selected,
  onSelect,
  sampleName,
}: {
  selected: Template | null;
  onSelect: (t: Template) => void;
  sampleName: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetTemplates({ status: "APPROVED", category: "CAMPAIGN" })
      .then((res) => setTemplates(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Template list */}
      <div className="w-[55%] border-r border-gray-100 overflow-y-auto p-6 space-y-3">
        <h2 className="text-[18px] font-bold text-gray-900">Choose a template</h2>
        <p className="text-[13px] text-gray-500 mb-4">Pick a saved message template. Variables fill in per recipient.</p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-[13px] text-gray-400">No approved Campaign templates found.</div>
        ) : (
          templates.map((t) => {
            const vars = extractVars(t.body);
            const isSelected = selected?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t)}
                className={`w-full text-left rounded-xl border p-4 transition-all cursor-pointer ${
                  isSelected
                    ? "border-[#3B694C] bg-[#EEF6F1] ring-1 ring-[#3B694C]"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? "border-[#3B694C] bg-[#3B694C]" : "border-gray-300"
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-[14px] font-semibold text-gray-800">{t.name}</span>
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[t.category] ?? "bg-gray-100 text-gray-500"}`}>
                    {CATEGORY_LABELS[t.category] ?? t.category}
                  </span>
                </div>
                <p className="text-[12px] text-gray-500 line-clamp-2 mb-2 ml-6">{t.body}</p>
                {vars.length > 0 && (
                  <div className="flex flex-wrap gap-1 ml-6">
                    {vars.map((v) => (
                      <span key={v} className="text-[11px] font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md">{v}</span>
                    ))}
                  </div>
                )}
              </button>
            );
          })
        )}

        <a
          href="/templates"
          className="block text-center text-[13px] text-[#3B694C] hover:underline py-3 border border-dashed border-gray-200 rounded-xl cursor-pointer"
        >
          + New template
        </a>
      </div>

      {/* Live preview */}
      <div className="w-[45%] bg-[#f5f4f0] flex flex-col items-center justify-start p-8 overflow-y-auto">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-4 self-start">Live Preview</p>
        {selected ? (
          <>
            <div className="self-start flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-full bg-[#3B694C] flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-[13px]">{initials(sampleName)}</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-800">{sampleName || "Sample Customer"}</p>
              </div>
            </div>
            <div className="self-start">
              <WaBubble template={selected} sampleName={sampleName} />
            </div>
            <p className="self-start text-[11px] text-gray-400 mt-3">
              Renders for: {sampleName || "Sample Customer"}
            </p>
            <p className="self-start text-[11px] text-gray-400 mt-0.5">
              {selected.body.length}/1600
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/60 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-[13px] text-gray-400">Select a template to see a preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Select Recipients ─────────────────────────────────────────────────

function Step2({
  selectedIds,
  onToggle,
  onToggleAll,
  customers,
  convMap,
  loading,
}: {
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: number[], select: boolean) => void;
  customers: Customer[];
  convMap: Map<number, Conversation>;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("All");

  const allTags = [...new Set(customers.flatMap((c) => c.tags))].sort();

  const now = Date.now();
  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    if (q && !c.name?.toLowerCase().includes(q) && !c.phone.includes(q)) return false;
    if (tagFilter === "All") return true;
    if (tagFilter === "Lapsed 60d+") {
      const conv = convMap.get(c.id ?? 0);
      if (!conv) return true;
      if (!conv.lastCustomerMessageAt) return true;
      return now - new Date(conv.lastCustomerMessageAt).getTime() > SIXTY_DAYS;
    }
    return c.tags.includes(tagFilter);
  });

  const filteredIds = filtered.map((c) => c.id as number).filter(Boolean);
  const optedOut = customers.filter((c) => (c as Customer & { optedOut?: boolean }).optedOut).length;
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  const estimatedSeconds = selectedIds.size / SEND_RATE_S;
  const estimatedCost = (selectedIds.size * COST_PER_MSG).toFixed(2);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main */}
      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="text-[18px] font-bold text-gray-900 mb-1">Select recipients</h2>
        <p className="text-[13px] text-gray-500 mb-5">
          {selectedIds.size} of {customers.length} contacts selected.
        </p>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full pl-9 pr-4 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C]"
          />
        </div>

        {/* Tag filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {["All", ...allTags, "Lapsed 60d+"].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tag)}
              className={`text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                tagFilter === tag
                  ? "bg-[#3B694C] text-white border-[#3B694C]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => onToggleAll(filteredIds, e.target.checked)}
                      className="rounded border-gray-300 accent-[#3B694C]"
                    />
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Name</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Phone</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Tag</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => {
                  const isOptedOut = (c as Customer & { optedOut?: boolean }).optedOut;
                  const id = c.id as number;
                  const conv = convMap.get(id);
                  return (
                    <tr
                      key={id}
                      onClick={() => !isOptedOut && onToggle(id)}
                      className={`transition-colors ${isOptedOut ? "opacity-40 cursor-default" : "cursor-pointer hover:bg-gray-50"}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(id)}
                          disabled={isOptedOut}
                          onChange={() => onToggle(id)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-gray-300 accent-[#3B694C]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#EEF6F1] flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-[#3B694C]">{initials(c.name)}</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 leading-tight">{c.name || "—"}</p>
                            {isOptedOut && <p className="text-[10px] text-red-400">opted out</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-500 font-mono text-[12px]">{c.phone}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-400 text-[12px]">
                        {conv?.lastMessage ? (
                          <span>{conv.lastMessage.slice(0, 35)}{conv.lastMessage.length > 35 ? "…" : ""} · {relativeDate(conv.lastMessageAt)}</span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-[280px] border-l border-gray-100 bg-white p-5 flex flex-col gap-4 shrink-0 overflow-y-auto">
        <div>
          <p className="text-[40px] font-bold text-gray-900 leading-none">{selectedIds.size}</p>
          <p className="text-[13px] text-gray-400 mt-1">recipients selected</p>
        </div>
        <div className="space-y-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Estimated send time</span>
            <span className="font-medium text-gray-800">≈ {formatDuration(estimatedSeconds)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Send rate</span>
            <span className="font-medium text-gray-800">{SEND_RATE_S} msg/s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Per-message cost</span>
            <span className="font-medium text-gray-800">${COST_PER_MSG.toFixed(3)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-3">
            <span className="text-gray-500">Estimated total</span>
            <span className="font-semibold text-gray-900">${estimatedCost}</span>
          </div>
        </div>
        {optedOut > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-[12px] font-semibold text-amber-700">⚠ {optedOut} contact{optedOut > 1 ? "s" : ""} have opted out</p>
            <p className="text-[11px] text-amber-600 mt-0.5">They'll be skipped automatically.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 3: Review & Schedule ─────────────────────────────────────────────────

function Step3({
  template,
  selectedIds,
  customers,
  campaignName,
  onNameChange,
  onGoStep,
  onSubmit,
  submitting,
}: {
  template: Template;
  selectedIds: Set<number>;
  customers: Customer[];
  campaignName: string;
  onNameChange: (v: string) => void;
  onGoStep: (n: number) => void;
  onSubmit: (scheduledAt?: string) => void;
  submitting: boolean;
}) {
  const [sendMode, setSendMode] = useState<"now" | "later">("now");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedTz, setSchedTz] = useState("Asia/Dubai");
  const [detectedTz, setDetectedTz] = useState<string | null>(null);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) { setDetectedTz(tz); setSchedTz(tz); }
  }, []);


  const count = selectedIds.size;
  const estimatedSeconds = count / SEND_RATE_S;
  const estimatedCost = (count * COST_PER_MSG).toFixed(2);

  const selectedCustomers = customers.filter((c) => selectedIds.has(c.id as number));
  const tagCounts: Record<string, number> = {};
  selectedCustomers.forEach((c) => c.tags.forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const tagSummary = Object.entries(tagCounts).map(([t, n]) => `${n} ${t}`).join(" · ");

  const sampleName = selectedCustomers[0]?.name || "Sample Customer";

  function tzToISO(date: string, time: string, tz: string): string {
    const naiveUtc = new Date(`${date}T${time}:00.000Z`);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const p = Object.fromEntries(fmt.formatToParts(naiveUtc).map(({ type, value }) => [type, value]));
    const h = p.hour === "24" ? "00" : p.hour;
    const tzAsUtc = new Date(`${p.year}-${p.month}-${p.day}T${h}:${p.minute}:${p.second}.000Z`).getTime();
    return new Date(naiveUtc.getTime() - (tzAsUtc - naiveUtc.getTime())).toISOString();
  }

  const scheduledAt = sendMode === "later" && schedDate && schedTime
    ? tzToISO(schedDate, schedTime, schedTz)
    : undefined;

  const startDisplay = sendMode === "now"
    ? "Now"
    : scheduledAt
    ? new Date(scheduledAt).toLocaleString("en-US", { timeZone: schedTz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

  const etaMs = sendMode === "now" ? Date.now() : scheduledAt ? new Date(scheduledAt).getTime() : Date.now();
  const etaFinish = new Date(etaMs + estimatedSeconds * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <h2 className="text-[18px] font-bold text-gray-900">Review &amp; schedule</h2>
        <p className="text-[13px] text-gray-500">Double-check everything before sending.</p>

        {/* Campaign name */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Campaign name</label>
          <input
            value={campaignName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="My campaign"
            className="w-full px-4 py-2.5 text-[14px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C]"
          />
        </div>

        {/* Template */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Template</p>
            <button onClick={() => onGoStep(1)} className="text-[12px] font-medium text-[#3B694C] hover:underline cursor-pointer">Change</button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[15px] font-semibold text-gray-800">{template.name}</p>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[template.category] ?? "bg-gray-100 text-gray-500"}`}>
              {CATEGORY_LABELS[template.category] ?? template.category}
            </span>
          </div>
          <WaBubble template={template} sampleName={sampleName} />
          <div className="flex flex-wrap gap-1.5 mt-3">
            {extractVars(template.body).map((v) => (
              <span key={v} className="text-[11px] font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md">{v}</span>
            ))}
          </div>
        </div>

        {/* Recipients */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Recipients</p>
            <button onClick={() => onGoStep(2)} className="text-[12px] font-medium text-[#3B694C] hover:underline cursor-pointer">Edit</button>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[32px] font-bold text-gray-900 leading-none">{count}</p>
            <p className="text-[13px] text-gray-500">contacts will receive this message</p>
          </div>
          {tagSummary && <p className="text-[12px] text-gray-400 mt-1">{tagSummary}</p>}
          <div className="flex gap-1 mt-3">
            {selectedCustomers.slice(0, 6).map((c) => (
              <div key={c.id} className="w-7 h-7 rounded-full bg-[#EEF6F1] flex items-center justify-center" title={c.name || ""}>
                <span className="text-[10px] font-bold text-[#3B694C]">{initials(c.name)}</span>
              </div>
            ))}
            {count > 6 && (
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                <span className="text-[10px] font-medium text-gray-500">+{count - 6}</span>
              </div>
            )}
          </div>
        </div>

        {/* When to send */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">When to send</p>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setSendMode("now")}
              className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-colors border cursor-pointer ${
                sendMode === "now"
                  ? "bg-[#EEF6F1] border-[#3B694C] text-[#3B694C]"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Send now
            </button>
            <button
              type="button"
              onClick={() => setSendMode("later")}
              className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-colors border cursor-pointer ${
                sendMode === "later"
                  ? "bg-[#EEF6F1] border-[#3B694C] text-[#3B694C]"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800"
              }`}
            >
              Schedule for later
            </button>
          </div>
          {sendMode === "later" && (
            <div className="space-y-2">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Date</label>
                <input
                  type="date"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C]"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Time</label>
                <input
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C]"
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20"/></svg>
              Time is in <span className="font-medium text-gray-500">{schedTz.replace(/_/g, " ")}</span> — auto-detected from your device
            </p>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-[300px] border-l border-gray-100 bg-white p-5 flex flex-col gap-4 shrink-0 overflow-y-auto">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Send Summary</p>
        <div className="space-y-2.5 text-[13px]">
          {[
            { label: "Recipients", value: String(count) },
            { label: "Template", value: template.name },
            { label: "Estimated runtime", value: `≈ ${formatDuration(estimatedSeconds)}` },
            { label: "Start", value: startDisplay },
            { label: "ETA finish", value: etaFinish },
            { label: "Per-message cost", value: `$${COST_PER_MSG.toFixed(3)}` },
            { label: "Estimated total", value: `$${estimatedCost}` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">{label}</span>
              <span className="font-medium text-gray-800 text-right">{value}</span>
            </div>
          ))}
        </div>

        <div className="bg-[#EEF6F1] rounded-xl p-3">
          <p className="text-[12px] text-[#3B694C]">
            <span className="font-semibold">Rate-limited:</span> messages send at {SEND_RATE_S}/s to keep your number trusted.
          </p>
        </div>

        <div className="mt-auto space-y-2">
          <button
            onClick={() => onSubmit(scheduledAt)}
            disabled={submitting || !campaignName.trim() || (sendMode === "later" && (!schedDate || !schedTime))}
            className="w-full py-3 rounded-xl text-[14px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5540] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {sendMode === "now"
              ? "Send now"
              : schedDate && schedTime
              ? `Schedule for ${new Date(`${schedDate}T${schedTime}`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${new Date(`${schedDate}T${schedTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
              : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function NewCampaignLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-white">
      <svg className="w-10 h-10 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<NewCampaignLoading />}>
      <NewCampaignContent />
    </Suspense>
  );
}

function NewCampaignContent() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const draftIdParam = searchParams.get("draft");
  const [draftCampaignId, setDraftCampaignId] = useState<number | null>(
    draftIdParam ? parseInt(draftIdParam) : null
  );

  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [convMap, setConvMap] = useState<Map<number, Conversation>>(new Map());
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [campaignName, setCampaignName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(!!draftIdParam);

  const sampleName = customers[0]?.name || "Sample Customer";

  // Load draft if ?draft=ID is in the URL
  useEffect(() => {
    if (!draftCampaignId) return;
    apiGetCampaign(draftCampaignId)
      .then((res) => {
        const c = res.data;
        setCampaignName(c.name);
        if (c.template) {
          setSelectedTemplate(c.template as unknown as Template);
        }
        if (c.recipients && c.recipients.length > 0) {
          setSelectedIds(new Set((c.recipients as { customerId: number }[]).map((r) => r.customerId)));
          setStep(3);
        } else if (c.template) {
          setStep(2);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDraft(false));
  }, [draftCampaignId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const PAGE = 100; // backend caps page size at 100
      const MAX_PAGES = 50; // safety cap → up to 5,000 recipients loaded
      try {
        // Load ALL customers across pages — otherwise recipients past the first
        // page are silently unreachable and "Select all" would under-select.
        const firstCust = await apiGetCustomers(1, PAGE);
        const custItems = [...firstCust.data];
        const custPages = Math.min(firstCust.pagination.totalPages, MAX_PAGES);
        if (custPages > 1) {
          const rest = await Promise.all(
            Array.from({ length: custPages - 1 }, (_, i) => apiGetCustomers(i + 2, PAGE))
          );
          rest.forEach((r) => custItems.push(...r.data));
        }

        // Conversations (also paged) power the last-activity column and Lapsed filter.
        const firstConv = await apiGetConversations(1, PAGE);
        const convItems = [...firstConv.data];
        const convPages = Math.min(firstConv.pagination.totalPages, MAX_PAGES);
        if (convPages > 1) {
          const rest = await Promise.all(
            Array.from({ length: convPages - 1 }, (_, i) => apiGetConversations(i + 2, PAGE))
          );
          rest.forEach((r) => convItems.push(...r.data));
        }

        if (cancelled) return;
        setCustomers(custItems);
        const map = new Map<number, Conversation>();
        convItems.forEach((conv) => {
          if (conv.customerId != null) map.set(Number(conv.customerId), conv);
        });
        setConvMap(map);

        if (firstCust.pagination.total > custItems.length) {
          toast.info(
            `Showing ${custItems.length} of ${firstCust.pagination.total} contacts. Use search or tags to reach the rest.`
          );
        }
      } catch {
        if (!cancelled) toast.error("Couldn't load contacts. Please refresh and try again.");
      } finally {
        if (!cancelled) setLoadingCustomers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (selectedTemplate && !campaignName) {
      const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      setCampaignName(`${selectedTemplate.name} · ${today}`);
    }
  }, [selectedTemplate, campaignName]);

  const handleToggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleAll = (ids: number[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => select ? next.add(id) : next.delete(id));
      return next;
    });
  };

  const handleSaveDraft = async () => {
    if (!selectedTemplate) {
      router.push("/campaigns");
      return;
    }
    setSavingDraft(true);
    try {
      const payload = {
        name: campaignName || `${selectedTemplate.name} · Draft`,
        templateId: selectedTemplate.id,
        recipientIds: [...selectedIds],
      };
      if (draftCampaignId) {
        await apiUpdateCampaign(draftCampaignId, payload);
      } else {
        await apiCreateCampaign(payload);
      }
      toast.success("Draft saved.");
      router.push("/campaigns");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save draft. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async (scheduledAt?: string) => {
    if (!selectedTemplate) return;
    setSubmitting(true);
    try {
      const payload = {
        name: campaignName || `${selectedTemplate.name} · ${new Date().toLocaleDateString()}`,
        templateId: selectedTemplate.id,
        recipientIds: [...selectedIds],
        scheduledAt,
      };
      let campaignId: number;
      if (draftCampaignId) {
        await apiUpdateCampaign(draftCampaignId, payload);
        campaignId = draftCampaignId;
      } else {
        const res = await apiCreateCampaign(payload);
        campaignId = res.data.id;
      }
      if (!scheduledAt) {
        await apiSendCampaignNow(campaignId);
      }
      toast.success(scheduledAt ? "Campaign scheduled." : "Campaign is sending now.");
      router.push("/campaigns");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send campaign. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { n: 1, label: "Template" },
    { n: 2, label: "Recipients" },
    { n: 3, label: "Review & schedule" },
  ];

  const canProceed1 = !!selectedTemplate;
  const canProceed2 = selectedIds.size > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Top bar */}
      <div className="shrink-0 border-b border-gray-100 px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/campaigns")}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-[15px] font-semibold text-gray-800">New campaign</span>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {steps.map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-2">
              <StepDot
                n={n}
                label={label}
                state={step > n ? "done" : step === n ? "active" : "pending"}
              />
              {i < steps.length - 1 && (
                <div className="w-8 h-px bg-gray-200" />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleSaveDraft}
          disabled={savingDraft}
          className="text-[13px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
        >
          {savingDraft ? "Saving…" : "Save draft"}
        </button>
      </div>

      {/* Step content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loadingDraft ? (
          <div className="flex-1 flex items-center justify-center">
            <svg className="w-10 h-10 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        ) : (
          <>
            {step === 1 && (
              <Step1
                selected={selectedTemplate}
                onSelect={setSelectedTemplate}
                sampleName={sampleName}
              />
            )}
            {step === 2 && (
              <Step2
                selectedIds={selectedIds}
                onToggle={handleToggle}
                onToggleAll={handleToggleAll}
                customers={customers}
                convMap={convMap}
                loading={loadingCustomers}
              />
            )}
            {step === 3 && selectedTemplate && (
              <Step3
                template={selectedTemplate}
                selectedIds={selectedIds}
                customers={customers}
                campaignName={campaignName}
                onNameChange={setCampaignName}
                onGoStep={setStep}
                onSubmit={handleSubmit}
                submitting={submitting}
              />
            )}
          </>
        )}
      </div>

      {/* Footer nav (steps 1 & 2) */}
      {!loadingDraft && step < 3 && (
        <div className="shrink-0 border-t border-gray-100 px-6 py-4 flex items-center justify-between bg-white">
          <button
            onClick={() => (step === 1 ? router.push("/campaigns") : setStep(step - 1))}
            className="text-[13px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 px-5 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? "Cancel" : "Back"}
          </button>
          <button
            onClick={() => setStep(step + 1)}
            disabled={(step === 1 && !canProceed1) || (step === 2 && !canProceed2)}
            className="text-[13px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5540] disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {step === 1 ? "Continue → Recipients" : "Review →"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
