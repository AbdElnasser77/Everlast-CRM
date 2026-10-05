"use client";

// Development-only floating tracker: every outbound WhatsApp message, Meta's
// billing verdict for it, and what it cost. Rendered by the dashboard layout
// only when NODE_ENV is "development", and backed by /api/dev/billing, which
// the API never mounts in production.

import { useCallback, useEffect, useState } from "react";
import { X, RefreshCw, RotateCcw, Receipt, ArrowLeftRight } from "lucide-react";
import { apiDevBilling } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export interface DevBillingMessage {
  id: number;
  createdAt: string;
  to: string | null;
  name: string | null;
  country: string | null;
  line: string | null;
  conversationId: number | null;
  messageType: string;
  preview: string;
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | null;
  billable: boolean | null;
  pricingCategory: string | null;
  pricingType: string | null;
  costUsd: number | null;
  errorCode: number | null;
  errorTitle: string | null;
  errorHint: string | null;
}

export interface DevBilling {
  since: string;
  totals: {
    messages: number; sent: number; delivered: number; read: number; failed: number; pending: number;
    billable: number; free: number; awaitingPricing: number; noRate: number; costUsd: number;
    byCategory: Record<string, { count: number; costUsd: number }>;
    paymentIssue: boolean;
  };
  messages: DevBillingMessage[];
  rates: Record<string, Record<string, number>>;
}

// Which period the tracker covers. "reset" counts from the moment the reset
// button was pressed; the rest are rolling windows worked out on every load.
type Range = "24h" | "7d" | "30d" | "month" | "all" | "reset";
const RANGES: { value: Exclude<Range, "reset">; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];
const RANGE_KEY = "dev-cost-tracker-range";
const SIDE_KEY = "dev-cost-tracker-side";
type Side = "left" | "right";
const readSide = (): Side => {
  if (typeof window === "undefined") return "right";
  try { return localStorage.getItem(SIDE_KEY) === "left" ? "left" : "right"; } catch { return "right"; }
};

interface RangeState { range: Range; resetAt?: string }

const readRange = (): RangeState => {
  if (typeof window === "undefined") return { range: "all" };
  try {
    const v = JSON.parse(localStorage.getItem(RANGE_KEY) || "null");
    if (v && typeof v.range === "string") return v;
  } catch { /* ignore */ }
  return { range: "all" };
};
const writeRange = (v: RangeState) => {
  try { localStorage.setItem(RANGE_KEY, JSON.stringify(v)); } catch { /* private mode */ }
};

function sinceFor({ range, resetAt }: RangeState): string {
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  switch (range) {
    case "24h": return new Date(now - day).toISOString();
    case "7d": return new Date(now - 7 * day).toISOString();
    case "30d": return new Date(now - 30 * day).toISOString();
    case "month": {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    }
    case "reset": return resetAt || new Date(now - day).toISOString();
    default: return new Date(0).toISOString();
  }
}

function rangeLabel(r: RangeState): string {
  if (r.range === "reset" && r.resetAt) return `since ${new Date(r.resetAt).toLocaleString()}`;
  return RANGES.find((x) => x.value === r.range)?.label.toLowerCase() ?? "all time";
}

const usd = (n: number) => `$${n.toFixed(4)}`;
const FLAGS: Record<string, string> = { EG: "🇪🇬", AE: "🇦🇪" };

const STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-500",
  SENT: "bg-sky-50 text-sky-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  READ: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-50 text-red-600",
};

