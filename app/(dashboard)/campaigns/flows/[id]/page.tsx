"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiCreateFlow, apiGetAssignableUsers, apiGetFlow, apiGetTemplates, apiUpdateFlow } from "@/lib/api";
import type { AssignableUser, Flow, FlowGraph, FlowValidationError, Template } from "@/types";
import { starterGraph } from "@/lib/flows";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { NoAccess } from "@/components/NoAccess";
import { PageSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { FlowBuilder } from "@/components/flows/FlowBuilder";
import { FlowResponses } from "@/components/flows/FlowResponses";

type Tab = "builder" | "responses";

export default function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const isNew = rawId === "new";
  const flowId = isNew ? null : Number(rawId);

  const router = useRouter();
  const { ready, can } = useCurrentUser();
  const canRead = can("campaign:read");
  const canWrite = can("campaign:write");
  const { success, error } = useToast();

  const [flow, setFlow] = useState<Flow | null>(null);
  const [graph, setGraph] = useState<FlowGraph | null>(isNew ? starterGraph() : null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [agents, setAgents] = useState<AssignableUser[]>([]);
  const [tab, setTab] = useState<Tab>("builder");
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<FlowValidationError[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !canRead) return;
    let cancelled = false;
    // Templates feed the Start step's "copy buttons" picker; agents feed Assign.
    // Pending (SUBMITTED) templates are included on purpose: a flow can be
    // built while Meta reviews its template. Nothing can trigger it early —
    // the campaign that sends the template still needs it APPROVED.
    Promise.all([
      apiGetTemplates({ status: "APPROVED", category: "CAMPAIGN" }),
      apiGetTemplates({ status: "SUBMITTED", category: "CAMPAIGN" }),
    ])
      .then(([approved, pending]) => { if (!cancelled) setTemplates([...approved.data, ...pending.data]); })
      .catch(() => {});
    apiGetAssignableUsers()
      .then((res) => { if (!cancelled) setAgents(res.data); })
      .catch(() => {});
    if (flowId) {
      apiGetFlow(flowId)
        .then((res) => {
          if (cancelled) return;
          setFlow(res.data);
          setGraph(res.data.graph);
          setName(res.data.name);
          setDescription(res.data.description || "");
        })
        .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load the flow"); });
    }
    return () => { cancelled = true; };
  }, [ready, canRead, flowId]);

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(async (g: FlowGraph): Promise<boolean> => {
    if (!name.trim()) {
      error("Give the flow a name first");
      return false;
    }
    setSaving(true);
    try {
      if (flowId) {
        const res = await apiUpdateFlow(flowId, { name, description, graph: g });
        setFlow((f) => (f ? { ...f, ...res.data } : f));
        setServerErrors([]);
        setDirty(false);
        success("Flow saved");
        return true;
      }
      const res = await apiCreateFlow({ name, description, graph: g, isActive: true });
      setServerErrors([]);
      setDirty(false);
      success("Flow created");
      router.replace(`/campaigns/flows/${res.data.id}`);
      return true;
    } catch (err) {
      const list = err instanceof ApiError && Array.isArray(err.details?.errors) ? (err.details.errors as FlowValidationError[]) : [];
      setServerErrors(list.length ? list : [{ message: err instanceof Error ? err.message : "Couldn't save" }]);
      error(list.length ? `The flow has ${list.length} problem${list.length > 1 ? "s" : ""} — they're marked on the steps` : err instanceof Error ? err.message : "Couldn't save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [flowId, name, description, router, success, error]);

  const toggleActive = async () => {
    if (!flow) return;
    try {
      const res = await apiUpdateFlow(flow.id, { isActive: !flow.isActive });
      setFlow({ ...flow, isActive: res.data.isActive });
    } catch (err) {
      error(err instanceof Error ? err.message : "Couldn't update the flow");
    }
  };

  if (!ready) return <PageSpinner />;
  if (!canRead) return <NoAccess what="flows" />;
  if (loadError) {
    return (
      <div className="p-8">
        <Link href="/campaigns/flows" className="text-[13px] text-gray-500 hover:text-gray-800">← Flows</Link>
        <p className="mt-6 text-[14px] text-red-600">{loadError}</p>
      </div>
    );
  }
  if (!graph) return <PageSpinner />;

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <header className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100">
        <Link href="/campaigns/flows" className="inline-flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Flows
        </Link>
        <div className="flex flex-col min-w-[240px] flex-1">
          <input
            value={name}
            disabled={!canWrite}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            placeholder="Flow name, e.g. Laser offer — October"
            className="text-[16px] font-bold text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 placeholder:text-gray-300"
          />
          <input
            value={description}
            disabled={!canWrite}
            onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
            placeholder="Description (optional)"
            className="text-[12px] text-gray-500 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 placeholder:text-gray-300"
          />
        </div>

        {flow && (
          <div className="flex items-center gap-2 text-[12px] text-gray-500">
            {flow.campaigns && flow.campaigns.length > 0 && (
              <span title={flow.campaigns.map((c) => c.name).join(", ")}>
                Used by {flow.campaigns.length} campaign{flow.campaigns.length > 1 ? "s" : ""}
              </span>
            )}
            <button
              type="button"
              disabled={!canWrite}
              onClick={toggleActive}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold disabled:opacity-50 ${flow.isActive ? "border-[#3B694C]/30 bg-[#EEF6F1] text-[#3B694C]" : "border-gray-200 bg-gray-50 text-gray-500"}`}
            >
              <span className={`w-2 h-2 rounded-full ${flow.isActive ? "bg-[#3B694C]" : "bg-gray-300"}`} />
              {flow.isActive ? "On" : "Off"}
            </button>
          </div>
        )}

        <div className="inline-flex bg-gray-50 border border-gray-100 rounded-lg p-1 gap-1">
          {(["builder", "responses"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={t === "responses" && !flow}
              onClick={() => setTab(t)}
              className={`text-[13px] font-semibold rounded-md px-3.5 py-1.5 transition-colors disabled:opacity-40 ${tab === t ? "bg-[#3B694C] text-white" : "text-gray-500 hover:text-gray-800"}`}
            >
              {t === "builder" ? "Builder" : `Responses${flow ? ` (${flow.runs.total})` : ""}`}
            </button>
          ))}
        </div>
      </header>

      {/* The builder stays mounted while Responses is open, so switching tabs
          never throws away unsaved edits on the canvas. */}
      <div className={`flex-1 min-h-0 ${tab === "builder" || !flow ? "flex" : "hidden"}`}>
        <ReactFlowProvider>
          <FlowBuilder
            initialGraph={graph}
            templates={templates}
            agents={agents}
            readOnly={!canWrite}
            saving={saving}
            serverErrors={serverErrors}
            onSave={save}
            onDirtyChange={setDirty}
          />
        </ReactFlowProvider>
      </div>
      {tab === "responses" && flow && <FlowResponses flowId={flow.id} flowName={flow.name} />}
    </div>
  );
}
