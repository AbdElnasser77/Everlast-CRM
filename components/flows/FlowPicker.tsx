"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Workflow } from "lucide-react";
import { apiGetFlow, apiGetFlows } from "@/lib/api";
import type { Flow, FlowSummary, Template } from "@/types";
import { templateStartButtons } from "@/lib/flows";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Pick the automation that answers a campaign's buttons. When a flow is
 * chosen, its Start buttons are checked against the template's quick replies:
 * a tap only starts the flow if the titles match.
 */
export function FlowPicker({
  template,
  flowId,
  onChange,
  disabled,
}: {
  template: Pick<Template, "buttons" | "cards"> | null;
  flowId: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
}) {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [detail, setDetail] = useState<Flow | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGetFlows().then((res) => { if (!cancelled) setFlows(res.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!flowId) return;
    let cancelled = false;
    apiGetFlow(flowId).then((res) => { if (!cancelled) setDetail(res.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [flowId]);

  const shown = detail && detail.id === flowId ? detail : null;

  const mismatch = useMemo(() => {
    if (!shown || !template) return null;
    const trigger = shown.graph.nodes.find((n) => n.type === "trigger");
    const flowButtons = trigger?.data.buttons || [];
    const expected = templateStartButtons(template);
    // Carousel taps are matched by card id (c<card>_<button>), others by title.
    const carousel = !!template.cards?.length;
    const same = (a: { id: string; title: string }, b: { id: string; title: string }) =>
      carousel ? a.id === b.id : norm(a.title) === norm(b.title);
    const unknown = flowButtons.filter((fb) => !expected.some((x) => same(x, fb))).map((b) => b.title);
    const unhandled = expected.filter((x) => !flowButtons.some((fb) => same(x, fb))).map((b) => b.title);
    return unknown.length || unhandled.length ? { unknown, unhandled } : null;
  }, [shown, template]);

  const options = flows.filter((f) => f.isActive || f.id === flowId);

  return (
    <div>
      <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        Automation flow <span className="normal-case font-normal text-gray-400">(optional)</span>
      </label>
      <div className="flex items-center gap-2">
        <Workflow className="w-4 h-4 text-gray-400 shrink-0" />
        <select
          disabled={disabled}
          value={flowId ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className="flex-1 px-3 py-2.5 text-[14px] border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C] disabled:opacity-60"
        >
          <option value="">None: replies go to the inbox only</option>
          {options.map((f) => (
            <option key={f.id} value={f.id}>{f.name}{f.isActive ? "" : " (off)"}</option>
          ))}
        </select>
        <Link href="/campaigns/flows" target="_blank" className="text-[12px] font-semibold text-[#3B694C] hover:underline shrink-0">
          Manage flows
        </Link>
      </div>
      <p className="text-[12px] text-gray-400 mt-1.5">
        When someone taps one of the template&apos;s buttons, the flow sends the next message automatically.
      </p>
      {flowId && mismatch && (
        <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            {mismatch.unhandled.length > 0 && (
              <p>Not handled by the flow: {mismatch.unhandled.map((t) => `“${t}”`).join(", ")} — taps on these go to the inbox only.</p>
            )}
            {mismatch.unknown.length > 0 && (
              <p>The flow expects {mismatch.unknown.map((t) => `“${t}”`).join(", ")}, which this template doesn&apos;t have.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