export default function DevCostTracker() {
  const [open, setOpen] = useState(false);
  // Lazy init: localStorage is only read in the browser (readRange guards the server).
  const [range, setRangeState] = useState<RangeState>(readRange);
  const setRange = (v: RangeState) => { writeRange(v); setRangeState(v); };
  // Which bottom corner the bubble sits in; remembered per browser.
  const [side, setSideState] = useState<Side>(readSide);
  const toggleSide = () => {
    const next: Side = side === "right" ? "left" : "right";
    try { localStorage.setItem(SIDE_KEY, next); } catch { /* private mode */ }
    setSideState(next);
  };
  const [data, setData] = useState<DevBilling | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiDevBilling(sinceFor(range));
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }, [range]);

  // Poll fast while open, slowly while closed (the bubble still shows the total).
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, open ? 4000 : 20000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load, open]);

  // Status webhooks arrive as socket events for the active line; refresh on
  // them so delivered/billable shows up without waiting for the next poll.
  useEffect(() => {
    const socket = getSocket();
    const onEvent = () => load();
    socket.on("message.status_updated", onEvent);
    socket.on("message.created", onEvent);
    return () => {
      socket.off("message.status_updated", onEvent);
      socket.off("message.created", onEvent);
    };
  }, [load]);

  const resetNow = () => setRange({ range: "reset", resetAt: new Date().toISOString() });

  const t = data?.totals;
  const billedDelivered = data?.messages.some((m) => m.billable === true) ?? false;
  const alert = !!t && (t.paymentIssue || t.failed > 0);

  return (
    <div className={`fixed bottom-5 ${side === "left" ? "left-5" : "right-5"} z-[9999] font-sans flex flex-col ${side === "left" ? "items-start" : "items-end"}`}>
      {open && (
        <div className="mb-3 w-[400px] max-w-[calc(100vw-2.5rem)] max-h-[75vh] flex flex-col bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-900 text-white">
            <div>
              <p className="text-[13px] font-semibold">Message cost tracker</p>
              <p className="text-[11px] text-gray-400">
                Dev only · {rangeLabel(range)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={load} title="Refresh" className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button onClick={toggleSide} title={`Move to bottom ${side === "right" ? "left" : "right"}`} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={resetNow} title="Start counting from now" className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setOpen(false)} title="Close" className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-4 space-y-4 text-[12px]">
            {/* Period */}
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange({ range: r.value })}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors ${
                    range.range === r.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {r.label}
                </button>
              ))}
              {range.range === "reset" && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-900 text-white">Since reset</span>
              )}
            </div>

            {error && <p className="text-red-600">{error}</p>}

            {/* Payment verdict */}
            {t && (
              t.paymentIssue ? (
                <div className="rounded-xl p-3 bg-red-50 text-red-700">
                  <span className="font-semibold">Payment problem.</span> Meta rejected a send with code 131042. Check the payment method in WhatsApp Manager → Billing.
                </div>
              ) : billedDelivered ? (
                <div className="rounded-xl p-3 bg-emerald-50 text-emerald-800">
                  <span className="font-semibold">Billing works.</span> Meta delivered and billed at least one message.
                </div>
              ) : (
                <div className="rounded-xl p-3 bg-gray-50 text-gray-600">
                  No billed message yet. Send a <span className="font-semibold">template</span> to a test number — free replies inside the 24-hour window are never billed.
                </div>
              )
            )}

            {/* Totals */}
            {t && (
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Cost (USD)" value={usd(t.costUsd)} strong />
                <Stat label="Billable" value={t.billable} />
                <Stat label="Free" value={t.free} />
                <Stat label="Sent" value={t.sent + t.delivered + t.read} />
                <Stat label="Delivered" value={t.delivered + t.read} />
                <Stat label="Failed" value={t.failed} danger={t.failed > 0} />
              </div>
            )}
            {t && t.awaitingPricing > 0 && (
              <p className="text-gray-500">{t.awaitingPricing} waiting for Meta&apos;s pricing webhook.</p>
            )}
            {t && t.noRate > 0 && (
              <p className="text-amber-700">{t.noRate} billed to a country with no rate in the table — not counted in the cost.</p>
            )}

            {/* By category */}
            {t && Object.keys(t.byCategory).length > 0 && (
              <div>
                <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1.5">Billed by category</p>
                {Object.entries(t.byCategory).map(([cat, v]) => (
                  <div key={cat} className="flex justify-between py-0.5">
                    <span className="capitalize text-gray-600">{cat} × {v.count}</span>
                    <span className="font-medium text-gray-800">{usd(v.costUsd)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div>
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1.5">
                Messages{t && t.messages > (data?.messages.length ?? 0) ? ` · latest ${data?.messages.length} of ${t.messages}` : ""}
              </p>
              {data && data.messages.length === 0 && <p className="text-gray-400">No outbound messages in this period.</p>}
              <div className="space-y-2">
                {data?.messages.map((m) => (
                  <div key={m.id} className="border border-gray-100 rounded-xl p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-800 truncate">
                        {m.country ? `${FLAGS[m.country] ?? m.country} ` : ""}{m.to ? `+${m.to.replace(/^\+/, "")}` : "—"}
                        {m.name && <span className="text-gray-400 font-normal"> · {m.name}</span>}
                      </span>
                      <span className="font-semibold text-gray-800 shrink-0">
                        {m.costUsd === null ? (m.billable === true ? "no rate" : "…") : usd(m.costUsd)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${STATUS_CLASS[m.status ?? "PENDING"]}`}>{m.status ?? "PENDING"}</span>
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-gray-100 text-gray-600">{m.messageType}</span>
                      {m.pricingCategory && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-purple-50 text-purple-700">
                          {m.pricingCategory}{m.billable === false ? " · free" : ""}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto">{new Date(m.createdAt).toLocaleTimeString()}</span>
                    </div>
                    {m.preview && <p className="text-[11px] text-gray-500 mt-1 truncate">{m.preview}</p>}
                    {m.errorCode && (
                      <p className="text-[11px] text-red-600 mt-1">
                        {m.errorCode} · {m.errorTitle}{m.errorHint ? ` — ${m.errorHint}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Rates */}
            {data?.rates?.EG && (
              <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
                🇪🇬 rates: marketing {usd(data.rates.EG.marketing)} · utility {usd(data.rates.EG.utility)} · authentication {usd(data.rates.EG.authentication)} · service free.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bubble */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Message cost tracker (dev only)"
        className="flex items-center gap-2 pl-3 pr-4 h-11 rounded-full bg-gray-900 text-white shadow-xl hover:bg-gray-800 transition-colors cursor-pointer relative"
      >
        <Receipt className="w-4 h-4" />
        <span className="text-[13px] font-semibold">{t ? usd(t.costUsd) : "$—"}</span>
        {t && <span className="text-[11px] text-gray-400">{t.messages} msg</span>}
        {alert && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white" />}
      </button>
    </div>
  );
}

function Stat({ label, value, strong, danger }: { label: string; value: string | number; strong?: boolean; danger?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-xl px-2.5 py-2">
      <p className={`text-[15px] leading-none ${strong ? "font-bold text-gray-900" : "font-semibold text-gray-800"} ${danger ? "text-red-600" : ""}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-1">{label}</p>
    </div>
  );
}
